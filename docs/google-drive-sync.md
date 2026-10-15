# CONscripter Google Drive sync

CONscripter can copy each game's saves to the visitor's Google Drive, into the hidden
app folder (`appDataFolder`). The site can't see anything else in their Drive. Everything
runs in the browser with Google's sign-in, so there's no server.

The sync options stay hidden until `GOOGLE_CLIENT_ID` in `js/config.js` is filled in.

## Set up (Google Cloud)

1. **Project.** At <https://console.cloud.google.com/>, create a project (any name, like
   `blankiekun95`) and select it.
2. **Drive API.** Go to APIs & Services > Library, search for **Google Drive API** and
   click **Enable**.
3. **Consent screen.** Open **Google Auth Platform** (APIs & Services > OAuth consent
   screen) and click **Get started**:
   - App name: `CONscripter` (it's what the sign-in window shows). Support email: yours.
   - Audience: **External**.
   - Contact email: yours. Accept the policy, then **Create**.
4. **Branding.** Under Google Auth Platform > Branding:
   - Application home page: `https://blankiekun.github.io/`
   - Application privacy policy link: `https://blankiekun.github.io/privacy.html`
   - Application terms of service link: `https://blankiekun.github.io/terms.html`
   - Authorized domains: add `blankiekun.github.io`. If the console refuses it, leave
     the field empty. The JavaScript origin in step 6 is what sign-in actually checks.
   - Save.
5. **Scope.** Under Data Access, click **Add or remove scopes**, tick
   `.../auth/drive.appdata` (filter for "appdata"), then **Update** and **Save**. Google
   lists this scope as non-sensitive, so it shouldn't need app verification. If the
   console puts it under "sensitive scopes", let me know.
6. **Client ID.** Under Clients, click **Create client**:
   - Application type: **Web application**. Name: anything.
   - Authorized JavaScript origins: `https://blankiekun.github.io`. To test locally, also
     add `http://localhost:8000` (no trailing slash for either).
   - Authorized redirect URIs: leave empty.
   - Create, then copy the **Client ID** (`....apps.googleusercontent.com`). It's public,
     not a secret.
7. **Turn it on.** In `js/config.js`, set `GOOGLE_CLIENT_ID` to that Client ID. Commit
   and push.
8. **Publish.** Under Audience, the app starts in **Testing**, where only the test users
   you add there can sign in. Add your own account to try it out. When it works, click
   **Publish app** so anyone can use it. With only a non-sensitive scope there's no
   review. Google may say the app is unverified until you do the optional brand
   verification, which only adds your logo and name.

## Testing locally

Serve the site at the origin you added, for example
`python3 -m http.server 8000` and then <http://localhost:8000/#cons>.

## How it works

- `js/apps/consdrive.js` signs in (Google Identity Services' token flow, scope
  `drive.appdata`) and talks to the Drive REST API with `fetch`.
- Each game is one file, `<title> saves.json.gz`, tagged with a hash of the title in its
  `appProperties`. It holds gzipped JSON of the save files, each with its own time.
- The newest copy of each save file wins. Syncs happen:
  - when a game starts, before the engine reads its saves
  - a few seconds after each in-game save
  - when the tab is hidden
  - when the game is closed
  - from File > Sync Now, or by clicking the status bar
- If Drive has newer saves while a game is running, CONscripter asks before restarting
  the game to load them.
- A token lasts about an hour. When it runs out, CONscripter renews it with the next
  click, such as an in-game save. If it can't, it shows a "sign in again" tip.
- Deleting saves (Debug > Delete This Game's Saves) deletes the Drive copy too.
  Otherwise, deleting a save file in one browser doesn't delete it everywhere: the copy
  in Drive comes back.
