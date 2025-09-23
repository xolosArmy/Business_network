package com.xolos.rmzwallet;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register any custom Capacitor plugins here before calling super.onCreate.
        // Example:
        // registerPlugin(MyCustomPlugin.class);

        super.onCreate(savedInstanceState);

        // Firebase initialization could go here after super.onCreate if needed.
    }
}
