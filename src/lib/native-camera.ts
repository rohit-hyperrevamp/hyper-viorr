import { isNativePlatform } from "@/lib/native";

/**
 * Capture a photo from the device's rear camera and return a data URL.
 * - On native (iOS/Android) uses @capacitor/camera and prompts the OS camera.
 * - On web, falls back to a hidden `<input type="file" capture="environment">`.
 */
export async function capturePhoto(): Promise<string | null> {
  if (isNativePlatform()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const res = await Camera.getPhoto({
        quality: 78,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        saveToGallery: false,
        correctOrientation: true,
      });
      return res.dataUrl ?? null;
    } catch (err) {
      // User cancelled or permission denied — surface as null
      console.warn("[capturePhoto] native failed", err);
      return null;
    }
  }

  return new Promise<string | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    let settled = false;
    const finish = (val: string | null) => {
      if (settled) return;
      settled = true;
      try { document.body.removeChild(input); } catch { /* noop */ }
      resolve(val);
    };
    input.addEventListener("change", () => {
      const f = input.files?.[0];
      if (!f) return finish(null);
      const reader = new FileReader();
      reader.onload = () => finish(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => finish(null);
      reader.readAsDataURL(f);
    });
    input.addEventListener("cancel", () => finish(null));
    input.click();
  });
}
