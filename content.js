(() => {
  if (document.querySelector(".srs-box")) return;

  const h1 = document.querySelector("h1.entry-title, h1");
  if (!h1) return;

  // Game pages have "free-download" in the slug (e.g. -free-download-1i) or "Free Download" in the title
  const isGamePage =
    /free-download/i.test(location.pathname) || /free download/i.test(h1.textContent);
  if (!isGamePage) return;

  // ---------- Title cleanup ----------
  const cleanTitle = (t) =>
    t
      .replace(/free download/gi, "")
      .replace(/\(.*?\)|\[.*?\]/g, "")
      .replace(/\bv?\d+(\.\d+){1,}\w*\b/gi, "")
      .replace(/\bbuild\s*\d+\b/gi, "")
      .replace(/[™®©]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const title = cleanTitle(h1.textContent);

  const norm = (s) =>
    s
      .toLowerCase()
      .replace(/[™®©]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  // Common abbreviations -> full names used on Steam
  const ALIASES = {
    gta: "grand theft auto",
    cod: "call of duty",
    rdr: "red dead redemption",
    rdr2: "red dead redemption 2",
    nfs: "need for speed",
    mgs: "metal gear solid",
    tes: "the elder scrolls",
    lotr: "lord of the rings",
    ac: "assassins creed",
    re: "resident evil",
    tlou: "the last of us",
    bf: "battlefield",
    mk: "mortal kombat",
    sw: "star wars",
  };
  const expand = (s) =>
    norm(s)
      .split(" ")
      .map((w) => ALIASES[w] || w)
      .join(" ");
  const tokens = (s) => new Set(expand(s).split(" ").filter(Boolean));

  // Blend of Jaccard (strict) and coverage (how much of our title the Steam name contains)
  const score = (a, b) => {
    const A = tokens(a), B = tokens(b);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach((t) => B.has(t) && inter++);
    const jaccard = inter / (A.size + B.size - inter);
    const coverage = inter / A.size;
    return 0.5 * jaccard + 0.5 * coverage;
  };

  // Several query variants, from most to least specific
  const queries = [
    ...new Set([
      title,
      expand(title),
      title.split(/[:\-–—]/)[0].trim(),
      title.replace(/\b(deluxe|ultimate|complete|definitive|gold|goty|remastered|collection|edition)\b/gi, "").replace(/\s+/g, " ").trim(),
      title.split(" ").slice(0, 3).join(" "),
    ]),
  ].filter((q) => q.length > 1);

  const search = (term) =>
    new Promise((resolve) =>
      chrome.runtime.sendMessage({ type: "steamSearch", term }, (res) =>
        resolve(res?.ok ? res.items : [])
      )
    );

  // ---------- UI ----------
  const box = document.createElement("div");
  box.className = "srs-box";
  box.innerHTML = `<div class="srs-status">Looking up “${title}” on Steam…</div>`;
  h1.insertAdjacentElement("afterend", box);

  // web = fallback URL (also used for ctrl/middle click), steam = steam:// URL
  const openIn = (u) => "steam://openurl/" + u;
  const btn = (label, web, steam, cls = "") =>
    `<a class="srs-btn ${cls}" href="${web}" data-steam="${steam}" target="_blank" rel="noopener noreferrer">${label}</a>`;

  const searchUrl = "https://store.steampowered.com/search/?term=" + encodeURIComponent(title);
  const manualSearch = btn("🔍 Search on Steam", searchUrl, openIn(searchUrl), "srs-ghost");

  // Try the Steam app first; if the page never loses focus, open the web URL instead.
  box.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-steam]");
    if (!a) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return; // keep normal browser behaviour
    e.preventDefault();

    let launched = false;
    const mark = () => { if (document.hidden || !document.hasFocus()) launched = true; };
    const onBlur = () => (launched = true);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", mark);

    window.location.href = a.dataset.steam;

    setTimeout(() => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", mark);
      if (!launched) window.open(a.href, "_blank", "noopener");
    }, 1500);
  });

  (async () => {
    let best = null, bestScore = 0;
    for (const q of queries) {
      const items = await search(q);
      for (const it of items.filter((i) => i.type === "app")) {
        const s = score(title, it.name);
        if (s > bestScore) { bestScore = s; best = it; }
      }
      if (bestScore >= 0.8) break;
    }

    if (!best || bestScore < 0.34) {
      box.innerHTML = `
        <div class="srs-status">No confident Steam match for “${title}”.</div>
        <div class="srs-row">${manualSearch}
        ${(() => { const u = "https://steamdb.info/search/?a=app&q=" + encodeURIComponent(title); return btn("SteamDB search", u, openIn(u), "srs-ghost"); })()}</div>`;
      return;
    }

    const id = best.id;
    const price = best.price
      ? best.price.final === 0 ? "Free" : "$" + (best.price.final / 100).toFixed(2)
      : "";
    const store = `https://store.steampowered.com/app/${id}/`;

    box.innerHTML = `
      <div class="srs-head">
        ${best.tiny_image ? `<img class="srs-img" src="${best.tiny_image}" alt="">` : ""}
        <div>
          <div class="srs-name">${best.name}</div>
          <div class="srs-sub">App ID ${id}${price ? " · " + price : ""}${best.metascore ? " · Metacritic " + best.metascore : ""}</div>
        </div>
      </div>
      <div class="srs-row">
        ${btn("🛒 Steam Store", store, `steam://store/${id}`, "srs-primary")}
        ${btn("⭐ Reviews", store + "#app_reviews_hash", openIn(store + "#app_reviews_hash"))}
        ${btn("💬 Community", `https://steamcommunity.com/app/${id}`, `steam://url/GameHub/${id}`)}
        ${btn("📊 SteamDB", `https://steamdb.info/app/${id}/`, openIn(`https://steamdb.info/app/${id}/`))}
        ${btn("🛠️ PCGamingWiki", `https://www.pcgamingwiki.com/api/appid.php?appid=${id}`, openIn(`https://www.pcgamingwiki.com/api/appid.php?appid=${id}`))}
        ${manualSearch.replace("Search on Steam", "Wrong game? Search")}
      </div>`;
  })();
})();
