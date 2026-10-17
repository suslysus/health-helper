package com.healthlog.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.os.Build;
import android.os.SystemClock;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "RunningTracker",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION })
    }
)
public final class RunningTrackerPlugin extends Plugin {
    private BroadcastReceiver stateReceiver;

    @Override public void load() {
        stateReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                String serialized = intent.getStringExtra(RunningTrackerService.EXTRA_SESSION);
                try {
                    JSObject event = new JSObject();
                    if (serialized == null) event.put("session", JSONObject.NULL);
                    else {
                        JSONObject internal = new JSONObject(serialized);
                        JSONObject visible = new JSONObject(internal.toString());
                        RunningSession.removeInternal(visible);
                        event.put("session", visible);
                    }
                    notifyListeners("runningState", event);
                } catch (JSONException ignored) { }
            }
        };
        ContextCompat.registerReceiver(getContext(), stateReceiver,
            new IntentFilter(RunningTrackerService.ACTION_STATE), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override protected void handleOnDestroy() {
        if (stateReceiver != null) {
            try { getContext().unregisterReceiver(stateReceiver); } catch (IllegalArgumentException ignored) { }
            stateReceiver = null;
        }
    }

    @PluginMethod public void start(PluginCall call) {
        String mode = call.getString("mode", "outdoor");
        if (!"outdoor".equals(mode) && !"treadmill".equals(mode)) {
            call.reject("mode must be outdoor or treadmill.");
            return;
        }
        if ("outdoor".equals(mode) && getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "locationPermissionCallback");
            return;
        }
        beginSession(call, mode);
    }

    @PermissionCallback private void locationPermissionCallback(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("정확한 야외 거리 기록을 위해 위치 권한을 허용해 주세요.");
            return;
        }
        beginSession(call, "outdoor");
    }

    private void beginSession(PluginCall call, String mode) {
        synchronized (RunningTrackerService.STATE_LOCK) { beginSessionLocked(call, mode); }
    }

    private void beginSessionLocked(PluginCall call, String mode) {
        JSONObject existing = RunningTrackerService.readState(getContext());
        if (existing != null) {
            call.reject("A previous run is still waiting to be saved. Save it before starting another.");
            return;
        }
        if ("outdoor".equals(mode)) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                call.reject("정확한 위치 권한이 필요합니다. 앱 설정에서 정밀 위치를 허용해 주세요.");
                return;
            }
            LocationManager locations = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
            if (locations == null || !locations.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                call.reject("GPS가 꺼져 있습니다. 위치 서비스를 켠 뒤 다시 시작해 주세요.");
                return;
            }
        }
        try {
            JSONObject plan = call.getObject("plan", new JSObject());
            JSONObject state = RunningSession.newSession(call.getString("date"), call.getString("pplType"), mode, plan, SystemClock.elapsedRealtime());
            state.put("_heartbeatElapsedRealtime", SystemClock.elapsedRealtime());
            state.put("_confirmedElapsedMs", 0);
            if ("outdoor".equals(mode)) state.put("_serviceRequestedElapsedRealtime", SystemClock.elapsedRealtime());
            RunningTrackerService.saveState(getContext(), state);
            if ("outdoor".equals(mode)) startService(RunningTrackerService.ACTION_START);
            emitState(state);
            resolveSession(call, state);
        } catch (JSONException | RuntimeException e) {
            synchronized (RunningTrackerService.STATE_LOCK) {
                JSONObject current = RunningTrackerService.readState(getContext());
                if (current != null && "running".equals(current.optString("status"))) {
                    getContext().getSharedPreferences(RunningTrackerService.PREFS, Context.MODE_PRIVATE).edit().remove(RunningTrackerService.KEY_STATE).apply();
                    if ("outdoor".equals(mode)) stopService(RunningTrackerService.ACTION_STOP);
                }
            }
            call.reject(e.getMessage() == null ? "Could not start run." : e.getMessage());
        }
    }

    @PluginMethod public void pause(PluginCall call) {
        synchronized (RunningTrackerService.STATE_LOCK) { changeStatus(call); }
    }

    @PluginMethod public void resume(PluginCall call) {
        synchronized (RunningTrackerService.STATE_LOCK) { resumeLocked(call); }
    }

    private void resumeLocked(PluginCall call) {
        JSONObject state = RunningTrackerService.readState(getContext());
        if (state == null || !"paused".equals(state.optString("status"))) {
            call.reject("No paused run is available to resume.");
            return;
        }
        if ("outdoor".equals(state.optString("mode"))) {
            if (getPermissionState("location") != PermissionState.GRANTED || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                call.reject("정확한 위치 권한이 필요합니다.");
                return;
            }
            LocationManager locations = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
            if (locations == null || !locations.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                call.reject("GPS가 꺼져 있습니다. 위치 서비스를 켠 뒤 다시 시작해 주세요.");
                return;
            }
        }
        try {
            long now = SystemClock.elapsedRealtime();
            long elapsedMs = state.optLong("_activeElapsedMs", state.optLong("elapsedMs", 0));
            state.put("_activeElapsedMs", elapsedMs);
            state.put("elapsedMs", elapsedMs);
            state.put("status", "running");
            state.put("_anchorElapsedRealtime", now);
            state.put("_heartbeatElapsedRealtime", now);
            if ("outdoor".equals(state.optString("mode"))) state.put("_serviceRequestedElapsedRealtime", now);
            state.put("_lastPointElapsedRealtime", 0);
            state.put("_distanceAnchor", JSONObject.NULL);
            state.put("_movementCandidate", JSONObject.NULL);
            state.put("_needsAnchorReset", true);
            state.put("gpsStatus", "outdoor".equals(state.optString("mode")) ? "waiting" : "unavailable");
            RunningTrackerService.saveState(getContext(), state);
            if ("outdoor".equals(state.optString("mode"))) startService(RunningTrackerService.ACTION_RESUME);
            emitState(state);
            resolveSession(call, state);
        } catch (JSONException | RuntimeException e) {
            if ("outdoor".equals(state.optString("mode"))) {
                try {
                    long frozen = state.optLong("_activeElapsedMs", state.optLong("elapsedMs", 0));
                    state.put("_activeElapsedMs", frozen);
                    state.put("elapsedMs", frozen);
                    state.put("_anchorElapsedRealtime", 0);
                    state.put("status", "paused");
                    state.put("gpsStatus", "unavailable");
                    state.put("_needsAnchorReset", true);
                    state.put("_distanceAnchor", JSONObject.NULL);
                    state.put("_movementCandidate", JSONObject.NULL);
                    RunningTrackerService.saveState(getContext(), state);
                    stopService(RunningTrackerService.ACTION_STOP);
                    emitState(state);
                } catch (JSONException ignored) { }
            }
            call.reject(e.getMessage());
        }
    }

    private void changeStatus(PluginCall call) {
        JSONObject state = RunningTrackerService.readState(getContext());
        if (state == null || !"running".equals(state.optString("status"))) {
            call.reject("No running session is available to pause.");
            return;
        }
        try {
            long now = SystemClock.elapsedRealtime();
            RunningTrackerService.advanceIntervals(state, now);
            long elapsedMs = RunningSession.elapsed(state, now);
            state.put("_activeElapsedMs", elapsedMs);
            state.put("elapsedMs", elapsedMs);
            state.put("_confirmedElapsedMs", elapsedMs);
            state.put("_heartbeatElapsedRealtime", now);
            state.put("_anchorElapsedRealtime", 0);
            state.put("status", "paused");
            RunningSession.appendCurrentEndpoint(state);
            state.put("_distanceAnchor", JSONObject.NULL);
            state.put("_movementCandidate", JSONObject.NULL);
            state.put("_needsAnchorReset", true);
            state.put("gpsStatus", "outdoor".equals(state.optString("mode")) ? "stopped" : "unavailable");
            RunningTrackerService.saveState(getContext(), state);
            if ("outdoor".equals(state.optString("mode"))) stopService(RunningTrackerService.ACTION_STOP);
            emitState(state);
            resolveSession(call, state);
        } catch (JSONException e) { call.reject(e.getMessage()); }
    }

    @PluginMethod public void lap(PluginCall call) {
        synchronized (RunningTrackerService.STATE_LOCK) { lapLocked(call); }
    }

    private void lapLocked(PluginCall call) {
        JSONObject state = RunningTrackerService.readState(getContext());
        if (state == null || !"running".equals(state.optString("status"))) {
            call.reject("A run must be active to record a lap.");
            return;
        }
        try {
            long now = SystemClock.elapsedRealtime();
            RunningTrackerService.advanceIntervals(state, now);
            long elapsed = RunningSession.elapsed(state, now);
            org.json.JSONArray laps = state.optJSONArray("laps");
            long previousElapsed = laps == null || laps.length() == 0 ? 0 : laps.optJSONObject(laps.length() - 1).optLong("totalElapsedMs", 0);
            double previousDistance = laps == null || laps.length() == 0 ? 0 : laps.optJSONObject(laps.length() - 1).optDouble("totalDistanceMeters", 0);
            if (elapsed <= previousElapsed && RunningSession.totalDistance(state) <= previousDistance) {
                RunningTrackerService.saveState(getContext(), state);
                emitState(state);
                resolveSession(call, state);
                return;
            }
            String phase = state.optString("phase", "easy");
            JSONObject plan = state.optJSONObject("plan");
            if (plan != null && "interval".equals(plan.optString("type")) && "work".equals(phase)) {
                RunningSession.appendLap(state, "work", elapsed);
                state.put("phase", state.optInt("intervalIndex", 1) >= plan.optInt("repetitions", 4) ? "cooldown" : "recovery");
                state.put("_phaseStartElapsedMs", elapsed);
                state.put("_phaseStartDistanceMeters", RunningSession.totalDistance(state));
            } else if (plan != null && "interval".equals(plan.optString("type")) && "recovery".equals(phase)) {
                RunningSession.appendLap(state, "recovery", elapsed);
                state.put("phase", "work");
                state.put("intervalIndex", state.optInt("intervalIndex", 1) + 1);
                state.put("_phaseStartElapsedMs", elapsed);
                state.put("_phaseStartDistanceMeters", RunningSession.totalDistance(state));
            } else RunningSession.appendLap(state, "manual", elapsed);
            RunningTrackerService.saveState(getContext(), state);
            emitState(state);
            resolveSession(call, state);
        } catch (JSONException e) { call.reject(e.getMessage()); }
    }

    @PluginMethod public void finish(PluginCall call) {
        synchronized (RunningTrackerService.STATE_LOCK) { finishLocked(call); }
    }

    private void finishLocked(PluginCall call) {
        JSONObject state = RunningTrackerService.readState(getContext());
        if (state == null || (!"running".equals(state.optString("status")) && !"paused".equals(state.optString("status")))) {
            call.reject("No active run is available to finish.");
            return;
        }
        try {
            long now = SystemClock.elapsedRealtime();
            RunningTrackerService.advanceIntervals(state, now);
            long elapsed = RunningSession.elapsed(state, now);
            boolean manualDistanceProvided = call.getData().has("manualDistanceMeters");
            double manualDistance = call.getDouble("manualDistanceMeters", -1d);
            if (manualDistanceProvided && (!"treadmill".equals(state.optString("mode"))
                || !Double.isFinite(manualDistance) || manualDistance < 0)) {
                call.reject("manualDistanceMeters must be a finite nonnegative treadmill distance.");
                return;
            }
            state.put("_activeElapsedMs", elapsed);
            state.put("_anchorElapsedRealtime", 0);
            state.put("elapsedMs", elapsed);
            if (manualDistanceProvided) state.put("distanceMeters", manualDistance);
            RunningSession.appendCurrentEndpoint(state);
            org.json.JSONArray laps = state.optJSONArray("laps");
            long priorElapsed = laps == null || laps.length() == 0 ? 0 : laps.optJSONObject(laps.length() - 1).optLong("totalElapsedMs", 0);
            double priorDistance = laps == null || laps.length() == 0 ? 0 : laps.optJSONObject(laps.length() - 1).optDouble("totalDistanceMeters", 0);
            double totalDistance = RunningSession.totalDistance(state);
            long remainingElapsed = Math.max(0, elapsed - priorElapsed);
            double remainingDistance = "treadmill".equals(state.optString("mode")) ? 0 : Math.max(0, totalDistance - priorDistance);
            if (remainingElapsed > 0 || remainingDistance > 0) {
                String phase = state.optString("phase", "easy");
                String kind = "work".equals(phase) || "recovery".equals(phase) ? phase : "manual";
                double lapTotalDistance = "treadmill".equals(state.optString("mode")) ? priorDistance : totalDistance;
                RunningSession.appendPartialLap(state, kind, elapsed, lapTotalDistance, remainingElapsed, remainingDistance);
            }
            state.put("status", "completed");
            state.put("gpsStatus", "outdoor".equals(state.optString("mode")) ? "stopped" : "unavailable");
            RunningTrackerService.saveState(getContext(), state);
            if ("outdoor".equals(state.optString("mode"))) stopService(RunningTrackerService.ACTION_STOP);
            emitState(state);
            resolveSession(call, state);
        } catch (JSONException e) { call.reject(e.getMessage()); }
    }

    @PluginMethod public void getState(PluginCall call) {
        synchronized (RunningTrackerService.STATE_LOCK) { getStateLocked(call); }
    }

    @PluginMethod public void acknowledgeFinished(PluginCall call) {
        synchronized (RunningTrackerService.STATE_LOCK) {
            JSONObject state = RunningTrackerService.readState(getContext());
            String requestedId = call.getString("id", "");
            if (state != null && "completed".equals(state.optString("status"))
                && requestedId.equals(state.optString("id"))) {
                RunningTrackerService.clearState(getContext());
                RunningTrackerService.broadcastCleared(getContext());
                JSObject result = new JSObject();
                result.put("session", JSONObject.NULL);
                call.resolve(result);
            } else resolveSession(call, state);
        }
    }

    private void getStateLocked(PluginCall call) {
        JSONObject state = RunningTrackerService.readState(getContext());
        if (state != null && "running".equals(state.optString("status"))) {
            long now = SystemClock.elapsedRealtime();
            long heartbeat = state.optLong("_heartbeatElapsedRealtime", state.optLong("_anchorElapsedRealtime", 0));
            boolean rebooted = (heartbeat > 0 && now < heartbeat) || (state.optLong("_anchorElapsedRealtime", 0) > 0 && now < state.optLong("_anchorElapsedRealtime"));
            long serviceRequestedAt = state.optLong("_serviceRequestedElapsedRealtime", heartbeat);
            boolean staleService = "outdoor".equals(state.optString("mode")) && !RunningTrackerService.isTracking
                && (serviceRequestedAt <= 0 || now - serviceRequestedAt > 10_000);
            if (rebooted || staleService) {
                long confirmed = Math.max(0, state.optLong("_confirmedElapsedMs", state.optLong("_activeElapsedMs", 0)));
                try {
                    state.put("_activeElapsedMs", confirmed);
                    state.put("elapsedMs", confirmed);
                    state.put("_anchorElapsedRealtime", 0);
                    state.put("status", "paused");
                    state.put("gpsStatus", "stopped");
                    state.put("_needsAnchorReset", true);
                    state.put("_distanceAnchor", JSONObject.NULL);
                    state.put("_movementCandidate", JSONObject.NULL);
                    RunningSession.appendCurrentEndpoint(state);
                    if (rebooted) {
                        state.put("_lastFix", JSONObject.NULL);
                        state.put("_lastPointElapsedRealtime", 0);
                        state.put("_segment", state.optInt("_segment", 0) + 1);
                    }
                    RunningTrackerService.saveState(getContext(), state);
                    RunningTrackerService.broadcastState(getContext(), state);
                } catch (JSONException ignored) { }
            }
        }
        if (state != null && "running".equals(state.optString("status"))) {
            try {
                RunningTrackerService.advanceIntervals(state, SystemClock.elapsedRealtime());
                RunningTrackerService.saveState(getContext(), state);
            } catch (JSONException ignored) { }
        }
        resolveSession(call, state);
    }

    private void startService(String action) {
        Intent intent = new Intent(getContext(), RunningTrackerService.class).setAction(action);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(intent);
        else getContext().startService(intent);
    }

    private void stopService(String action) { getContext().stopService(new Intent(getContext(), RunningTrackerService.class)); }

    private void emitState(JSONObject internal) throws JSONException {
        RunningTrackerService.broadcastState(getContext(), internal);
    }

    private void resolveSession(PluginCall call, JSONObject internal) {
        try {
            JSONObject snapshot = internal == null ? new JSONObject().put("session", JSONObject.NULL)
                : RunningSession.snapshot(internal, SystemClock.elapsedRealtime());
            JSObject result = new JSObject();
            result.put("session", snapshot.opt("session"));
            call.resolve(result);
        } catch (JSONException e) { call.reject(e.getMessage()); }
    }
}
