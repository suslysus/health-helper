package com.healthlog.app;

import android.location.Location;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Small JSON-backed session model shared by the plugin and foreground service. */
final class RunningSession {
    private RunningSession() {}

    static JSONObject newSession(String date, String pplType, String mode, JSONObject plan, long now) throws JSONException {
        JSONObject state = new JSONObject();
        state.put("id", "run-" + java.util.UUID.randomUUID());
        state.put("date", date == null ? "" : date);
        state.put("pplType", pplType == null ? "" : pplType);
        state.put("mode", mode);
        state.put("plan", plan == null ? new JSONObject() : plan);
        state.put("status", "running");
        state.put("startedAt", System.currentTimeMillis());
        state.put("elapsedMs", 0);
        state.put("distanceMeters", 0);
        state.put("track", new JSONArray());
        state.put("laps", new JSONArray());
        state.put("accuracyMeters", JSONObject.NULL);
        state.put("gpsStatus", "outdoor".equals(mode) ? "waiting" : "unavailable");
        state.put("phase", "easy".equals(plan == null ? "" : plan.optString("type", "easy")) ? "easy" : "work");
        state.put("intervalIndex", 1);
        state.put("_activeElapsedMs", 0);
        state.put("_anchorElapsedRealtime", now);
        state.put("_lastPointElapsedRealtime", 0);
        state.put("_heartbeatElapsedRealtime", now);
        state.put("_confirmedElapsedMs", 0);
        state.put("_segment", 0);
        state.put("_phaseDistanceMeters", 0);
        state.put("_lastFix", JSONObject.NULL);
        state.put("_previousAcceptedPoint", JSONObject.NULL);
        state.put("_latestAcceptedPoint", JSONObject.NULL);
        state.put("_lastRouteSampleElapsedMs", -1);
        state.put("_distanceAnchor", JSONObject.NULL);
        state.put("_movementCandidate", JSONObject.NULL);
        state.put("_needsAnchorReset", false);
        state.put("_lastAutoLapMeters", 0);
        state.put("_phaseStartElapsedMs", 0);
        state.put("_phaseStartDistanceMeters", 0);
        return state;
    }

    static long elapsed(JSONObject state, long now) {
        long total = state.optLong("_activeElapsedMs", 0);
        if ("running".equals(state.optString("status"))) {
            long anchor = state.optLong("_anchorElapsedRealtime", now);
            if (now >= anchor) total += now - anchor;
        }
        return Math.max(0, total);
    }

    static JSONObject snapshot(JSONObject stored, long now) throws JSONException {
        if (stored == null) return new JSONObject().put("session", JSONObject.NULL);
        JSONObject state = new JSONObject(stored.toString());
        state.put("elapsedMs", elapsed(state, now));
        removeInternal(state);
        JSONObject result = new JSONObject();
        result.put("session", state);
        return result;
    }

    static double totalDistance(JSONObject state) {
        return Math.max(0, state.optDouble("distanceMeters", 0));
    }

    static boolean acceptLocation(JSONObject state, Location location, long now) throws JSONException {
        if (!"running".equals(state.optString("status")) || !"outdoor".equals(state.optString("mode"))) return false;
        long callback = location.getElapsedRealtimeNanos() / 1_000_000L;
        if (callback <= 0) callback = now;
        double accuracy = location.hasAccuracy() ? location.getAccuracy() : Double.NaN;
        RunningGpsFilter filter = new RunningGpsFilter(
            readFix(state.optJSONObject("_lastFix")),
            readFix(state.optJSONObject("_distanceAnchor")),
            readFix(state.optJSONObject("_movementCandidate")),
            state.optBoolean("_needsAnchorReset", false),
            totalDistance(state), state.optInt("_segment", 0));
        RunningGpsFilter.Fix fix = new RunningGpsFilter.Fix(location.getLatitude(), location.getLongitude(), accuracy, callback, location.getTime());
        RunningGpsFilter.Result result = filter.accept(fix, now);
        if (!result.accepted) {
            state.put("gpsStatus", "poor");
            state.put("_distanceAnchor", JSONObject.NULL);
            state.put("_movementCandidate", JSONObject.NULL);
            state.put("_needsAnchorReset", true);
            return false;
        }
        long elapsed = elapsed(state, now);
        JSONArray track = state.optJSONArray("track");
        if (track == null) { track = new JSONArray(); state.put("track", track); }
        state.put("distanceMeters", result.distanceMeters);
        state.put("accuracyMeters", accuracy);
        state.put("gpsStatus", "active");
        JSONObject point = new JSONObject();
        point.put("latitude", location.getLatitude());
        point.put("longitude", location.getLongitude());
        point.put("accuracy", accuracy);
        point.put("timestamp", location.getTime());
        point.put("elapsedMs", elapsed);
        point.put("distanceMeters", result.distanceMeters);
        point.put("segment", result.segment);
        JSONObject previousRaw = state.optJSONObject("_latestAcceptedPoint");
        state.put("_previousAcceptedPoint", previousRaw == null ? JSONObject.NULL : new JSONObject(previousRaw.toString()));
        state.put("_latestAcceptedPoint", new JSONObject(point.toString()));
        JSONObject lastRoutePoint = track.length() > 0 ? track.optJSONObject(track.length() - 1) : null;
        long lastRouteElapsed = lastRoutePoint == null ? -1 : lastRoutePoint.optLong("elapsedMs", -1);
        int lastRouteSegment = lastRoutePoint == null ? -1 : lastRoutePoint.optInt("segment", -1);
        // Store a compact route at roughly 5-second spacing. Always keep the first
        // point and a new segment's first point; the raw latest pair stays internal.
        if (lastRoutePoint == null || lastRouteSegment != result.segment || elapsed - lastRouteElapsed >= 5_000) {
            track.put(point);
            state.put("_lastRouteSampleElapsedMs", elapsed);
        }
        state.put("_lastPointElapsedRealtime", now);
        state.put("_lastFix", writeFix(result.fix));
        state.put("_distanceAnchor", filter.distanceAnchor() == null ? JSONObject.NULL : writeFix(filter.distanceAnchor()));
        state.put("_movementCandidate", filter.movementCandidate() == null ? JSONObject.NULL : writeFix(filter.movementCandidate()));
        state.put("_needsAnchorReset", filter.needsAnchorReset());
        state.put("_segment", result.segment);
        state.put("_phaseDistanceMeters", state.optDouble("_phaseDistanceMeters", 0)
            + ("work".equals(state.optString("phase")) ? result.distanceDeltaMeters : 0));
        JSONObject plan = state.optJSONObject("plan");
        if (plan != null && "work".equals(state.optString("phase")) && plan.optDouble("workDistanceMeters", 0) > 0) {
            double phaseStart = state.optDouble("_phaseStartDistanceMeters", 0);
            if (phaseStart + plan.optDouble("workDistanceMeters", 0) <= result.distanceMeters
                && phaseStart + plan.optDouble("workDistanceMeters", 0) > result.distanceMeters - result.distanceDeltaMeters) {
                state.put("_phaseDistanceReachedElapsedMs", elapsed);
            }
        }
        return true;
    }

    private static RunningGpsFilter.Fix readFix(JSONObject object) {
        if (object == null) return null;
        return new RunningGpsFilter.Fix(object.optDouble("latitude", Double.NaN), object.optDouble("longitude", Double.NaN),
            object.optDouble("accuracyMeters", Double.NaN), object.optLong("elapsedRealtimeMs", 0), object.optLong("timestampMs", 0));
    }

    private static JSONObject writeFix(RunningGpsFilter.Fix fix) throws JSONException {
        JSONObject object = new JSONObject();
        object.put("latitude", fix.latitude);
        object.put("longitude", fix.longitude);
        object.put("accuracyMeters", fix.accuracyMeters);
        object.put("elapsedRealtimeMs", fix.elapsedRealtimeMs);
        object.put("timestampMs", fix.timestampMs);
        return object;
    }

    static void appendLap(JSONObject state, String kind, long elapsed) throws JSONException {
        JSONArray laps = state.optJSONArray("laps");
        if (laps == null) { laps = new JSONArray(); state.put("laps", laps); }
        double distance = totalDistance(state);
        JSONObject lap = new JSONObject();
        lap.put("index", laps.length() + 1);
        lap.put("kind", kind);
        lap.put("elapsedMs", elapsed - (laps.length() == 0 ? 0 : laps.optJSONObject(laps.length() - 1).optLong("totalElapsedMs", 0)));
        lap.put("distanceMeters", distance - (laps.length() == 0 ? 0 : laps.optJSONObject(laps.length() - 1).optDouble("totalDistanceMeters", 0)));
        lap.put("totalElapsedMs", elapsed);
        lap.put("totalDistanceMeters", distance);
        laps.put(lap);
    }

    static void appendAutoLap(JSONObject state, long fallbackElapsedMs, double targetDistanceMeters) throws JSONException {
        JSONArray laps = state.optJSONArray("laps");
        if (laps == null) { laps = new JSONArray(); state.put("laps", laps); }
        long previousElapsed = laps.length() == 0 ? 0 : laps.optJSONObject(laps.length() - 1).optLong("totalElapsedMs", 0);
        double previousDistance = laps.length() == 0 ? 0 : laps.optJSONObject(laps.length() - 1).optDouble("totalDistanceMeters", 0);
        long crossingElapsed = crossingElapsedMs(state, targetDistanceMeters, fallbackElapsedMs);
        crossingElapsed = Math.max(previousElapsed, crossingElapsed);
        JSONObject lap = new JSONObject();
        lap.put("index", laps.length() + 1);
        lap.put("kind", "auto");
        lap.put("elapsedMs", Math.max(0, crossingElapsed - previousElapsed));
        lap.put("distanceMeters", RunningLapTiming.distanceSinceLap(targetDistanceMeters, previousDistance));
        lap.put("totalElapsedMs", crossingElapsed);
        lap.put("totalDistanceMeters", Math.max(previousDistance, targetDistanceMeters));
        laps.put(lap);
    }

    private static long crossingElapsedMs(JSONObject state, double targetDistanceMeters, long fallbackElapsedMs) {
        JSONObject beforeRaw = state.optJSONObject("_previousAcceptedPoint");
        JSONObject afterRaw = state.optJSONObject("_latestAcceptedPoint");
        if (beforeRaw != null && afterRaw != null) {
            double beforeDistance = beforeRaw.optDouble("distanceMeters", 0);
            double afterDistance = afterRaw.optDouble("distanceMeters", 0);
            if (beforeDistance <= targetDistanceMeters && afterDistance >= targetDistanceMeters) {
                return RunningLapTiming.crossingElapsedMs(targetDistanceMeters,
                    beforeDistance, beforeRaw.optLong("elapsedMs", 0),
                    afterDistance, afterRaw.optLong("elapsedMs", 0),
                    beforeRaw.optInt("segment", 0) == afterRaw.optInt("segment", 0), fallbackElapsedMs);
            }
        }
        JSONArray track = state.optJSONArray("track");
        if (track == null || track.length() == 0) return Math.max(0, fallbackElapsedMs);
        if (track.length() == 1) {
            JSONObject first = track.optJSONObject(0);
            return first.optDouble("distanceMeters", 0) >= targetDistanceMeters
                ? first.optLong("elapsedMs", fallbackElapsedMs) : Math.max(0, fallbackElapsedMs);
        }
        for (int index = track.length() - 1; index > 0; index--) {
            JSONObject before = track.optJSONObject(index - 1);
            JSONObject after = track.optJSONObject(index);
            if (before == null || after == null) continue;
            double beforeDistance = before.optDouble("distanceMeters", 0);
            double afterDistance = after.optDouble("distanceMeters", 0);
            if (beforeDistance <= targetDistanceMeters && afterDistance >= targetDistanceMeters) {
                return RunningLapTiming.crossingElapsedMs(targetDistanceMeters,
                    beforeDistance, before.optLong("elapsedMs", 0),
                    afterDistance, after.optLong("elapsedMs", 0),
                    before.optInt("segment", 0) == after.optInt("segment", 0), fallbackElapsedMs);
            }
        }
        return Math.max(0, fallbackElapsedMs);
    }

    /** Preserve the most recent accepted GPS fix at lifecycle boundaries. */
    static void appendCurrentEndpoint(JSONObject state) throws JSONException {
        JSONObject latest = state.optJSONObject("_latestAcceptedPoint");
        if (latest == null) return;
        JSONArray track = state.optJSONArray("track");
        if (track == null) { track = new JSONArray(); state.put("track", track); }
        JSONObject last = track.length() > 0 ? track.optJSONObject(track.length() - 1) : null;
        if (last == null || last.optLong("elapsedMs", -1) != latest.optLong("elapsedMs", -2)
            || last.optInt("segment", -1) != latest.optInt("segment", -2)) {
            track.put(new JSONObject(latest.toString()));
        }
    }

    static void appendPartialLap(JSONObject state, String kind, long totalElapsedMs, double totalDistanceMeters,
                                 long elapsedMs, double distanceMeters) throws JSONException {
        JSONArray laps = state.optJSONArray("laps");
        if (laps == null) { laps = new JSONArray(); state.put("laps", laps); }
        JSONObject lap = new JSONObject();
        lap.put("index", laps.length() + 1);
        lap.put("kind", kind);
        lap.put("elapsedMs", Math.max(0, elapsedMs));
        lap.put("distanceMeters", Math.max(0, distanceMeters));
        lap.put("totalElapsedMs", Math.max(0, totalElapsedMs));
        lap.put("totalDistanceMeters", Math.max(0, totalDistanceMeters));
        laps.put(lap);
    }

    static void removeInternal(JSONObject state) {
        state.remove("_activeElapsedMs");
        state.remove("_anchorElapsedRealtime");
        state.remove("_lastPointElapsedRealtime");
        state.remove("_heartbeatElapsedRealtime");
        state.remove("_confirmedElapsedMs");
        state.remove("_serviceRequestedElapsedRealtime");
        state.remove("_segment");
        state.remove("_lastFix");
        state.remove("_previousAcceptedPoint");
        state.remove("_latestAcceptedPoint");
        state.remove("_lastRouteSampleElapsedMs");
        state.remove("_movementCandidate");
        state.remove("_distanceAnchor");
        state.remove("_needsAnchorReset");
        state.remove("_lastAutoLapMeters");
        state.remove("_phaseStartElapsedMs");
        state.remove("_phaseStartDistanceMeters");
        state.remove("_phaseDistanceMeters");
        state.remove("_phaseDistanceReachedElapsedMs");
    }
}
