package com.hyperrevamp.hypervioarr;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(RadiantDeviceTelemetryPlugin.class);
    registerPlugin(RadiantBiometricsPlugin.class);
    registerPlugin(RadiantNativeAuthStorePlugin.class);
    super.onCreate(savedInstanceState);

    // True edge-to-edge: the WebView must draw behind the status bar and
    // navigation bar so there is no gray letterbox above/below the app.
    // Inset padding is handled in CSS via env(safe-area-inset-*).
    Window window = getWindow();
    WindowCompat.setDecorFitsSystemWindows(window, false);
    window.setStatusBarColor(Color.TRANSPARENT);
    window.setNavigationBarColor(Color.TRANSPARENT);
    window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
    window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
    window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      window.getAttributes().layoutInDisplayCutoutMode =
          WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.setStatusBarContrastEnforced(false);
      window.setNavigationBarContrastEnforced(false);
    }
    // Never show the window background (the gray gap) behind the web content.
    window.getDecorView().setBackgroundColor(Color.WHITE);

    // The app is served remotely. Clear only the WebView resource cache so an
    // installed build cannot keep rendering an obsolete login/OTP bundle.
    bridge.getWebView().clearCache(true);
    bridge.getWebView().setBackgroundColor(Color.WHITE);
  }
}
