// Content script: detect video ID, ask background if it's blocked, and overlay if needed
(function () {
  let lastVideoId = null;
  let overlay = null;

  function getVideoIdFromUrl() {
    try {
      const u = new URL(window.location.href);
      const params = new URLSearchParams(u.search);
      const v = params.get('v');
      if (v) return v;
      // try to parse /shorts/<id>
      const path = u.pathname.split('/').filter(Boolean);
      const shortsIndex = path.indexOf('shorts');
      if (shortsIndex >= 0 && path[shortsIndex + 1]) return path[shortsIndex + 1];
    } catch (e) {
      return null;
    }
    return null;
  }

  function showOverlay(reason, country) {
    removeOverlay();
    overlay = document.createElement('div');
    overlay.className = 'geo-blocker-overlay';
    overlay.innerHTML = `
      <div style="max-width:800px;text-align:center;padding:20px;color:white;">
        <h2 style="margin:0 0 10px;">Video blocked by GeoBlocker</h2>
        <p style="margin:0 0 10px;">Channel country: <strong>${country || 'unknown'}</strong></p>
        <p style="margin:0 0 16px;">Reason: ${reason}</p>
        <button id="geo-unblock-btn" style="padding:8px 12px;border-radius:6px;border:none;background:#ffffff;color:#000;cursor:pointer;">Show anyway for this session</button>
      </div>
    `;
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      background: 'rgba(0,0,0,0.85)',
      zIndex: 999999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    });
    document.documentElement.appendChild(overlay);
    const btn = document.getElementById('geo-unblock-btn');
    if (btn) btn.addEventListener('click', () => { overlay.style.display = 'none'; });
  }

  function removeOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  async function checkAndMaybeBlock(videoId) {
    if (!videoId) return;
    try {
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'checkVideo', videoId }, (r) => resolve(r));
      });
      if (resp && resp.blocked) {
        showOverlay(resp.reason, resp.country);
      } else {
        removeOverlay();
      }
    } catch (e) {
      console.error('GeoBlocker contentScript error', e);
    }
  }

  // Listen for runtime messages (e.g., temporary unblock)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'unblockThisVideo') {
      removeOverlay();
    }
  });

  // Poll for videoId changes (handles YouTube SPA nav)
  setInterval(() => {
    const vid = getVideoIdFromUrl();
    if (vid && vid !== lastVideoId) {
      lastVideoId = vid;
      checkAndMaybeBlock(vid);
    }
  }, 1500);

  // Initial check
  const initial = getVideoIdFromUrl();
  if (initial) {
    lastVideoId = initial;
    checkAndMaybeBlock(initial);
  }

})();
