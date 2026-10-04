// Does the Steam search from the service worker (content scripts are blocked by CORS).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "steamSearch") return;
  const url =
    "https://store.steampowered.com/api/storesearch/?term=" +
    encodeURIComponent(msg.term) +
    "&cc=us&l=en";
  fetch(url)
    .then((r) => r.json())
    .then((d) => sendResponse({ ok: true, items: d.items || [] }))
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true; // keep channel open for async response
});
