package com.hyperrevamp.hypervioarr;

import android.os.Build;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

/**
 * Android counterpart of the iOS `RadiantBiometrics` Swift plugin.
 *
 * Exposes the exact same JS surface (`check()` / `authenticate({reason})`) so
 * src/lib/biometric.ts works unchanged on Android: fingerprint, face unlock or
 * iris where the OEM supports it, with device credential (PIN/pattern/password)
 * as fallback.
 */
@CapacitorPlugin(name = "RadiantBiometrics")
public class RadiantBiometricsPlugin extends Plugin {

  private static final int STRONG_OR_WEAK =
      BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.BIOMETRIC_WEAK;

  private BiometricManager manager() {
    return BiometricManager.from(getContext());
  }

  private int biometricStatus() {
    BiometricManager bm = manager();
    int strong = bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
    if (strong == BiometricManager.BIOMETRIC_SUCCESS) return strong;
    return bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK);
  }

  private boolean deviceSecure() {
    return manager().canAuthenticate(BiometricManager.Authenticators.DEVICE_CREDENTIAL)
        == BiometricManager.BIOMETRIC_SUCCESS;
  }

  private String label() {
    // Android has no API to name the enrolled modality; use a neutral label
    // that reads correctly for fingerprint and face unlock devices.
    return "Biometric unlock";
  }

  @PluginMethod
  public void check(PluginCall call) {
    int status = biometricStatus();
    boolean biometryAvailable = status == BiometricManager.BIOMETRIC_SUCCESS;
    boolean secure = deviceSecure();

    String code;
    String reason;
    switch (status) {
      case BiometricManager.BIOMETRIC_SUCCESS:
        code = "available";
        reason = "";
        break;
      case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
        code = "noHardware";
        reason = "This device has no fingerprint or face unlock hardware.";
        break;
      case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
        code = "hardwareUnavailable";
        reason = "Biometric hardware is temporarily unavailable. Try again.";
        break;
      case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
        code = "notEnrolled";
        reason = "Add a fingerprint or face unlock in Android Settings, then enable it here.";
        break;
      case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED:
        code = "securityUpdateRequired";
        reason = "A security update is required before biometric unlock can be used.";
        break;
      default:
        code = "unavailable";
        reason = "Biometric unlock is not available on this device.";
        break;
    }

    // Device credential (PIN / pattern / password) is an acceptable fallback.
    boolean available = biometryAvailable || secure;
    if (!biometryAvailable && secure) {
      code = "deviceCredentialOnly";
      reason = "";
    }

    JSObject result = new JSObject();
    result.put("available", available);
    result.put("biometryAvailable", biometryAvailable);
    result.put("deviceSecure", secure);
    result.put("biometryType", biometryAvailable ? "biometric" : secure ? "deviceCredential" : "none");
    result.put("label", biometryAvailable ? label() : "Device unlock");
    result.put("code", code);
    result.put("reason", reason);
    call.resolve(result);
  }

  @PluginMethod
  public void authenticate(final PluginCall call) {
    final String reason = call.getString("reason", "Unlock Hyper Vioarr");
    final int status = biometricStatus();
    final boolean biometryAvailable = status == BiometricManager.BIOMETRIC_SUCCESS;
    final boolean secure = deviceSecure();

    if (!biometryAvailable && !secure) {
      call.reject("Biometric unlock is not set up on this device.");
      return;
    }

    final FragmentActivity activity = getActivity();
    if (activity == null) {
      call.reject("Activity unavailable for biometric prompt.");
      return;
    }

    activity.runOnUiThread(
        () -> {
          Executor executor = ContextCompat.getMainExecutor(getContext());
          BiometricPrompt prompt =
              new BiometricPrompt(
                  activity,
                  executor,
                  new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(
                        @NonNull BiometricPrompt.AuthenticationResult result) {
                      JSObject res = new JSObject();
                      res.put("success", true);
                      call.resolve(res);
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                      JSObject res = new JSObject();
                      res.put("success", false);
                      res.put("code", errorCode);
                      res.put("reason", errString.toString());
                      call.resolve(res);
                    }

                    @Override
                    public void onAuthenticationFailed() {
                      // Single mismatch — the prompt stays open, do not resolve.
                    }
                  });

          BiometricPrompt.PromptInfo.Builder builder =
              new BiometricPrompt.PromptInfo.Builder()
                  .setTitle("Hyper Vioarr")
                  .setSubtitle(reason)
                  .setConfirmationRequired(false);

          boolean allowDeviceCredential = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && secure;
          if (allowDeviceCredential) {
            builder.setAllowedAuthenticators(STRONG_OR_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL);
          } else {
            builder.setAllowedAuthenticators(STRONG_OR_WEAK);
            builder.setNegativeButtonText("Use OTP");
          }

          try {
            prompt.authenticate(builder.build());
          } catch (Exception e) {
            call.reject("Biometric prompt failed: " + e.getMessage());
          }
        });
  }
}
