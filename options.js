document.addEventListener('DOMContentLoaded', () => {
  const apiKeyEl = document.getElementById('apiKey');
  const blockedEl = document.getElementById('blockedCountries');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  const blockNoCountryEl = document.getElementById('blockNoCountry');

  chrome.storage.sync.get({ apiKey: '', blockedCountries: '', blockIfNoCountry: false }, (items) => {
    apiKeyEl.value = items.apiKey || '';
    if (Array.isArray(items.blockedCountries)) {
      blockedEl.value = items.blockedCountries.join(', ');
    } else {
      blockedEl.value = items.blockedCountries || '';
    }
    blockNoCountryEl.checked = Boolean(items.blockIfNoCountry);
  });

  saveBtn.addEventListener('click', () => {
    const apiKey = apiKeyEl.value.trim();
    const blocked = blockedEl.value.trim();
    const blockIfNoCountry = !!blockNoCountryEl.checked;
    chrome.storage.sync.set({ apiKey, blockedCountries: blocked, blockIfNoCountry }, () => {
      statusEl.textContent = 'Saved';
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
    });
  });
});
