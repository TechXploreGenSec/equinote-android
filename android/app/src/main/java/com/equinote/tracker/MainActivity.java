package com.equinote.tracker;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Explicitly registered so the in-app SMS plugin is always available,
        // independent of annotation-processor auto-discovery.
        registerPlugin(SmsReaderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
