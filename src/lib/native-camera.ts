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

  if (
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  ) {
    try {
      return await capturePhotoFromWebCamera();
    } catch (err) {
      console.warn("[capturePhoto] web camera failed", err);
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

async function capturePhotoFromWebCamera(): Promise<string | null> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 960 },
    },
    audio: false,
  });

  return await new Promise<string | null>((resolve) => {
    let settled = false;
    const cleanup = (value: string | null) => {
      if (settled) return;
      settled = true;
      stream.getTracks().forEach((track) => track.stop());
      try {
        document.body.removeChild(overlay);
      } catch {
        /* noop */
      }
      resolve(value);
    };

    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Capture client photo");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "2147483647";
    overlay.style.background = "rgba(2, 6, 23, 0.92)";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.pointerEvents = "auto";
    overlay.style.touchAction = "manipulation";
    overlay.style.padding = "16px";
    overlay.style.paddingTop = "max(16px, env(safe-area-inset-top))";
    overlay.style.paddingBottom = "max(16px, env(safe-area-inset-bottom))";
    overlay.style.gap = "12px";

    const title = document.createElement("div");
    title.textContent = "Client photo";
    title.style.color = "white";
    title.style.font = "700 15px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    title.style.letterSpacing = "0";

    const videoWrap = document.createElement("div");
    videoWrap.style.flex = "1";
    videoWrap.style.minHeight = "0";
    videoWrap.style.borderRadius = "18px";
    videoWrap.style.overflow = "hidden";
    videoWrap.style.background = "#020617";
    videoWrap.style.border = "1px solid rgba(255,255,255,0.16)";

    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "cover";
    videoWrap.appendChild(video);

    const actions = document.createElement("div");
    actions.style.display = "grid";
    actions.style.gridTemplateColumns = "1fr 1.4fr";
    actions.style.gap = "10px";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.style.height = "48px";
    cancel.style.borderRadius = "14px";
    cancel.style.border = "1px solid rgba(255,255,255,0.18)";
    cancel.style.background = "rgba(255,255,255,0.08)";
    cancel.style.color = "white";
    cancel.style.font = "700 14px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    cancel.style.cursor = "pointer";
    cancel.style.pointerEvents = "auto";
    cancel.style.touchAction = "manipulation";
    cancel.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      cleanup(null);
    });

    const capture = document.createElement("button");
    capture.type = "button";
    capture.textContent = "Take photo";
    capture.style.height = "48px";
    capture.style.borderRadius = "14px";
    capture.style.border = "0";
    capture.style.background = "#16a34a";
    capture.style.color = "white";
    capture.style.font = "800 14px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    capture.style.cursor = "pointer";
    capture.style.pointerEvents = "auto";
    capture.style.touchAction = "manipulation";
    capture.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 960;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cleanup(null);
        return;
      }
      ctx.drawImage(video, 0, 0, width, height);
      cleanup(canvas.toDataURL("image/jpeg", 0.86));
    });

    actions.append(cancel, capture);
    overlay.append(title, videoWrap, actions);
    document.body.appendChild(overlay);

    video.play().catch(() => cleanup(null));
  });
}
