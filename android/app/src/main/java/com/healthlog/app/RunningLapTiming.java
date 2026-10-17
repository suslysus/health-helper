package com.healthlog.app;

/** Distance and elapsed-time checkpoints for automatic distance laps. */
final class RunningLapTiming {
    private RunningLapTiming() {}

    static double distanceSinceLap(double targetDistanceMeters, double previousLapDistanceMeters) {
        return Math.max(0, targetDistanceMeters - previousLapDistanceMeters);
    }

    static long crossingElapsedMs(double targetDistanceMeters,
                                  double beforeDistanceMeters, long beforeElapsedMs,
                                  double afterDistanceMeters, long afterElapsedMs,
                                  boolean sameSegment, long fallbackElapsedMs) {
        if (sameSegment && afterDistanceMeters > beforeDistanceMeters
            && targetDistanceMeters >= beforeDistanceMeters && targetDistanceMeters <= afterDistanceMeters) {
            double ratio = (targetDistanceMeters - beforeDistanceMeters) / (afterDistanceMeters - beforeDistanceMeters);
            return beforeElapsedMs + Math.round((afterElapsedMs - beforeElapsedMs) * ratio);
        }
        return Math.max(0, fallbackElapsedMs);
    }
}
