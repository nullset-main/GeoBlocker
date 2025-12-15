// Content script: detect video ID, ask background if it's blocked, and overlay if needed
(function () {
  // content script: blocks both watch pages and thumbnails in lists (home/search)
  const BLOCKED_ATTR = 'data-geo-blocked';
  const SESSION_UNBLOCK = new Set();

  // Inject CSS for thumbnail overlays
  const style = document.createElement('style');
  style.textContent = `
  .geo-thumb-overlay { position:absolute; inset:0; background:rgba(0,0,0,0.78); color:white; display:flex;align-items:center;justify-content:center;flex-direction:column; z-index:99998 }
  .geo-thumb-overlay button { margin-top:8px; padding:6px 10px; border-radius:6px; border:none; cursor:pointer }
  .geo-thumb-container { position:relative }
  `;
  document.head && document.head.appendChild(style);

  function extractVideoIdFromHref(href) {
    try {
      const u = new URL(href, location.origin);
      const params = new URLSearchParams(u.search);
      const v = params.get('v');
      if (v) return v;
      const path = u.pathname.split('/').filter(Boolean);
      const shortsIndex = path.indexOf('shorts');
      if (shortsIndex >= 0 && path[shortsIndex + 1]) return path[shortsIndex + 1];
    } catch (e) { }
    return null;
  }

  function findThumbnailAnchors() {
    // find anchors that link to videos (watch or shorts)
    return Array.from(document.querySelectorAll('a[href*="/watch?v="] , a[href*="/shorts/"]'));
  }

  function findPlaylistAnchors() {
    // anchors that link to playlists
    return Array.from(document.querySelectorAll('a[href*="?list="]'));
  }

  async function scanAndBlock() {
    // handle video thumbnails
    const anchors = findThumbnailAnchors();
    const videoToAnchors = new Map();
    for (const a of anchors) {
      const id = extractVideoIdFromHref(a.href);
      if (!id) continue;
      if (SESSION_UNBLOCK.has(id)) continue;
      if (!videoToAnchors.has(id)) videoToAnchors.set(id, []);
      videoToAnchors.get(id).push(a);
    }
    const videoIds = Array.from(videoToAnchors.keys());

    // handle playlist anchors
    const playlistAnchors = findPlaylistAnchors();
    const playlistToAnchors = new Map();
    for (const a of playlistAnchors) {
      const url = a.href || '';
      const listId = (new URL(url, location.origin)).searchParams.get('list');
      if (!listId) continue;
      if (!playlistToAnchors.has(listId)) playlistToAnchors.set(listId, []);
      playlistToAnchors.get(listId).push(a);
    }
    const playlistIds = Array.from(playlistToAnchors.keys());

    // batch-check videos and playlists (if any)
    let videoResp = {};
    if (videoIds.length) {
      videoResp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'checkVideos', videoIds }, (r) => resolve(r || {}));
      });
    }
    let playlistResp = {};
    if (playlistIds.length) {
      playlistResp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'checkPlaylists', playlistIds }, (r) => resolve(r || {}));
      });
    }

    // apply overlays for videos
    for (const [vid, anchorsList] of videoToAnchors) {
      const info = videoResp[vid];
      const blocked = info && info.blocked;
      for (const a of anchorsList) {
        let container = a.closest('ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer') || a.parentElement;
        if (!container) container = a;
        container.classList.add('geo-thumb-container');
        const existing = container.querySelector('.geo-thumb-overlay');
        if (blocked) {
          if (existing) continue;
          const overlay = document.createElement('div');
          overlay.className = 'geo-thumb-overlay';
          overlay.innerHTML = `<div style="text-align:center;max-width:220px">Blocked by GeoBlocker<br/><small>${info && info.country ? info.country : 'Unknown'}</small><br/><button class="geo-show-btn">Show anyway</button></div>`;
          overlay.setAttribute(BLOCKED_ATTR, '1');
          container.appendChild(overlay);
          const btn = overlay.querySelector('.geo-show-btn');
          if (btn) btn.addEventListener('click', (e) => {
            e.stopPropagation();
            SESSION_UNBLOCK.add(vid);
            overlay.remove();
          });
        } else {
          if (existing) existing.remove();
        }
      }
    }

    // apply overlays for playlists
    for (const [plist, anchorsList] of playlistToAnchors) {
      const info = playlistResp[plist];
      const blocked = info && info.blocked;
      for (const a of anchorsList) {
        let container = a.closest('ytd-playlist-renderer, ytd-grid-playlist-renderer, ytd-rich-item-renderer') || a.parentElement;
        if (!container) container = a;
        container.classList.add('geo-thumb-container');
        const existing = container.querySelector('.geo-playlist-overlay');
        if (blocked) {
          if (existing) continue;
          const overlay = document.createElement('div');
          overlay.className = 'geo-playlist-overlay geo-thumb-overlay';
          overlay.innerHTML = `<div style="text-align:center;max-width:220px">Playlist blocked by GeoBlocker<br/><small>${info && info.country ? info.country : 'Unknown'}</small><br/><button class="geo-show-btn">Show playlist</button></div>`;
          overlay.setAttribute(BLOCKED_ATTR, '1');
          container.appendChild(overlay);
          const btn = overlay.querySelector('.geo-show-btn');
          if (btn) btn.addEventListener('click', (e) => {
            e.stopPropagation();
            // allow the playlist for the session
            SESSION_UNBLOCK.add(plist);
            overlay.remove();
          });
        } else {
          if (existing) existing.remove();
        }
      }
    }
  }

  // Also handle full watch page overlay separately (keep simple)
  let pageOverlay = null;
  async function checkWatchPage() {
    const vid = (new URL(location.href)).searchParams.get('v') || (() => { const p = location.pathname.split('/').filter(Boolean); const si = p.indexOf('shorts'); return si>=0 ? p[si+1] : null; })();
    if (!vid) return;
    if (SESSION_UNBLOCK.has(vid)) return removePageOverlay();
    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'checkVideo', videoId: vid }, (r) => resolve(r));
    });
    if (resp && resp.blocked) showPageOverlay(resp.reason, resp.country, vid);
    else removePageOverlay();
  }

  function showPageOverlay(reason, country, vid) {
    removePageOverlay();
    pageOverlay = document.createElement('div');
    pageOverlay.style.position = 'fixed';
    pageOverlay.style.inset = '0';
    pageOverlay.style.background = 'rgba(0,0,0,0.9)';
    pageOverlay.style.zIndex = 999999;
    pageOverlay.style.display = 'flex';
    pageOverlay.style.alignItems = 'center';
    pageOverlay.style.justifyContent = 'center';
    pageOverlay.innerHTML = `<div style="color:white;max-width:900px;text-align:center;padding:20px"><h2>Video blocked by GeoBlocker</h2><p>Channel country: <strong>${country || 'unknown'}</strong></p><p>Reason: ${reason}</p><button id="geo-show-page">Show anyway</button></div>`;
    document.documentElement.appendChild(pageOverlay);
    const btn = pageOverlay.querySelector('#geo-show-page');
    if (btn) btn.addEventListener('click', () => { SESSION_UNBLOCK.add(vid); removePageOverlay(); });
  }

  function removePageOverlay() { if (pageOverlay && pageOverlay.parentNode) pageOverlay.parentNode.removeChild(pageOverlay); pageOverlay = null; }

  // Respond to popup queries (e.g., count blocked thumbnails)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'unblockThisVideo') {
      const vid = msg.videoId;
      if (vid) { SESSION_UNBLOCK.add(vid); }
      removePageOverlay();
      sendResponse({ ok: true });
    }
    if (msg.type === 'countBlocked') {
      const overlays = document.querySelectorAll('.geo-thumb-overlay');
      sendResponse({ blockedCount: overlays.length });
    }
  });

  // Mutation observer to detect new thumbnails (YouTube is an SPA)
  let scanTimer = null;
  const observer = new MutationObserver(() => {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { scanAndBlock().catch(console.error); checkWatchPage().catch(console.error); }, 500);
  });
  observer.observe(document.documentElement || document.body, { childList: true, subtree: true });

  // Initial runs
  scanAndBlock().catch(console.error);
  checkWatchPage().catch(console.error);

  // Also listen for history changes
  window.addEventListener('yt-navigate-finish', () => { scanAndBlock().catch(console.error); checkWatchPage().catch(console.error); });

})();
