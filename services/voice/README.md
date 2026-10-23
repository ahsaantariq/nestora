# Nestora voice relay

Twilio ConversationRelay needs a long-lived WebSocket. This small Node service is that socket. The Nestora app still owns the AI, the inbox, and the TwiML webhooks. This process only forwards speech text to Nestora and speaks the reply back.

## What you set

| Variable | Meaning |
| --- | --- |
| `APP_BASE_URL` | Public Nestora site, no trailing slash. Example: `https://stay.example.com` |
| `VOICE_BRIDGE_SECRET` | The voice bridge secret from Admin → Integrations. Nestora creates it the first time you save assistant secrets. |
| `PORT` | Listen port. Default `8090`. |

Nestora must also have:

- Public site URL = the same `APP_BASE_URL`
- Voice public URL = the HTTPS origin of this service, for example `https://voice.example.com` (Nestora turns that into `wss://voice.example.com/relay`)
- Voice channel switched on
- Twilio number voice webhook set to `https://stay.example.com/api/twilio/voice-answer` (HTTP POST)

## Run on a VPS

```bash
cd services/voice
docker build -t nestora-voice .
docker run -d --name nestora-voice --restart unless-stopped \
  -p 127.0.0.1:8090:8090 \
  -e APP_BASE_URL=https://stay.example.com \
  -e VOICE_BRIDGE_SECRET=paste-the-bridge-secret \
  nestora-voice
```

Put TLS in front of it so Twilio can open `wss://`. With Caddy:

```
voice.example.com {
  reverse_proxy 127.0.0.1:8090
}
```

Check `https://voice.example.com/health` returns `ok` before you point a phone number at Nestora.

## Twilio

1. Buy or pick a voice-capable number.
2. Voice webhook: `https://YOUR-SITE/api/twilio/voice-answer`, method POST.
3. Status callback is set by Nestora on the recording (`/api/twilio/voice-status`).
4. For calling from the browser, create a TwiML App whose voice URL is the same voice-answer URL, then save its SID plus an API key and secret in Integrations.
5. In Integrations, set the human phone number used when the assistant hands a call over.

The call starts with the recording notice from Integrations when recording is on.

## Reminders and hold expiry

The app drains its job queue while the Node process is running. On a host that sleeps, call the worker every minute:

```bash
curl -fsS -X POST https://stay.example.com/api/assistant/worker \
  -H "Authorization: Bearer $VOICE_BRIDGE_SECRET"
```

That same secret releases unpaid holds, sends the one reminder, polls IMAP, and clears old recordings.
