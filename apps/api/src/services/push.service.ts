/**
 * Expo Push Notification Service
 *
 * Sends push notifications via Expo's push API.
 * No APNs/FCM credentials needed — Expo proxies to the platform in dev.
 * For production delivery, configure credentials in Expo EAS.
 *
 * This function is fire-and-forget: it never throws so callers stay non-blocking.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: 'default',
        data: data ?? {},
      }),
    });

    if (!res.ok) {
      console.warn(`[push] Expo API returned ${res.status}:`, await res.text().catch(() => ''));
      return;
    }

    const json = (await res.json()) as { data?: { status: string; message?: string } };
    if (json?.data?.status === 'error') {
      console.warn('[push] Expo push ticket error:', json.data.message);
    }
  } catch (err) {
    // Never surface push failures to callers
    console.warn('[push] Failed to send Expo push notification:', (err as Error).message);
  }
}
