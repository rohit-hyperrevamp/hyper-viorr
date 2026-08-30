package com.hyperrevamp.hypervioarr;

import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android counterpart of the iOS `RadiantNativeAuthStore` Swift plugin.
 *
 * Stores the phone number used for biometric sign-in inside
 * EncryptedSharedPreferences (AES-256, key held in the Android Keystore), which
 * is the Android equivalent of the iOS Keychain entry.
 */
@CapacitorPlugin(name = "RadiantNativeAuthStore")
public class RadiantNativeAuthStorePlugin extends Plugin {

  private static final String FILE = "hyper_vioarr_native_auth";
  private static final String KEY_PHONE = "phone";

  private SharedPreferences prefs() throws Exception {
    MasterKey masterKey =
        new MasterKey.Builder(getContext())
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build();
    return EncryptedSharedPreferences.create(
        getContext(),
        FILE,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
  }

  @PluginMethod
  public void getPhone(PluginCall call) {
    JSObject result = new JSObject();
    try {
      String phone = prefs().getString(KEY_PHONE, null);
      result.put("hasPhone", phone != null && !phone.isEmpty());
      if (phone != null && !phone.isEmpty()) {
        result.put("phone", phone);
      }
    } catch (Exception e) {
      result.put("hasPhone", false);
    }
    call.resolve(result);
  }

  @PluginMethod
  public void setPhone(PluginCall call) {
    String phone = call.getString("phone");
    if (phone == null || phone.trim().isEmpty()) {
      call.reject("A phone number is required.");
      return;
    }
    JSObject result = new JSObject();
    try {
      prefs().edit().putString(KEY_PHONE, phone.trim()).apply();
      result.put("saved", true);
    } catch (Exception e) {
      result.put("saved", false);
      result.put("reason", e.getMessage());
    }
    call.resolve(result);
  }

  @PluginMethod
  public void clearPhone(PluginCall call) {
    JSObject result = new JSObject();
    try {
      prefs().edit().remove(KEY_PHONE).apply();
      result.put("cleared", true);
    } catch (Exception e) {
      result.put("cleared", false);
    }
    call.resolve(result);
  }
}
