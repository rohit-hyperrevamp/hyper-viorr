/**
 * Server-side FCM (Firebase Cloud Messaging) sender for Android devices.
 *
 * Signs an RS256 service-account JWT, exchanges it for a Google access token,
 * and posts to the FCM HTTP v1 API. Runs inside the Cloudflare Worker runtime
 * (Web Crypto via `jose`), mirroring the APNs sender used for iOS.
 */
import { SignJWT, importPKCS8 } from "jose";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

type ServiceAccount = {
  project_id: string;
  private_key: string;
  private_key_id?: string;
  client_email: string;
};

function normalizePrivateKey(raw: string): string {
  const body = raw
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
}

function getServiceAccount(): ServiceAccount {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) {
    throw new Error(
      "Missing Android push configuration. Required secret: FIREBASE_SERVICE_ACCOUNT_JSON.",
    );
  }

  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }

  if (!parsed.project_id || !parsed.private_key || !parsed.client_email) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON is missing project_id, client_email or private_key.",
    );
  }

  return parsed;
}

let cachedAccessToken: { token: string; exp: number } | null = null;

async function getAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.exp > now + 60) {
    return cachedAccessToken.token;
  }

  const privateKey = await importPKCS8(normalizePrivateKey(account.private_key), "RS256");
  const assertion = await new SignJWT({ scope: FCM_SCOPE })
    .setProtectedHeader({ alg: "RS256", kid: account.private_key_id })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Google token exchange failed [${response.status}]: ${text}`);
  }

  const body = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!body.access_token) {
    throw new Error("Google token exchange returned no access token.");
  }

  cachedAccessToken = {
    token: body.access_token,
    exp: now + Math.max(60, (body.expires_in ?? 3600) - 120),
  };
  return cachedAccessToken.token;
}

export type FcmPayload = {
  title?: string;
  body?: string;
  link?: string;
  badge?: number;
};

export async function sendFcmPush(
  deviceToken: string,
  payload: FcmPayload,
): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
    const account = getServiceAccount();
    const accessToken = await getAccessToken(account);

    const message = {
      token: deviceToken,
      notification: {
        title: payload.title || "Hyper Vioarr",
        body: payload.body || "You have a new notification",
      },
      data: {
        link: payload.link ?? "",
      },
      android: {
        priority: "HIGH" as const,
        ttl: "86400s",
        direct_boot_ok: true,
        notification: {
          // Channel IDs are immutable on Android. v2 replaces the previously
          // installed channel that some devices retained as silent.
          channel_id: "hyper_vioarr_alerts_v2",
          sound: "hyper_vioarr_alert",
          default_vibrate_timings: true,
          notification_priority: "PRIORITY_MAX" as const,
          visibility: "PUBLIC" as const,
        },
      },
    };

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ message }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      return { success: false, status: response.status, error: text };
    }

    return { success: true, status: response.status };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** True when the Android push secret is configured on this deployment. */
export function isFcmConfigured(): boolean {
  return !!(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
}
