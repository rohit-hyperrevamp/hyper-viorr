package com.hyperrevamp.hypervioarr;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  // Android notification channels are immutable after first creation. Use a
  // versioned ID whenever sound behavior changes so an older silent channel
  // cannot override the app's current settings.
  private static final String CHANNEL_ID = "hyper_vioarr_alerts_v2";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(RadiantDeviceTelemetryPlugin.class);
    registerPlugin(RadiantBiometricsPlugin.class);
    registerPlugin(RadiantNativeAuthStorePlugin.class);
    super.onCreate(savedInstanceState);

    // Create the alert channel natively so background/killed-app FCM messages
    // are posted by the system tray with sound even before the WebView loads.
    createAlertChannel();
    // Android battery optimisation (Doze / OEM app-standby) is the usual reason
    // a push only lands when the app is opened. Ask once for an exemption.
    requestBatteryOptimizationExemptionOnce();

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

  private void createAlertChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return;
    NotificationChannel channel =
        new NotificationChannel(CHANNEL_ID, "Hyper Vioarr Alerts", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("Approvals, attendance and workflow updates");
    channel.enableVibration(true);
    channel.enableLights(true);
    channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
    Uri sound = Uri.parse(
        "android.resource://" + getPackageName() + "/" + R.raw.hyper_vioarr_alert);
    AudioAttributes attributes =
        new AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build();
    channel.setSound(sound, attributes);
    manager.createNotificationChannel(channel);
  }

  private void requestBatteryOptimizationExemptionOnce() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
    SharedPreferences prefs = getSharedPreferences("hyper_vioarr_native", Context.MODE_PRIVATE);
    if (prefs.getBoolean("battery_exemption_asked", false)) return;
    PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
    if (power == null || power.isIgnoringBatteryOptimizations(getPackageName())) return;
    prefs.edit().putBoolean("battery_exemption_asked", true).apply();
    try {
      Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
      intent.setData(Uri.parse("package:" + getPackageName()));
      startActivity(intent);
    } catch (Exception ignored) {
      // Some OEM ROMs block this dialog; notifications still work when the user
      // allows unrestricted background activity manually.
    }
  }
}
