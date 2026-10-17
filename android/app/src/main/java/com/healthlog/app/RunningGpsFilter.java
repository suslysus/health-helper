package com.healthlog.app;

/** GPS movement filter. Raw accepted fixes remain available for the route; distance uses a separate movement anchor. */
final class RunningGpsFilter {
    static final class Fix {
        final double latitude, longitude, accuracyMeters;
        final long elapsedRealtimeMs, timestampMs;
        Fix(double latitude, double longitude, double accuracyMeters, long elapsedRealtimeMs, long timestampMs) {
            this.latitude = latitude; this.longitude = longitude; this.accuracyMeters = accuracyMeters;
            this.elapsedRealtimeMs = elapsedRealtimeMs; this.timestampMs = timestampMs;
        }
    }

    static final class Result {
        final boolean accepted, poor;
        final double distanceMeters, distanceDeltaMeters;
        final int segment;
        final Fix fix;
        Result(boolean accepted, boolean poor, double distanceMeters, double distanceDeltaMeters, int segment, Fix fix) {
            this.accepted = accepted; this.poor = poor; this.distanceMeters = distanceMeters;
            this.distanceDeltaMeters = distanceDeltaMeters; this.segment = segment; this.fix = fix;
        }
    }

    private Fix lastFix;
    private Fix distanceAnchor;
    private Fix movementCandidate;
    private boolean needsAnchorReset;
    private double distanceMeters;
    private int segment;

    RunningGpsFilter(Fix lastFix, Fix distanceAnchor, boolean needsAnchorReset, double distanceMeters, int segment) {
        this(lastFix, distanceAnchor, null, needsAnchorReset, distanceMeters, segment);
    }

    RunningGpsFilter(Fix lastFix, Fix distanceAnchor, Fix movementCandidate, boolean needsAnchorReset, double distanceMeters, int segment) {
        this.lastFix = lastFix; this.distanceAnchor = distanceAnchor; this.movementCandidate = movementCandidate; this.needsAnchorReset = needsAnchorReset;
        this.distanceMeters = Math.max(0, distanceMeters); this.segment = Math.max(0, segment);
    }

    Result accept(Fix fix, long nowElapsedRealtimeMs) {
        if (!valid(fix) || fix.elapsedRealtimeMs <= 0 || fix.elapsedRealtimeMs > nowElapsedRealtimeMs + 5_000
            || nowElapsedRealtimeMs - fix.elapsedRealtimeMs > 30_000
            || (lastFix != null && fix.elapsedRealtimeMs <= lastFix.elapsedRealtimeMs)) {
            needsAnchorReset = true;
            distanceAnchor = null;
            movementCandidate = null;
            return rejected();
        }

        double delta = 0;
        if (lastFix != null) {
            long gap = fix.elapsedRealtimeMs - lastFix.elapsedRealtimeMs;
            if (needsAnchorReset || distanceAnchor == null) {
                segment++;
                distanceAnchor = fix;
                movementCandidate = null;
                needsAnchorReset = false;
            } else if (gap > 30_000) {
                segment++;
                distanceAnchor = fix;
                movementCandidate = null;
            } else if (distance(lastFix, fix) / (gap / 1_000.0) > 12.0) {
                needsAnchorReset = true;
                distanceAnchor = null;
                movementCandidate = null;
                return rejected();
            } else {
                double fromAnchor = distance(distanceAnchor, fix);
                double radius = jitterRadius((distanceAnchor.accuracyMeters + fix.accuracyMeters) / 2.0);
                if (fromAnchor <= radius) {
                    movementCandidate = null;
                } else if (movementCandidate != null && fromAnchor > distance(distanceAnchor, movementCandidate)
                    + Math.max(0.5, radius * 0.25)) {
                    delta = fromAnchor;
                    distanceAnchor = fix;
                    movementCandidate = null;
                } else {
                    movementCandidate = fix;
                }
            }
        } else {
            distanceAnchor = fix;
            movementCandidate = null;
            needsAnchorReset = false;
        }
        lastFix = fix;
        distanceMeters += delta;
        return new Result(true, false, distanceMeters, delta, segment, fix);
    }

    private Result rejected() { return new Result(false, true, distanceMeters, 0, segment, null); }

    static boolean valid(Fix fix) {
        return fix != null && Double.isFinite(fix.latitude) && Double.isFinite(fix.longitude)
            && Double.isFinite(fix.accuracyMeters) && Math.abs(fix.latitude) <= 90
            && Math.abs(fix.longitude) <= 180 && fix.accuracyMeters > 0 && fix.accuracyMeters <= 25;
    }

    static double jitterRadius(double accuracyMeters) { return Math.max(2, Math.min(6, accuracyMeters * 0.4)); }

    static double distance(Fix a, Fix b) {
        double lat1 = Math.toRadians(a.latitude), lat2 = Math.toRadians(b.latitude);
        double dLat = lat2 - lat1, dLon = Math.toRadians(b.longitude - a.longitude);
        double h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6_371_000.0 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }

    Fix lastFix() { return lastFix; }
    Fix distanceAnchor() { return distanceAnchor; }
    Fix movementCandidate() { return movementCandidate; }
    boolean needsAnchorReset() { return needsAnchorReset; }
    double distanceMeters() { return distanceMeters; }
    int segment() { return segment; }
}
