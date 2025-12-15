# GeoBlocker — YouTube country-based blocker

This Chrome extension blocks YouTube videos whose channel is registered in user-specified countries.

Quick start

1. Enable the YouTube Data API v3 in Google Cloud Console, create an API key, and restrict it appropriately.
2. Load this folder as an unpacked extension in Chrome (`chrome://extensions` → Load unpacked).
3. Open the extension Options and paste your API key and a comma-separated list of ISO 3166-1 alpha-2 country codes to block (e.g. `CN, RU`).

Proxy option (recommended for non-developers)

If you want non-technical users to use the extension without entering a YouTube API key, deploy the small proxy included in `server/`. The extension can be pointed at your proxy (Options → Proxy URL + enable "Use proxy") and will call the proxy instead of sending requests directly to Google's API.

How to deploy the proxy

- Create a Google Cloud API key with the YouTube Data API v3 enabled and set it as the `YT_API_KEY` environment variable on your server.
- Deploy `server/index.js` to any Node-compatible host (Render, Railway, Heroku, Fly, a VPS, or Docker). Example (locally):

```bash
cd server
npm install
YT_API_KEY="your_key_here" node index.js
```

- Use the publicly reachable URL as the Proxy URL in extension Options (for example `https://my-geoblocker-proxy.example.com`).

Security notes

- The proxy stores the API key only on the server; do not commit your key to source control.
- This proxy is intentionally minimal — if you host it for public users, add authentication, stronger rate-limiting, logging, and monitoring to avoid abuse.
- You may also restrict the API key in Google Cloud Console to the server's IP (recommended).

How it works

- The extension inspects the current YouTube video page for a video id.
- The background service worker calls the YouTube Data API to retrieve the video's channel, then fetches the channel snippet to read the `country` field.
- If the channel `country` matches one of the blocked country codes from options, a full-page overlay is shown to hide the video.

- If a channel does not set a `country`, you can now enable the option "Block channels that do not set a country" in Options to block those channels as well.

- The extension now also blocks YouTube playlists (and playlist thumbnails) whose owning channel is in a blocked country. Playlist pages and playlist links are detected and evaluated via the YouTube Data API.

Notes & limitations

- This implementation uses the channel `snippet.country` field. Many channels don't set a country, so not all videos will be identified.
- You must supply a YouTube Data API key. Requests consume quota.
- This is a simple client-side approach; for more reliable results you may wish to use a backend or a more sophisticated heuristic.

Files added

- `manifest.json` — extension manifest (MV3)
- `background.js` — service worker that queries YouTube Data API
- `contentScript.js` — detects video pages and overlays blocked content
- `options.html` / `options.js` — API key + blocked countries
- `popup.html` / `popup.js` — shows block status and allows temporary unblock

Try it

1. Open a YouTube video from a channel whose country you will block.
2. Open the popup to see the block status, or wait for the overlay to appear.

If you'd like, I can:
- Add better heuristics when channel country is missing (e.g. use channel description or localization clues).
- Persist temporary unblocks per-video.
- Add an import/export for blocked lists.
# GeoBlocker
A chrome extension that blocks youtube content from user-specific countries/channels/keywords.
