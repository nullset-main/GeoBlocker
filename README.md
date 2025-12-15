# GeoBlocker — YouTube country-based blocker

This Chrome extension blocks YouTube videos whose channel is registered in user-specified countries.

Quick start

1. Enable the YouTube Data API v3 in Google Cloud Console, create an API key, and restrict it appropriately.
2. Load this folder as an unpacked extension in Chrome (`chrome://extensions` → Load unpacked).
3. Open the extension Options and paste your API key and a comma-separated list of ISO 3166-1 alpha-2 country codes to block (e.g. `CN, RU`).

How it works

- The extension inspects the current YouTube video page for a video id.
- The background service worker calls the YouTube Data API to retrieve the video's channel, then fetches the channel snippet to read the `country` field.
- If the channel `country` matches one of the blocked country codes from options, a full-page overlay is shown to hide the video.

- If a channel does not set a `country`, you can now enable the option "Block channels that do not set a country" in Options to block those channels as well.

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
