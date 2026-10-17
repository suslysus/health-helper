package com.healthlog.app;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class RunningGpsFilterTest {
    private static final double METERS_PER_LATITUDE_DEGREE = 111_195.0;

    @Test public void stationaryJitterDoesNotAccumulateDistance() {
        RunningGpsFilter filter = new RunningGpsFilter(null, null, false, 0, 0);
        long now = 1_000;
        double[] offsets = { 0, 1, -1, 0.5, -0.5, 1, 0, -1, 0 };
        for (double meters : offsets) {
            RunningGpsFilter.Result result = filter.accept(
                new RunningGpsFilter.Fix(meters / METERS_PER_LATITUDE_DEGREE, 0, 5, now, now), now);
            assertTrue(result.accepted);
            now += 1_000;
        }
        assertEquals(0, filter.distanceMeters(), 0.01);
    }

    @Test public void alternatingFourMeterGpsNoiseDoesNotAccumulateDistance() {
        RunningGpsFilter filter = new RunningGpsFilter(null, null, false, 0, 0);
        long now = 1_000;
        for (int i = 0; i < 100; i++) {
            double meters = (i % 2 == 0) ? 4 : -4;
            RunningGpsFilter.Result result = filter.accept(
                new RunningGpsFilter.Fix(meters / METERS_PER_LATITUDE_DEGREE, 0, 5, now, now), now);
            assertTrue(result.accepted);
            now += 1_000;
        }
        assertEquals(0, filter.distanceMeters(), 0.01);
    }

    @Test public void steadyThreeMetersPerSecondTracksApproximateRealDistance() {
        RunningGpsFilter filter = new RunningGpsFilter(null, null, false, 0, 0);
        long now = 1_000;
        for (int i = 0; i < 101; i++) {
            RunningGpsFilter.Result result = filter.accept(
                new RunningGpsFilter.Fix((i * 3.0) / METERS_PER_LATITUDE_DEGREE, 0, 5, now, now), now);
            assertTrue(result.accepted);
            now += 1_000;
        }
        assertEquals(300, filter.distanceMeters(), 1.5);
    }

    @Test public void pauseGapStartsNewSegmentWithoutBridgingDistance() {
        RunningGpsFilter.Fix first = new RunningGpsFilter.Fix(0, 0, 5, 1_000, 1_000);
        RunningGpsFilter filter = new RunningGpsFilter(first, first, false, 0, 0);
        RunningGpsFilter.Result afterGap = filter.accept(
            new RunningGpsFilter.Fix(0.01, 0, 5, 40_000, 40_000), 40_000);
        assertTrue(afterGap.accepted);
        assertEquals(1, afterGap.segment);
        assertEquals(0, afterGap.distanceMeters, 0.01);
    }

    @Test public void pauseResumeAnchorResetDoesNotBridgeAcrossPause() {
        RunningGpsFilter.Fix last = new RunningGpsFilter.Fix(0, 0, 5, 10_000, 10_000);
        RunningGpsFilter filter = new RunningGpsFilter(last, null, true, 50, 2);
        RunningGpsFilter.Result resumed = filter.accept(
            new RunningGpsFilter.Fix(0.0002, 0, 5, 11_000, 11_000), 11_000);
        assertTrue(resumed.accepted);
        assertEquals(3, resumed.segment);
        assertEquals(50, resumed.distanceMeters, 0.01);
    }

    @Test public void outOfOrderFixIsDroppedAndNextFixReanchors() {
        RunningGpsFilter.Fix first = new RunningGpsFilter.Fix(0, 0, 5, 2_000, 2_000);
        RunningGpsFilter filter = new RunningGpsFilter(first, first, false, 0, 0);
        RunningGpsFilter.Result older = filter.accept(
            new RunningGpsFilter.Fix(0.0001, 0, 5, 1_500, 1_500), 2_500);
        assertFalse(older.accepted);
        RunningGpsFilter.Result next = filter.accept(
            new RunningGpsFilter.Fix(0.001, 0, 5, 3_000, 3_000), 3_000);
        assertTrue(next.accepted);
        assertEquals(1, next.segment);
        assertEquals(0, next.distanceMeters, 0.01);
    }

    @Test public void automaticLapUsesRemainingDistanceAndInterpolatedCrossingTime() {
        assertEquals(700, RunningLapTiming.distanceSinceLap(1_000, 300), 0.01);
        long crossing = RunningLapTiming.crossingElapsedMs(1_000, 300, 30_000, 1_005, 100_500, true, 101_000);
        assertEquals(100_000, crossing);
    }

    @Test public void automaticLapDoesNotInterpolateAcrossTrackSegments() {
        long elapsed = RunningLapTiming.crossingElapsedMs(1_000, 300, 30_000, 1_005, 100_500, false, 101_000);
        assertEquals(101_000, elapsed);
    }
}
