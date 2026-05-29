import twilio from 'twilio';

let _client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (_client) return _client;
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;
  _client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return _client;
}

/**
 * Send an SMS message. Silently no-ops when Twilio env vars are not configured,
 * so the rest of the system continues to function without SMS credentials set.
 */
export async function sendSms(to: string, body: string): Promise<void> {
  const client = getClient();
  if (!client) {
    console.warn('[sms] Twilio not configured — skipping SMS to', to);
    return;
  }

  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) {
    console.warn('[sms] TWILIO_PHONE_NUMBER not set — skipping SMS to', to);
    return;
  }

  await client.messages.create({ to, from, body });
}
