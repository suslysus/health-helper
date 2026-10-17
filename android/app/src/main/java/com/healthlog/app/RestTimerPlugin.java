package com.healthlog.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "RestTimer",
    permissions = @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
)
public class RestTimerPlugin extends Plugin {
    private static final String CHANNEL_ID = "healthlog_rest_timer";
    private static final int NOTIFICATION_ID = 7401;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable completionTask;

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
            return;
        }
        showCountdown(call);
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        if (getPermissionState("notifications") == PermissionState.GRANTED) showCountdown(call);
        else call.reject("알림 권한이 없어 상태바 타이머를 표시할 수 없습니다.");
    }

    private void showCountdown(PluginCall call) {
        int seconds = Math.max(1, call.getInt("seconds", 120));
        boolean exerciseTimer = "exercise".equals(call.getString("kind", "rest"));
        String label = call.getString("label", "시간 운동");
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        createChannel(manager);

        Intent intent = new Intent(getContext(), MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            getContext(), 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        long endAt = System.currentTimeMillis() + seconds * 1000L;
        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(exerciseTimer ? label + " 진행 중" : "휴식 중")
            .setContentText(exerciseTimer ? "목표 시간까지 남은 시간" : "다음 세트를 준비하세요")
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(true)
            .setWhen(endAt)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        manager.notify(NOTIFICATION_ID, builder.build());

        if (completionTask != null) handler.removeCallbacks(completionTask);
        completionTask = () -> {
            if (exerciseTimer) {
                Vibrator vibrator = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
                if (vibrator != null && vibrator.hasVibrator()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) vibrator.vibrate(VibrationEffect.createWaveform(new long[] { 0, 180, 100, 180 }, -1));
                    else vibrator.vibrate(new long[] { 0, 180, 100, 180 }, -1);
                }
            }
            manager.notify(NOTIFICATION_ID,
            new NotificationCompat.Builder(getContext(), CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle(exerciseTimer ? label + " 목표 시간 도달" : "휴식 완료")
                .setContentText(exerciseTimer ? "운동을 마친 뒤 실제 시간을 확인하고 기록하세요" : "다음 세트를 시작할 시간입니다")
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build());
        };
        handler.postDelayed(completionTask, seconds * 1000L);
        JSObject result = new JSObject();
        result.put("endsAt", endAt);
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (completionTask != null) handler.removeCallbacks(completionTask);
        completionTask = null;
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        manager.cancel(NOTIFICATION_ID);
        call.resolve();
    }

    private void createChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "운동 휴식 타이머", NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("세트 사이 휴식 시간을 상태바에 표시합니다.");
            manager.createNotificationChannel(channel);
        }
    }
}
