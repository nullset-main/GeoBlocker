let blockedCountries = [];
let apiKey = "";

chrome.storage.local.get(['blockedCountries', 'apiKey'], (result) => {
  blockedCountries = result.blockedCountries || [];
  apiKey = result.apiKey || "";
  if (apiKey) startObserver();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.blockedCountries) blockedCountries = changes.blockedCountries.newValue;
  if (changes.apiKey) apiKey = changes.apiKey.newValue;
});

function startObserver() {
  const observer = new MutationObserver(() => processContent());
  observer.observe(document.body, { childList: true, subtree: true });
  processContent();
}

function processContent() {
  const selector = `
    ytd-video-renderer:not(.geo-checked), 
    ytd-playlist-renderer:not(.geo-checked), 
    ytd-rich-item-renderer:not(.geo-checked),
    ytd-compact-video-renderer:not(.geo-checked),
    ytd-grid-video-renderer:not(.geo-checked)
  `;
  
  const items = document.querySelectorAll(selector);

  items.forEach(item => {
    item.classList.add('geo-checked');
    const info = extractInfo(item);

    if (info && apiKey) {
      chrome.runtime.sendMessage({
        action: "checkItem",
        data: info,
        apiKey: apiKey
      }, (response) => {
        if (chrome.runtime.lastError) return;
        
        if (response && response.country) {
          if (blockedCountries.includes(response.country)) {
            item.style.display = 'none';
          }
        }
      });
    }
  });
}

function extractInfo(el) {
  const link = el.querySelector('a[href^="/@"], a[href^="/channel/"]');
  if (link) {
    const href = link.getAttribute('href');
    if (href.includes('/@')) return { type: 'handle', value: href.split('/@')[1].split('/')[0] };
    if (href.includes('/channel/')) return { type: 'id', value: href.split('/channel/')[1].split('/')[0] };
  }

  const pLink = el.querySelector('a[href*="list="]');
  if (pLink) {
    const href = pLink.getAttribute('href');
    const pid = new URLSearchParams(href.split('?')[1]).get('list');
    if (pid && !pid.startsWith('RD') && !pid.startsWith('LL') && !pid.startsWith('WL')) {
      return { type: 'playlist', value: pid };
    }
  }

  return null; 
}