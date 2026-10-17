package com.healthlog.app;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private void dispatchWebEvent(String eventName) {
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().evaluateJavascript(
                "window.dispatchEvent(new Event('" + eventName + "'))", null
            );
        }
    }

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(SecureStorePlugin.class);
        registerPlugin(RestTimerPlugin.class);
        registerPlugin(RunningTrackerPlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                dispatchWebEvent("healthlog:back");
            }
        });
    }

}
