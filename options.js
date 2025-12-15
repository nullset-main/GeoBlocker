document.addEventListener('DOMContentLoaded', () => {
  const apiKeyEl = document.getElementById('apiKey');
  const blockedEl = document.getElementById('blockedCountries');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  const blockNoCountryEl = document.getElementById('blockNoCountry');
  const proxyUrlEl = document.getElementById('proxyUrl');
  const useProxyEl = document.getElementById('useProxy');
  const playlistModeEl = document.getElementById('playlistMode');
  const playlistSampleSizeEl = document.getElementById('playlistSampleSize');

  chrome.storage.sync.get({ apiKey: '', blockedCountries: '', blockIfNoCountry: false, proxyUrl: '', useProxy: false, playlistMode: 'owner_or_majority', playlistSampleSize: 20 }, (items) => {
    apiKeyEl.value = items.apiKey || '';
    if (Array.isArray(items.blockedCountries)) {
      blockedEl.value = items.blockedCountries.join(', ');
    } else {
      blockedEl.value = items.blockedCountries || '';
    }
    blockNoCountryEl.checked = Boolean(items.blockIfNoCountry);
    proxyUrlEl.value = items.proxyUrl || '';
    useProxyEl.checked = Boolean(items.useProxy);
    playlistModeEl.value = items.playlistMode || 'owner_or_majority';
    playlistSampleSizeEl.value = items.playlistSampleSize || 20;
  });

  saveBtn.addEventListener('click', () => {
    const apiKey = apiKeyEl.value.trim();
    const blocked = blockedEl.value.trim();
    const blockIfNoCountry = !!blockNoCountryEl.checked;
    const proxyUrl = proxyUrlEl.value.trim();
    const useProxy = !!useProxyEl.checked;
    const playlistMode = playlistModeEl.value;
    const playlistSampleSize = Math.max(1, Math.min(50, parseInt(playlistSampleSizeEl.value || '20', 10)));
    chrome.storage.sync.set({ apiKey, blockedCountries: blocked, blockIfNoCountry, proxyUrl, useProxy, playlistMode, playlistSampleSize }, () => {
      statusEl.textContent = 'Saved';
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
    });
  });
});
