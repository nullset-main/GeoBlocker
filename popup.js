document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const unblockBtn = document.getElementById('unblockBtn');

  function parseVideoIdFromUrl(url) {
    try {
      const u = new URL(url);
      const params = new URLSearchParams(u.search);
      const v = params.get('v');
      if (v) return v;
      const path = u.pathname.split('/').filter(Boolean);
      const shortsIndex = path.indexOf('shorts');
      if (shortsIndex >= 0 && path[shortsIndex + 1]) return path[shortsIndex + 1];
    } catch (e) { }
    return null;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    statusEl.textContent = 'No active YouTube tab';
    return;
  }
  const vid = parseVideoIdFromUrl(tab.url);
  if (!vid) {
    statusEl.textContent = 'Not a YouTube video page';
    return;
  }

  // Ask background to evaluate
  chrome.runtime.sendMessage({ type: 'checkVideo', videoId: vid }, (resp) => {
    if (!resp) {
      statusEl.textContent = 'No response';
      return;
    }
    if (resp.blocked) {
      statusEl.textContent = `Blocked — channel country: ${resp.country || 'unknown'}`;
    } else {
      statusEl.textContent = `Allowed — ${resp.reason || 'no block'}`;
    }
  });

  unblockBtn.addEventListener('click', () => {
    // send message to content script to remove overlay
    chrome.tabs.sendMessage(tab.id, { type: 'unblockThisVideo' });
    window.close();
  });
});
