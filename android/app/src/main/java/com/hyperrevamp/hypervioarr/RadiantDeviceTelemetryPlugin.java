package app.lovable.radiantguard;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.telephony.TelephonyManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RadiantDeviceTelemetry")
public class RadiantDeviceTelemetryPlugin extends Plugin {
  @PluginMethod
  public void getStatus(PluginCall call) {
    JSObject ret = new JSObject();
    Context context = getContext();

    Intent battery = context.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
    if (battery != null) {
      int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
      int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
      int status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
      if (level >= 0 && scale > 0) {
        ret.put("batteryLevel", Math.round((level * 100f) / scale));
      }
      ret.put(
        "isCharging",
        status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
      );
    }

    String networkType = "Offline";
    boolean connected = false;
    ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
    if (cm != null) {
      android.net.Network active = cm.getActiveNetwork();
      NetworkCapabilities caps = active != null ? cm.getNetworkCapabilities(active) : null;
      connected = caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
      if (connected) {
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
          networkType = "WiFi";
        } else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
          networkType = cellularGeneration(context);
        } else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) {
          networkType = "Ethernet";
        } else {
          networkType = "Online";
        }
      }
    }

    ret.put("connected", connected);
    ret.put("networkType", networkType);
    ret.put("source", "android-radiant");
    call.resolve(ret);
  }

  private String cellularGeneration(Context context) {
    try {
      TelephonyManager tm = (TelephonyManager) context.getSystemService(Context.TELEPHONY_SERVICE);
      if (tm == null) return "Cellular";
      int type = tm.getDataNetworkType();
      switch (type) {
        case TelephonyManager.NETWORK_TYPE_NR:
          return "5G";
        case TelephonyManager.NETWORK_TYPE_LTE:
        case TelephonyManager.NETWORK_TYPE_IWLAN:
          return "4G";
        case TelephonyManager.NETWORK_TYPE_UMTS:
        case TelephonyManager.NETWORK_TYPE_EVDO_0:
        case TelephonyManager.NETWORK_TYPE_EVDO_A:
        case TelephonyManager.NETWORK_TYPE_HSDPA:
        case TelephonyManager.NETWORK_TYPE_HSUPA:
        case TelephonyManager.NETWORK_TYPE_HSPA:
        case TelephonyManager.NETWORK_TYPE_EVDO_B:
        case TelephonyManager.NETWORK_TYPE_EHRPD:
        case TelephonyManager.NETWORK_TYPE_HSPAP:
          return "3G";
        case TelephonyManager.NETWORK_TYPE_GPRS:
        case TelephonyManager.NETWORK_TYPE_EDGE:
        case TelephonyManager.NETWORK_TYPE_CDMA:
        case TelephonyManager.NETWORK_TYPE_1xRTT:
        case TelephonyManager.NETWORK_TYPE_IDEN:
        case TelephonyManager.NETWORK_TYPE_GSM:
          return "2G";
        default:
          return "Cellular";
      }
    } catch (SecurityException ignored) {
      return "Cellular";
    }
  }
}