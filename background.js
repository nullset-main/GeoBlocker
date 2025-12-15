// Background service worker: queries YouTube Data API to get channel country
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'checkVideo') return;
  const videoId = message.videoId;
  if (!videoId) {
    sendResponse({blocked: false, reason: 'no-video-id'});
    return;
  }

  (async () => {
    try {
      const s = await chrome.storage.sync.get({ apiKey: '', blockedCountries: '', blockIfNoCountry: false });
      const apiKey = s.apiKey?.trim();
      const blockIfNoCountry = Boolean(s.blockIfNoCountry);
      let blocked = [];
      if (typeof s.blockedCountries === 'string') {
        blocked = s.blockedCountries.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
      } else if (Array.isArray(s.blockedCountries)) {
        blocked = s.blockedCountries.map(c => String(c).trim().toUpperCase()).filter(Boolean);
      }

      if (!apiKey && !blockIfNoCountry) {
        sendResponse({ blocked: false, reason: !apiKey ? 'no-api-key' : 'no-blocked-countries' });
        return;
      }

      // Fetch video resource to get channelId
      const vidResp = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`);
      if (!vidResp.ok) {
        sendResponse({ blocked: false, reason: 'video-fetch-failed' });
        return;
      }
      const vidData = await vidResp.json();
      const items = vidData.items || [];
      if (!items.length) {
        sendResponse({ blocked: false, reason: 'video-not-found' });
        return;
      }
      const channelId = items[0].snippet && items[0].snippet.channelId;
      if (!channelId) {
        sendResponse({ blocked: false, reason: 'no-channel' });
        return;
      }

      // Fetch channel resource to get country
      const chResp = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`);
      if (!chResp.ok) {
        sendResponse({ blocked: false, reason: 'channel-fetch-failed' });
        return;
      }
      const chData = await chResp.json();
      const chItems = chData.items || [];
      if (!chItems.length) {
        sendResponse({ blocked: false, reason: 'channel-not-found' });
        return;
      }
      // country (if set by channel owner) is usually in snippet.country
      const country = chItems[0].snippet && chItems[0].snippet.country;
      if (!country) {
        if (blockIfNoCountry) {
          sendResponse({ blocked: true, reason: 'blocked-no-country', country: null });
          return;
        }
        sendResponse({ blocked: false, reason: 'channel-no-country' });
        return;
      }

      const countryCode = String(country).trim().toUpperCase();
      const isBlocked = blocked.includes(countryCode);
      sendResponse({ blocked: isBlocked, reason: isBlocked ? 'blocked-country' : 'allowed', country: countryCode });
    } catch (err) {
      console.error('GeoBlocker background error', err);
      sendResponse({ blocked: false, reason: 'error' });
    }
  })();

  return true; // indicate async response
});
