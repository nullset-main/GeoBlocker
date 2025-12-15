// Background service worker: queries YouTube Data API to get channel country
// Adds simple in-memory caching and supports batch checks for lists (home/search/etc.)
const VIDEO_TTL = 5 * 60 * 1000; // 5 minutes
const videoCache = new Map(); // videoId -> { result, ts }
const channelCache = new Map(); // channelId -> { country, ts }
const playlistCache = new Map(); // playlistId -> { channelId, ts }

function now() { return Date.now(); }

async function getSettings() {
  const s = await chrome.storage.sync.get({ apiKey: '', blockedCountries: '', blockIfNoCountry: false, proxyUrl: '', useProxy: false, playlistMode: 'owner_or_majority', playlistSampleSize: 20 });
  const apiKey = s.apiKey?.trim();
  const blockIfNoCountry = Boolean(s.blockIfNoCountry);
  const proxyUrl = s.proxyUrl?.trim() || '';
  const useProxy = Boolean(s.useProxy);
  const playlistMode = s.playlistMode || 'owner_or_majority';
  const playlistSampleSize = Math.max(1, Math.min(50, Number(s.playlistSampleSize) || 20));
  let blocked = [];
  if (typeof s.blockedCountries === 'string') {
    blocked = s.blockedCountries.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
  } else if (Array.isArray(s.blockedCountries)) {
    blocked = s.blockedCountries.map(c => String(c).trim().toUpperCase()).filter(Boolean);
  }
  return { apiKey, blocked, blockIfNoCountry, proxyUrl, useProxy, playlistMode, playlistSampleSize };
}

async function fetchPlaylistItems(playlistId, maxResults, proxyUrl, useProxy, apiKey) {
  const results = [];
  let pageToken = null;
  let remaining = maxResults;
  while (remaining > 0) {
    const thisBatch = Math.min(50, remaining);
    if (useProxy && proxyUrl) {
      const json = await proxyFetch('/playlistItems', { playlistId, maxResults: thisBatch, pageToken }, proxyUrl, apiKey);
      const items = json.items || [];
        const settings = await getSettings();
        const apiKey = settings.apiKey;
        const blockedList = settings.blocked;
        const blockIfNoCountry = settings.blockIfNoCountry;
        const proxyUrl = settings.proxyUrl;
        const useProxy = settings.useProxy;
        const playlistMode = settings.playlistMode;
        const sampleSize = settings.playlistSampleSize;
        const result = {};

        if (!ids.length) { sendResponse(result); return; }
        if (!apiKey && !blockIfNoCountry && !useProxy) {
          ids.forEach(id => { result[id] = { blocked: false, reason: 'no-api-key' }; });
          sendResponse(result);
          return;
        }

        const toFetch = [];
        for (const id of ids) {
          const e = playlistCache.get(id);
          if (e && (now() - e.ts) <= VIDEO_TTL) {
            // we have channelId cached
          } else {
            toFetch.push(id);
          }
        }

        try {
          for (let i = 0; i < toFetch.length; i += 50) {
            const chunk = toFetch.slice(i, i + 50);
            let items = [];
            if (useProxy && proxyUrl) {
              const json = await proxyFetch('/playlists', { ids: chunk.join(',') }, proxyUrl, apiKey);
              items = json.items || [];
            } else {
              items = await fetchPlaylists(chunk, apiKey);
            }
            for (const p of items) {
              const pid = p.id;
              const chId = p.snippet && p.snippet.channelId ? p.snippet.channelId : null;
              playlistCache.set(pid, { channelId: chId, ts: now() });
            }
          }

          // For owner-based decision we can reuse channel cache
          const playlistOwnerIds = Array.from(new Set(ids.map(id => (playlistCache.get(id) || {}).channelId).filter(Boolean)));
          const channelsToFetch = [];
          for (const ch of playlistOwnerIds) {
            const cached = channelCache.get(ch);
            if (cached && (now() - cached.ts) <= VIDEO_TTL) continue;
            channelsToFetch.push(ch);
          }

          // fetch owner channels
          for (let i = 0; i < channelsToFetch.length; i += 50) {
            const chunk = channelsToFetch.slice(i, i + 50);
            let chItems = [];
            if (useProxy && proxyUrl) {
              const json = await proxyFetch('/channels', { ids: chunk.join(',') }, proxyUrl, apiKey);
              chItems = json.items || [];
            } else {
              chItems = await fetchChannels(chunk, apiKey);
            }
            for (const ch of chItems) {
              const cid = ch.id;
              const country = ch.snippet && ch.snippet.country ? String(ch.snippet.country).trim().toUpperCase() : null;
              channelCache.set(cid, { country, ts: now() });
            }
          }

          // Now evaluate per-playlist depending on mode
          for (const id of ids) {
            const ent = playlistCache.get(id);
            const ownerCh = ent ? ent.channelId : null;
            let ownerBlocked = false;
            if (ownerCh) {
              const chEntry = channelCache.get(ownerCh);
              const country = chEntry ? chEntry.country : null;
              if (!country) {
                ownerBlocked = blockIfNoCountry;
              } else {
                ownerBlocked = blockedList.includes(String(country).toUpperCase());
              }
            }

            // Decide based on mode
            if (playlistMode === 'owner') {
              result[id] = ownerBlocked ? { blocked: true, reason: 'blocked-playlist-owner', country: null } : { blocked: false, reason: ownerCh ? 'owner-allowed' : 'playlist-no-channel' };
              continue;
            }

            // For other modes we need to sample playlist items
            const sampleN = sampleSize;
            const videoIds = await fetchPlaylistItems(id, sampleN, proxyUrl, useProxy, apiKey);
            let blockedCount = 0;
            if (videoIds.length) {
              const videoChecks = await checkVideos(videoIds);
              for (const vid of videoIds) if (videoChecks[vid] && videoChecks[vid].blocked) blockedCount++;
            }

            if (playlistMode === 'any_item') {
              const isBlocked = blockedCount > 0;
              result[id] = isBlocked ? { blocked: true, reason: 'blocked-sampled-item' } : { blocked: false, reason: 'no-sampled-blocks' };
              continue;
            }

            if (playlistMode === 'majority') {
              const isBlocked = (videoIds.length > 0) && (blockedCount > (videoIds.length / 2));
              result[id] = isBlocked ? { blocked: true, reason: 'blocked-majority' } : { blocked: false, reason: 'not-majority' };
              continue;
            }

            if (playlistMode === 'owner_or_majority') {
              const majorityBlocked = (videoIds.length > 0) && (blockedCount > (videoIds.length / 2));
              const isBlocked = ownerBlocked || majorityBlocked;
              result[id] = isBlocked ? { blocked: true, reason: ownerBlocked ? 'blocked-playlist-owner' : 'blocked-majority' } : { blocked: false, reason: 'allowed' };
              continue;
            }
          }
        } catch (err) {
          console.error('GeoBlocker playlist batch error', err);
          for (const id of ids) result[id] = { blocked: false, reason: 'error' };
        }

        sendResponse(result);
}

async function fetchPlaylists(playlistIds, apiKey) {
  // playlistIds up to 50
  const idsParam = playlistIds.map(encodeURIComponent).join(',');
  const url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${idsParam}&key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('playlist-fetch-failed');
  const data = await resp.json();
  return data.items || [];
}

async function checkVideos(videoIds) {
  const settings = await getSettings();
  const apiKey = settings.apiKey;
  const blockedList = settings.blocked;
  const blockIfNoCountry = settings.blockIfNoCountry;

  const result = {};

  // Fast path: if no api key and not blocking no-country, return allowed for all
  if (!apiKey && !blockIfNoCountry) {
    videoIds.forEach(id => { result[id] = { blocked: false, reason: 'no-api-key' }; });
    return result;
  }

  // Check cache and prepare lists
  const toFetch = [];
  for (const id of videoIds) {
    if (isVideoCached(id)) {
      result[id] = videoCache.get(id).result;
    } else {
      toFetch.push(id);
    }
  }

  try {
    // Fetch videos in chunks of 50
    const chunks = [];
    for (let i = 0; i < toFetch.length; i += 50) chunks.push(toFetch.slice(i, i + 50));

    const videoIdToChannel = {};
    for (const chunk of chunks) {
      // fetch via proxy if configured
      const settings = await getSettings();
      const useProxy = Boolean(settings.useProxy);
      const proxyUrl = settings.proxyUrl;
      let items = [];
      if (useProxy && proxyUrl) {
        const json = await proxyFetch('/videos', { ids: chunk.join(',') }, proxyUrl, apiKey);
        items = json.items || [];
      } else {
        items = await fetchVideos(chunk, apiKey);
      }
      for (const it of items) {
        if (it && it.id && it.snippet && it.snippet.channelId) {
          videoIdToChannel[it.id] = it.snippet.channelId;
        }
      }
    }

    // collect unique channel ids to fetch
    const channelIds = Array.from(new Set(Object.values(videoIdToChannel).filter(Boolean)));
    const channelsToFetch = [];
    for (const ch of channelIds) {
      const cached = channelCache.get(ch);
      if (cached && (now() - cached.ts) <= VIDEO_TTL) continue;
      channelsToFetch.push(ch);
    }

    // Fetch channels in chunks
    for (let i = 0; i < channelsToFetch.length; i += 50) {
      const chunk = channelsToFetch.slice(i, i + 50);
      const settings = await getSettings();
      const useProxy = Boolean(settings.useProxy);
      const proxyUrl = settings.proxyUrl;
      let chItems = [];
      if (useProxy && proxyUrl) {
        const json = await proxyFetch('/channels', { ids: chunk.join(',') }, proxyUrl, apiKey);
        chItems = json.items || [];
      } else {
        chItems = await fetchChannels(chunk, apiKey);
      }
      for (const ch of chItems) {
        const cid = ch.id;
        const country = ch.snippet && ch.snippet.country ? String(ch.snippet.country).trim().toUpperCase() : null;
        channelCache.set(cid, { country, ts: now() });
      }
    }

    // Now produce result per video id
    for (const id of toFetch) {
      const chId = videoIdToChannel[id];
      if (!chId) {
        // video missing or private
        const r = { blocked: false, reason: 'video-not-found' };
        videoCache.set(id, { result: r, ts: now() });
        result[id] = r;
        continue;
      }
      const chEntry = channelCache.get(chId);
      const country = chEntry ? chEntry.country : null;
      if (!country) {
        if (blockIfNoCountry) {
          const r = { blocked: true, reason: 'blocked-no-country', country: null };
          videoCache.set(id, { result: r, ts: now() });
          result[id] = r;
        } else {
          const r = { blocked: false, reason: 'channel-no-country', country: null };
          videoCache.set(id, { result: r, ts: now() });
          result[id] = r;
        }
        continue;
      }
      const countryCode = String(country).trim().toUpperCase();
      const isBlocked = blockedList.includes(countryCode);
      const r = { blocked: isBlocked, reason: isBlocked ? 'blocked-country' : 'allowed', country: countryCode };
      videoCache.set(id, { result: r, ts: now() });
      result[id] = r;
    }

    // Also include any previously cached results we had
    for (const id of videoIds) {
      if (!result[id] && videoCache.has(id)) result[id] = videoCache.get(id).result;
    }
  } catch (err) {
    console.error('GeoBlocker background batch error', err);
    // fallback: mark everything allowed but note the error
    for (const id of videoIds) {
      if (!result[id]) result[id] = { blocked: false, reason: 'error' };
    }
  }

  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;
  if (message.type === 'checkVideo') {
    const id = message.videoId;
    if (!id) { sendResponse({ blocked: false, reason: 'no-video-id' }); return; }
    (async () => {
      const map = await checkVideos([id]);
      sendResponse(map[id] || { blocked: false, reason: 'no-data' });
    })();
    return true;
  }
  if (message.type === 'checkVideos') {
    const ids = Array.isArray(message.videoIds) ? message.videoIds : [];
    (async () => {
      const map = await checkVideos(ids);
      sendResponse(map);
    })();
    return true;
  }
  if (message.type === 'checkPlaylists') {
    const ids = Array.isArray(message.playlistIds) ? message.playlistIds : [];
    (async () => {
      const settings = await getSettings();
      const apiKey = settings.apiKey;
      const blockedList = settings.blocked;
      const blockIfNoCountry = settings.blockIfNoCountry;
      const result = {};

      if (!ids.length) { sendResponse(result); return; }
      if (!apiKey && !blockIfNoCountry) {
        ids.forEach(id => { result[id] = { blocked: false, reason: 'no-api-key' }; });
        sendResponse(result);
        return;
      }

      const toFetch = [];
      for (const id of ids) {
        const e = playlistCache.get(id);
        if (e && (now() - e.ts) <= VIDEO_TTL) {
          // we have channelId cached
        } else {
          toFetch.push(id);
        }
      }

      try {
        for (let i = 0; i < toFetch.length; i += 50) {
          const chunk = toFetch.slice(i, i + 50);
          const items = await fetchPlaylists(chunk, apiKey);
          for (const p of items) {
            const pid = p.id;
            const chId = p.snippet && p.snippet.channelId ? p.snippet.channelId : null;
            playlistCache.set(pid, { channelId: chId, ts: now() });
          }
        }

        // gather channel ids
        const channelIds = Array.from(new Set(ids.map(id => (playlistCache.get(id) || {}).channelId).filter(Boolean)));
        const channelsToFetch = [];
        for (const ch of channelIds) {
          const cached = channelCache.get(ch);
          if (cached && (now() - cached.ts) <= VIDEO_TTL) continue;
          channelsToFetch.push(ch);
        }

        // fetch channels
        for (let i = 0; i < channelsToFetch.length; i += 50) {
          const chunk = channelsToFetch.slice(i, i + 50);
          const settings = await getSettings();
          const useProxy = Boolean(settings.useProxy);
          const proxyUrl = settings.proxyUrl;
          let chItems = [];
          if (useProxy && proxyUrl) {
            const json = await proxyFetch('/channels', { ids: chunk.join(',') }, proxyUrl, apiKey);
            chItems = json.items || [];
          } else {
            chItems = await fetchChannels(chunk, apiKey);
          }
          for (const ch of chItems) {
            const cid = ch.id;
            const country = ch.snippet && ch.snippet.country ? String(ch.snippet.country).trim().toUpperCase() : null;
            channelCache.set(cid, { country, ts: now() });
          }
        }

        for (const id of ids) {
          const ent = playlistCache.get(id);
          const chId = ent ? ent.channelId : null;
          if (!chId) {
            result[id] = { blocked: false, reason: 'playlist-no-channel' };
            continue;
          }
          const chEntry = channelCache.get(chId);
          const country = chEntry ? chEntry.country : null;
          if (!country) {
            if (blockIfNoCountry) result[id] = { blocked: true, reason: 'blocked-no-country', country: null };
            else result[id] = { blocked: false, reason: 'channel-no-country' };
            continue;
          }
          const countryCode = String(country).trim().toUpperCase();
          const isBlocked = blockedList.includes(countryCode);
          result[id] = { blocked: isBlocked, reason: isBlocked ? 'blocked-country' : 'allowed', country: countryCode };
        }
      } catch (err) {
        console.error('GeoBlocker playlist batch error', err);
        for (const id of ids) result[id] = { blocked: false, reason: 'error' };
      }

      sendResponse(result);
    })();
    return true;
  }
});
