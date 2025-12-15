let blockedCountries = [];
let blockUnknown = false;
let apiKey = "";

chrome.storage.local.get(['blockedCountries', 'apiKey', 'blockUnknown'], (result) => {
  blockedCountries = result.blockedCountries || [];
  blockUnknown = result.blockUnknown || false;
  apiKey = result.apiKey || "";
  console.log("GeoFilter Loaded. Key present:", !!apiKey);
  if (apiKey) startObserver();
});

function startObserver() {
  const observer = new MutationObserver(() => processContent());
  observer.observe(document.body, { childList: true, subtree: true });
  processContent();
}

function processContent() {
  const items = document.querySelectorAll(`
    ytd-video-renderer:not(.geo-checked), 
    ytd-playlist-renderer:not(.geo-checked), 
    ytd-rich-item-renderer:not(.geo-checked),
    ytd-compact-video-renderer:not(.geo-checked)
  `);

  items.forEach(item => {
    item.classList.add('geo-checked');
    const info = extractInfo(item);

    if (info && apiKey) {
      // Visual feedback: I am checking this!
      item.style.outline = "2px solid blue"; 

      chrome.runtime.sendMessage({
        action: "checkItem",
        data: info,
        apiKey: apiKey
      }, (response) => {
        if (!response) return;
        const country = response.country || "UNKNOWN";

        if (blockedCountries.includes(country) || (blockUnknown && country === "UNKNOWN")) {
          // Visual feedback: I should block this!
          item.style.outline = "5px solid red";
          item.style.backgroundColor = "rgba(255,0,0,0.1)";
          // item.style.display = 'none'; // UNCOMMENT THIS LATER TO HIDE
        } else {
          item.style.outline = "none";
        }
      });
    }
  });
}

function extractInfo(el) {
  // Try to find the channel link
  const link = el.querySelector('a[href^="/@"], a[href^="/channel/"]');
  if (link) {
    const href = link.getAttribute('href');
    if (href.includes('/@')) return { type: 'handle', value: href.split('/@')[1] };
    if (href.includes('/channel/')) return { type: 'id', value: href.split('/channel/')[1] };
  }
  // Try to find playlist (Course)
  const pLink = el.querySelector('a[href*="list="]');
  if (pLink) {
    const pid = new URLSearchParams(pLink.getAttribute('href').split('?')[1]).get('list');
    if (pid && pid.length > 5) return { type: 'playlist', value: pid };
  }
  return null;
}