# Send worker

Receives drawings from Paint, notes from Notepad and CONscripter bug reports and posts them to a private
Discord channel. Turnstile blocks bots, and each visitor can send 3 messages a minute
(the site also makes people wait a minute between sends).

## Set up

1. **Discord webhook.** In your private channel: Edit Channel > Integrations >
   Webhooks > New Webhook. Copy its URL.
2. **Turnstile widget.** Cloudflare dashboard > Turnstile > Add widget. Hostnames
   `blankie.moe` and `blankiekun.github.io`, mode Managed. Copy the site key and the secret key.
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

## Fix with Claude

Each bug report's message also has a **Fix with Claude** button. Its page picks the repo
(CONscripter, conscripter-convert or this site; the player's guess is picked first)
and takes notes for Claude, and its button starts `.github/workflows/claude-fix.yml`
in that repo. Claude reads the report there and the workflow opens a pull request.
Reports are kept in the `BANS` KV namespace for 30 days.

Setting it up, once:

1. A fine-grained GitHub token with **Contents: Read and write** on the three repos
   (that is what starting a workflow needs): `npx wrangler secret put GITHUB_TOKEN`.
2. A shared secret the workflows download reports with, and a Claude token for them:
   ```sh
   s=$(openssl rand -hex 32); echo "$s" | npx wrangler secret put REPORT_SECRET
   claude setup-token   # copy the token it prints
   for r in CONscripter conscripter-convert blankiekun.github.io; do
     gh secret set REPORT_SECRET -R blankiekun/$r --body "$s"
     gh secret set CLAUDE_CODE_OAUTH_TOKEN -R blankiekun/$r   # paste the token
     gh secret set DISCORD_WEBHOOK_URL -R blankiekun/$r       # paste the webhook URL
     gh api -X PUT repos/blankiekun/$r/actions/permissions/workflow \
       -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true
   done
   ```
   The last line lets the workflow open pull requests.
3. `claude-fix.yml` has to be on each repo's default branch before the button works.

The player's comment and files reach Claude, so read the report before you start it.
Claude can't run general shell commands or use the web there, only grep, zcat, jq,
head, tail and wc on the report, so its fixes are untested; and the workflow publishes
nothing if either secret turns up in Claude's change or session. Claude runs on a runner
with no write access, and a second job opens the pull request and posts Claude's whole
session (the JSON transcript) to the Discord channel, even when Claude failed.

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
