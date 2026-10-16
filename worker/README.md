# Send worker

Receives drawings from Paint, notes from Notepad and CONscripter bug reports and posts them to a private
Discord channel. Turnstile blocks bots, and each visitor can send 3 messages a minute
(the site also makes people wait a minute between sends).

## Set up

1. **Discord webhook.** In your private channel: Edit Channel > Integrations >
   Webhooks > New Webhook. Copy its URL.
2. **Turnstile widget.** Cloudflare dashboard > Turnstile > Add widget. Hostname
   `blankiekun.github.io`, mode Managed. Copy the site key and the secret key.
3. **Deploy.**
   ```sh
   cd worker
   npx wrangler login
   npx wrangler secret put TURNSTILE_SECRET      # paste the Turnstile secret key
   npx wrangler secret put DISCORD_WEBHOOK_URL   # paste the webhook URL
   npx wrangler deploy
   ```
   Wrangler prints the worker's address, like `https://blankiekun95-send.<you>.workers.dev`.
4. **Turn on the Send buttons.** In `js/config.js`, set `SEND_ENDPOINT` to that
   address plus `/send`, and `TURNSTILE_SITE_KEY` to the site key. Commit and push.

## Banning a sender

Every message in Discord has **Ban sender** and **Unban** buttons. Each one opens a
page with a confirm button. A ban blocks that IP from sending for 30 days, and the
links stop working after 30 days. Bans are stored in the `BANS` KV namespace.

## Testing locally

Cloudflare's test keys always pass: site key `1x00000000000000000000AA`, secret
`1x0000000000000000000000000000000AA`. Put the secret and a webhook URL in
`worker/.dev.vars` (ignored by git), then run
`npx wrangler dev --var ALLOWED_ORIGINS:http://127.0.0.1:8000` next to a local
copy of the site served on that port.
