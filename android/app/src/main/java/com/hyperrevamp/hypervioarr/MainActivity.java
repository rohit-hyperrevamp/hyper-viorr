package app.lovable.radiantguard;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(RadiantDeviceTelemetryPlugin.class);
    super.onCreate(savedInstanceState);
    // The app is served remotely. Clear only the WebView resource cache so an
    // installed build cannot keep rendering an obsolete login/OTP bundle.
    bridge.getWebView().clearCache(true);
  }
}
