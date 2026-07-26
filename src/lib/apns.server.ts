/**
 * Server-side APNs (Apple Push Notification service) sender.
 *
 * Signs an ES256 JWT with the .p8 key and pushes to device tokens stored
 * in public.device_push_tokens. Designed for the Cloudflare Worker runtime.
 */
import { SignJWT, importPKCS8 } from "jose";

const APNS_HOST_PROD = "https://api.push.apple.com";
const APNS_HOST_DEV = "https://api.development.push.apple.com";

type ApnsConfig = {
  keyP8: string;
  keyId: string;
  teamId: string;
  bundleId: string;
  useSandbox: boolean;
};

function getApnsConfig(): ApnsConfig {
  const keyP8 = (process.env.APNS_KEY_P8 || "").trim();
  const keyId = process.env.APNS_KEY_ID || "";
  const teamId = process.env.APNS_TEAM_ID || "";
  const bundleId = process.env.APNS_BUNDLE_ID || "";
  // Default to the sandbox (development) APNs host. Debug and TestFlight
  // builds mint development tokens that only the sandbox accepts; App Store
  // builds mint production tokens. The retry logic below flips hosts on
  // BadDeviceToken so both build types work regardless of this default.
  const useSandbox = process.env.APNS_USE_SANDBOX !== "false";

  if (!keyP8 || !keyId || !teamId || !bundleId) {
    throw new Error(
      "Missing APNs configuration. Required: APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID.",
    );
  }

  return { keyP8, keyId, teamId, bundleId, useSandbox };
}

let cachedJwt: { token: string; exp: number } | null = null;

/**
 * Normalize a .p8 key to a proper PKCS#8 PEM with real newlines. The
 * Cloudflare Worker's Web Crypto is stricter than Node about PEM formatting:
 * a single-line "-----BEGIN PRIVATE KEY----- BASE64 -----END PRIVATE KEY-----"
 * pasted through env vars must be split into 64-char lines before import.
 */
function normalizeP8(raw: string): string {
  const trimmed = raw.trim();
  // Extract base64 body, regardless of whether headers or newlines are present.
  const body = trimmed
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
}

async function getApnsJwt(): Promise<string> {
  const { keyP8, keyId, teamId } = getApnsConfig();
  const now = Math.floor(Date.now() / 1000);

  if (cachedJwt && cachedJwt.exp > now + 60) {
    return cachedJwt.token;
  }

  const pem = normalizeP8(keyP8);
  const privateKey = await importPKCS8(pem, "ES256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuedAt()
    .setIssuer(teamId)
    .setExpirationTime("1h")
    .sign(privateKey);

  // APNs JWTs are valid for up to 1 hour; refresh after 55 minutes to be safe.
  cachedJwt = { token, exp: now + 3300 };
  return token;
}

export type ApnsPayload = {
  title?: string;
  body?: string;
  badge?: number;
  sound?: string;
  link?: string;
};

export async function sendApnsPush(
  deviceToken: string,
  payload: ApnsPayload,
): Promise<{ success: boolean; status?: number; error?: string }> {
  const { bundleId, useSandbox } = getApnsConfig();
  const jwt = await getApnsJwt();

  const aps: Record<string, unknown> = {
    alert: {
      title: payload.title || "Radiant Guard",
      body: payload.body || "You have a new notification",
    },
    sound: payload.sound || "radiant_chime.caf",
  };

  if (payload.badge !== undefined) {
    aps.badge = payload.badge;
  }

  const body = JSON.stringify({
    aps,
    link: payload.link,
  });

  const postToApns = async (host: string) => {
    const response = await fetch(`${host}/3/device/${deviceToken}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, status: response.status, error: text };
    }

    return { success: true, status: response.status };
  };

  try {
    const primaryHost = useSandbox ? APNS_HOST_DEV : APNS_HOST_PROD;
    const fallbackHost = useSandbox ? APNS_HOST_PROD : APNS_HOST_DEV;
    const primary = await postToApns(primaryHost);
    if (primary.success) return primary;

    const shouldRetryOtherEnvironment =
      primary.status === 400 &&
      /BadDeviceToken|DeviceTokenNotForTopic|TopicDisallowed|BadCertificateEnvironment/i.test(
        primary.error || "",
      );

    if (shouldRetryOtherEnvironment) {
      const fallback = await postToApns(fallbackHost);
      if (fallback.success) return fallback;
      return {
        ...fallback,
        error: `Production/sandbox APNs both failed. Primary: ${primary.error}; fallback: ${fallback.error}`,
      };
    }

    return primary;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
