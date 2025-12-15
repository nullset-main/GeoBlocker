const cache = new Map();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkItem") {
    console.log("DEBUG: Background received request for", request.data.value);
    
    processItem(request.data, request.apiKey)
      .then(country => {
        console.log(`DEBUG: Result for ${request.data.value} is [${country}]`);
        sendResponse({ country: country });
      })
      .catch(err => {
        console.error("DEBUG: API Error", err);
        sendResponse({ country: "ERROR" });
      });
    return true;
  }
});

async function processItem(info, apiKey) {
  let channelId = info.value;

  // If it's a playlist (Course), find owner ID first
  if (info.type === 'playlist') {
    const url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${info.value}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.items?.[0]) {
      channelId = data.items[0].snippet.channelId;
    } else {
      return "UNKNOWN";
    }
  }

  // Get country for the channel ID/Handle
  if (cache.has(channelId)) return cache.get(channelId);

  let url = `https://www.googleapis.com/youtube/v3/channels?part=brandingSettings,snippet&key=${apiKey}`;
  if (info.type === 'handle' && !channelId.startsWith('UC')) {
     url += `&forHandle=${channelId.replace('@', '')}`;
  } else {
     url += `&id=${channelId}`;
  }

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      console.error("YouTube API Error Details:", data.error);
      return "UNKNOWN";
    }

    if (data.items?.[0]) {
      const item = data.items[0];
      let country = item.brandingSettings?.channel?.country || item.snippet?.country;
      country = country ? country.toUpperCase() : "UNKNOWN";
      cache.set(channelId, country);
      return country;
    }
  } catch (e) {
    console.error("Network Error:", e);
  }
  return "UNKNOWN";
}