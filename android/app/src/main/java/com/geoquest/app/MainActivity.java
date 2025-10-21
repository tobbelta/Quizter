package com.quizter.app;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.capacitorjs.plugins.localnotifications.LocalNotificationsPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
        
        // Hantera insets manuellt så att WebView får korrekt padding
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        final View rootView = findViewById(android.R.id.content);
        if (rootView != null) {
            ViewCompat.setOnApplyWindowInsetsListener(rootView, (view, windowInsets) -> {
                Insets systemBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
                view.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(rootView);
        }

        // Sätt navigation bar och status bar färg
        getWindow().setNavigationBarColor(getResources().getColor(android.R.color.black));
        getWindow().setStatusBarColor(getResources().getColor(android.R.color.black));
        
        // Se till att system bars är synliga (inte edge-to-edge mode)
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);
    }
}
