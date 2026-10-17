package com.healthlog.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class RunningTrackerService extends Service {
    static final String ACTION_START = "com.healthlog.app.running.START";
    static final String ACTION_RESUME = "com.healthlog.app.running.RESUME";
    static final String ACTION_STOP = "com.healthlog.app.running.STOP";
    static final String ACTION_STATE = "com.healthlog.app.running.STATE";
    static final String EXTRA_SESSION = "session";
    static final String PREFS = "healthlog_running_session";
    static final String KEY_STATE = "state";
    static final String CHANNEL_ID = "healthlog_running";
    static final int NOTIFICATION_ID = 7402;
    static final Object STATE_LOCK = new Object();
    static volatile boolean isTracking;

    private LocationManager locationManager;
    private final android.os.Handler handler = new android.os.Handler(Looper.getMainLooper());
    private LocationListener locationListener;
    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            JSONObject state;
            synchronized (STATE_LOCK) {
                state = readState(RunningTrackerService.this);
                if (state == null || !"running".equals(state.optString("status"))) return;
                try {
                    long now = SystemClock.elapsedRealtime();
                    advanceIntervals(state, now);
                    long lastPoint = state.optLong("_lastPointElapsedRealtime", 0);
                    if (lastPoint > 0 && now - lastPoint > 8_000 && "active".equals(state.optString("gpsStatus"))) {
                        state.put("gpsStatus", "poor");
                        state.put("_distanceAnchor", JSONObject.NULL);
                        state.put("_movementCandidate", JSONObject.NULL);
                        state.put("_needsAnchorReset", true);
                    }
                    state.put("_heartbeatElapsedRealtime", now);
                    state.put("_confirmedElapsedMs", RunningSession.elapsed(state, now));
                    saveState(RunningTrackerService.this, state);
                } catch (JSONException ignored) { }
            }
            broadcastState(RunningTrackerService.this, state);
            updateNotification(state);
            handler.postDelayed(this, 1000);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        isTracking = false;
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        createNotificationChannel();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            isTracking = false;
            stopTracking();
            stopSelf();
            return START_NOT_STICKY;
        }
        JSONObject state = readState(this);
        if (state == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        try { startForeground(NOTIFICATION_ID, notification(state)); }
        catch (RuntimeException e) {
            failAndPause(state);
            stopSelf();
            return START_NOT_STICKY;
        }
        if ("running".equals(state.optString("status")) && "outdoor".equals(state.optString("mode"))) {
            try { startLocationUpdates(); isTracking = true; }
            catch (SecurityException | IllegalArgumentException e) {
                failAndPause(state);
                stopTracking();
                stopSelf();
                return START_NOT_STICKY;
            }
        }
        handler.removeCallbacks(ticker);
        handler.post(ticker);
        return START_NOT_STICKY;
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public void onDestroy() {
        isTracking = false;
        handler.removeCallbacks(ticker);
        stopTracking();
        super.onDestroy();
    }

    private void startLocationUpdates() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
            throw new SecurityException("Precise location permission is required.");
        if (!locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER))
            throw new IllegalArgumentException("GPS is turned off. Turn on location and try again.");
        stopTracking();
        locationListener = new LocationListener() {
            @Override public void onLocationChanged(Location location) {
                JSONObject state;
                boolean changed = false;
                synchronized (STATE_LOCK) {
                    state = readState(RunningTrackerService.this);
                    if (state == null || !"running".equals(state.optString("status"))) return;
                    try {
                        changed = RunningSession.acceptLocation(state, location, SystemClock.elapsedRealtime());
                        if (changed) advanceIntervals(state, SystemClock.elapsedRealtime());
                        saveState(RunningTrackerService.this, state);
                    } catch (JSONException ignored) { }
                }
                if (changed || "poor".equals(state.optString("gpsStatus"))) broadcastState(RunningTrackerService.this, state);
            }
            @Override public void onProviderEnabled(String provider) { }
            @Override public void onProviderDisabled(String provider) { updateGpsStatus("unavailable"); }
            @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
        };
        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, locationListener, Looper.getMainLooper());
    }

    private void stopTracking() {
        isTracking = false;
        if (locationManager != null && locationListener != null) {
            try { locationManager.removeUpdates(locationListener); } catch (SecurityException ignored) { }
            locationListener = null;
        }
    }

    private void updateGpsStatus(String status) {
        JSONObject state;
        synchronized (STATE_LOCK) {
            state = readState(this);
            if (state == null) return;
            try {
                state.put("gpsStatus", status);
                if ("unavailable".equals(status) || "poor".equals(status)) {
                    state.put("_distanceAnchor", JSONObject.NULL);
                    state.put("_movementCandidate", JSONObject.NULL);
                    state.put("_needsAnchorReset", true);
                }
                saveState(this, state);
            } catch (JSONException ignored) { return; }
        }
        broadcastState(this, state);
    }

    private void failAndPause(JSONObject state) {
        synchronized (STATE_LOCK) {
            JSONObject latest = readState(this);
            if (latest != null) state = latest;
            if (!"running".equals(state.optString("status"))) return;
            long confirmed = state.optLong("_confirmedElapsedMs", state.optLong("_activeElapsedMs", 0));
            try {
                state.put("_activeElapsedMs", confirmed);
                state.put("elapsedMs", confirmed);
                state.put("_anchorElapsedRealtime", 0);
                state.put("status", "paused");
                state.put("gpsStatus", "unavailable");
                state.put("_needsAnchorReset", true);
                state.put("_distanceAnchor", JSONObject.NULL);
                state.put("_movementCandidate", JSONObject.NULL);
                RunningSession.appendCurrentEndpoint(state);
                saveState(this, state);
            } catch (JSONException ignored) { }
        }
        broadcastState(this, state);
    }

    private void updateNotification(JSONObject state) {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(NOTIFICATION_ID, notification(state));
    }

    private Notification notification(JSONObject state) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(this, 7402, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String phase = state.optString("phase", "easy");
        String phaseText = "recovery".equals(phase) ? "회복 구간" : "work".equals(phase) ? "빠른 구간" : "이지런";
        long seconds = RunningSession.elapsed(state, SystemClock.elapsedRealtime()) / 1000;
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("러닝 기록 중 · " + phaseText)
            .setContentText(String.format(java.util.Locale.KOREA, "%d:%02d · %.2f km", seconds / 60, seconds % 60, RunningSession.totalDistance(state) / 1000.0))
            .setContentIntent(pending)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "러닝 기록", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("야외 러닝 기록이 진행 중임을 표시합니다.");
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
        }
    }

    static JSONObject readState(Context context) {
        synchronized (STATE_LOCK) {
            String value = context.getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_STATE, null);
            if (value == null) return null;
            try { return new JSONObject(value); } catch (JSONException e) { return null; }
        }
    }

    static void saveState(Context context, JSONObject state) {
        synchronized (STATE_LOCK) { context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_STATE, state.toString()).apply(); }
    }

    static void clearState(Context context) {
        synchronized (STATE_LOCK) { context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(KEY_STATE).apply(); }
    }

    static void broadcastCleared(Context context) {
        Intent intent = new Intent(ACTION_STATE);
        intent.setPackage(context.getPackageName());
        context.sendBroadcast(intent);
    }

    static void broadcastState(Context context, JSONObject state) {
        try {
            JSONObject snapshot = RunningSession.snapshot(state, SystemClock.elapsedRealtime());
            state = snapshot.optJSONObject("session");
        } catch (JSONException ignored) { }
        Intent intent = new Intent(ACTION_STATE);
        intent.setPackage(context.getPackageName());
        intent.putExtra(EXTRA_SESSION, state.toString());
        context.sendBroadcast(intent);
    }

    static void advanceIntervals(JSONObject state, long now) throws JSONException {
        JSONObject plan = state.optJSONObject("plan");
        if (plan == null) return;
        long elapsed = RunningSession.elapsed(state, now);
        double distance = RunningSession.totalDistance(state);
        String phase = state.optString("phase", "work");
        long phaseStart = state.optLong("_phaseStartElapsedMs", 0);
        double distanceStart = state.optDouble("_phaseStartDistanceMeters", 0);
        int intervalIndex = state.optInt("intervalIndex", 1);
        int repetitions = Math.max(1, plan.optInt("repetitions", 4));
        long recoveryMs = Math.max(0, plan.optLong("recoveryDurationSeconds", 60)) * 1000L;
        if ("easy".equals(plan.optString("type"))) {
            if ("easy".equals(phase) && ((plan.optLong("targetDurationSeconds", 0) > 0 && elapsed >= plan.optLong("targetDurationSeconds") * 1000L)
                || (plan.optDouble("targetDistanceMeters", 0) > 0 && distance >= plan.optDouble("targetDistanceMeters")))) {
                state.put("phase", "cooldown");
                state.put("_phaseStartElapsedMs", plan.optLong("targetDurationSeconds", 0) > 0
                    && elapsed >= plan.optLong("targetDurationSeconds") * 1000L
                    ? plan.optLong("targetDurationSeconds") * 1000L : elapsed);
            }
            double autoLap = plan.optDouble("autoLapDistanceMeters", 0);
            double lastAutoLap = state.optDouble("_lastAutoLapMeters", 0);
            if (autoLap > 0 && distance - lastAutoLap >= autoLap) {
                int crossings = (int) Math.floor((distance - lastAutoLap) / autoLap);
                for (int i = 0; i < crossings; i++) RunningSession.appendAutoLap(state, elapsed, lastAutoLap + autoLap * (i + 1));
                state.put("_lastAutoLapMeters", lastAutoLap + crossings * autoLap);
            }
            return;
        }
        for (int step = 0; step < repetitions * 2 + 2; step++) {
            phase = state.optString("phase", "work");
            phaseStart = state.optLong("_phaseStartElapsedMs", 0);
            distanceStart = state.optDouble("_phaseStartDistanceMeters", 0);
            intervalIndex = state.optInt("intervalIndex", 1);
            if ("recovery".equals(phase)) {
                long recoveryEndsAt = phaseStart + recoveryMs;
                if (elapsed < recoveryEndsAt) break;
                RunningSession.appendLap(state, "recovery", recoveryEndsAt);
                state.put("phase", "work");
                state.put("intervalIndex", intervalIndex + 1);
                state.put("_phaseStartElapsedMs", recoveryEndsAt);
                state.put("_phaseStartDistanceMeters", distance);
                state.remove("_phaseDistanceReachedElapsedMs");
                continue;
            }
            if (!"work".equals(phase)) break;
            long workEndsAt = plan.optLong("workDurationSeconds", 0) > 0
                ? phaseStart + plan.optLong("workDurationSeconds") * 1000L : Long.MAX_VALUE;
            boolean distanceDone = plan.optDouble("workDistanceMeters", 0) > 0
                && distance - distanceStart >= plan.optDouble("workDistanceMeters", 250);
            long distanceEndsAt = state.optLong("_phaseDistanceReachedElapsedMs", elapsed);
            boolean timeDone = elapsed >= workEndsAt;
            if (!distanceDone && !timeDone) break;
            long workCompletedAt = Math.min(distanceDone ? distanceEndsAt : Long.MAX_VALUE,
                timeDone ? workEndsAt : Long.MAX_VALUE);
            RunningSession.appendLap(state, "work", workCompletedAt);
            if (intervalIndex >= repetitions) {
                state.put("phase", "cooldown");
                state.put("_phaseStartElapsedMs", workCompletedAt);
            } else {
                state.put("phase", "recovery");
                state.put("_phaseStartElapsedMs", workCompletedAt);
                state.put("_phaseStartDistanceMeters", distance);
            }
            state.remove("_phaseDistanceReachedElapsedMs");
        }
    }
}
