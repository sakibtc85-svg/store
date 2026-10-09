const L = require("./_lib");

module.exports = async (req, res) => {
  const o = L.origin(req);
  const param = req.query.cat ? String(req.query.cat) : "";
  const cat = L.CATEGORIES.find((c) => c === param || L.catSlug(c) === param) || "";
  try {
    const [settings, products] = await Promise.all([L.getSettings(), L.getProducts()]);
    const site = settings.siteTitle;
    if (param && !cat) {
      return L.send(res, 404, L.page({ title: "Category not found | " + site, desc: "Category not found.", canonical: o + "/",
        noindex: true, site, body: `<div class="empty"><h2>Category not found</h2><p><a href="/">All products</a></p></div>` }));
    }
    const list = cat ? products.filter((p) => p.category === cat) : products;
    const url = o + (cat ? `/category/${L.catSlug(cat)}` : "/");
    const title = cat ? `Best ${cat} Picks | ${site}` : `${site} - Hand-picked tech & home products`;
    const desc = cat
      ? `Hand-picked ${cat} products with current prices and links to buy on Amazon.`
      : "Hand-picked tech and home appliance products, with prices and links to buy on Amazon.";
    const nav = L.CATEGORIES.map((c) => `<a class="btn ghost" href="/category/${L.catSlug(c)}">${L.esc(c)}</a>`).join(" ");
    const body = `<h1>${cat ? L.esc(cat) : "Hand-picked tech &amp; home finds"}</h1>
<nav class="crumbs" aria-label="Categories">${nav}</nav>
<section class="controls" aria-label="Search and filters">
<input id="q" type="search" placeholder="Search products" aria-label="Search products">
<select id="cat" aria-label="Category"></select>
<select id="sort" aria-label="Sort by"><option value="newest">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="discount">Biggest discount</option></select>
<input id="maxPrice" type="number" min="0" step="1" inputmode="decimal" placeholder="Max price ($)" aria-label="Maximum price in dollars">
</section>
<p class="muted small">Prices and availability may change. The price on Amazon at checkout is final.</p>
<p id="status" class="muted" role="status">${list.length} product${list.length === 1 ? "" : "s"}</p>
<div id="grid" class="grid" data-cat="${L.esc(cat)}">${list.map(L.cardHtml).join("")}</div>`;
    const jsonld = [{ "@context": "https://schema.org", "@type": "ItemList",
      itemListElement: list.slice(0, 50).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${o}/p/${encodeURIComponent(p.slug)}`, name: p.title })) }];
    if (!cat) jsonld.push({ "@context": "https://schema.org", "@type": "WebSite", name: site, url: o + "/" });
    L.send(res, 200, L.page({ title, desc, canonical: url, jsonld, body, site, image: list[0] && L.safeImg(list[0].imageUrl) }), L.CACHE);
  } catch (e) {
    L.send(res, 500, L.page({ title: "Temporarily unavailable", desc: "Please try again shortly.", canonical: o + "/", noindex: true,
      site: "Store", body: `<div class="empty"><h2>Temporarily unavailable</h2><p class="muted">Please try again in a moment.</p></div>` }));
  }
};
