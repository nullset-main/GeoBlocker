const cache = new Map();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkItem") {
    processItem(request.data, request.apiKey).then(country => {
      sendResponse({ country: country });
    });
    return true;
  }
});

async function processItem(info, apiKey) {
  if (info.type === 'playlist') {
    const channelId = await getChannelFromPlaylist(info.value, apiKey);
    if (channelId) {
      return await getCountry(channelId, 'id', apiKey);
    }
  }
  
  if (info.type === 'id' || info.type === 'handle') {
    return await getCountry(info.value, info.type, apiKey);
  }

  return "UNKNOWN";
}

async function getChannelFromPlaylist(playlistId, apiKey) {
  const cacheKey = `PL_${playlistId}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      const channelId = data.items[0].snippet.channelId;
      cache.set(cacheKey, channelId);
      return channelId;
    }
  } catch (e) { }
  return null;
}

async function getCountry(id, type, apiKey) {
  if (cache.has(id)) return cache.get(id);

  let url = `https://www.googleapis.com/youtube/v3/channels?part=brandingSettings,snippet&key=${apiKey}`;
  url += (type === 'handle') ? `&forHandle=${id}` : `&id=${id}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      let country = item.brandingSettings?.channel?.country || item.snippet?.country;
      country = country ? country.toUpperCase() : "UNKNOWN";
      
      cache.set(id, country);
      return country;
    }
  } catch (e) { }
  
  cache.set(id, "UNKNOWN");
  return "UNKNOWN";
}