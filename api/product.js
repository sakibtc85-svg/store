const L = require("./_lib");

module.exports = async (req, res) => {
  const slug = String(req.query.slug || "");
  const o = L.origin(req);
  try {
    const [settings, p] = await Promise.all([L.getSettings(), /^[a-z0-9-]{1,60}$/.test(slug) ? L.getProduct(slug) : null]);
    const site = settings.siteTitle;
    if (!p) {
      return L.send(res, 404, L.page({ title: "Product not found | " + site, desc: "This product may have been removed.",
        canonical: o + "/", noindex: true, site,
        body: `<div class="empty"><h2>Product not found</h2><p class="muted">This product may have been removed. <a href="/">Back to all products</a></p></div>` }));
    }
    const url = `${o}/p/${encodeURIComponent(p.slug)}`;
    const title = p.seoTitle || `${p.title} | ${site}`;
    const desc = p.seoDescription || String(p.description || "").slice(0, 155);
    const img = L.safeImg(p.imageUrl);
    const buy = L.safeAmazon(p.affiliateUrl);
    const d = L.discount(p);
    const feats = Array.isArray(p.features) ? p.features : [];
    const catUrl = p.category ? `/category/${L.catSlug(p.category)}` : "/";

    const all = await L.getProducts().catch(() => []);
    const related = all.filter((x) => x.slug !== p.slug && x.category === p.category).slice(0, 4);

    const body = `<nav id="crumbs" class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="${catUrl}">${L.esc(p.category || "Products")}</a> / <span>${L.esc(p.title)}</span></nav>
<article id="product" class="product">
<div class="p-media">${img ? `<img src="${L.esc(img)}" alt="${L.esc(p.title)}" referrerpolicy="no-referrer">` : `<span class="noimg">No image</span>`}</div>
<div class="p-info"><p class="muted">${L.esc(p.brand)}</p><h1>${L.esc(p.title)}</h1>
<p class="price-row"><span class="price">${L.money(p.price)}</span>${d ? `<s class="muted">${L.money(p.originalPrice)}</s><span class="badge">-${d}%</span>` : ""}</p>
<p class="small ${p.inStock ? "ok" : "warn"}">${p.inStock ? "In stock" : "Currently unavailable"}</p>
<p class="muted small">Prices and availability may change. The price on Amazon at checkout is final.</p>
<div class="p-actions"><a class="btn buy" href="${L.esc(buy || "#")}" target="_blank" rel="sponsored nofollow noopener">Buy on Amazon</a></div>
<p class="muted small">Affiliate link: we may earn a commission at no extra cost to you.</p>
<p>${L.esc(p.description)}</p>
${feats.length ? `<h2>Key features</h2><ul class="features">${feats.map((f) => `<li>${L.esc(f)}</li>`).join("")}</ul>` : ""}</div></article>
${related.length ? `<section><h2>More in ${L.esc(p.category)}</h2><div class="grid">${related.map(L.cardHtml).join("")}</div></section>` : ""}`;

    const jsonld = [
      { "@context": "https://schema.org", "@type": "Product", name: p.title, image: img ? [img] : undefined,
        description: p.description, sku: p.asin, brand: { "@type": "Brand", name: p.brand },
        offers: { "@type": "Offer", price: Number(p.price).toFixed(2), priceCurrency: "USD", url: url,
          availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" } },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: o + "/" },
        { "@type": "ListItem", position: 2, name: p.category || "Products", item: o + catUrl },
        { "@type": "ListItem", position: 3, name: p.title, item: url } ] }
    ];
    L.send(res, 200, L.page({ title, desc, canonical: url, image: img, type: "product", jsonld, body, site }), L.CACHE);
  } catch (e) {
    L.send(res, 500, L.page({ title: "Temporarily unavailable", desc: "Please try again shortly.", canonical: o + "/", noindex: true,
      site: "Store", body: `<div class="empty"><h2>Temporarily unavailable</h2><p class="muted">Please try again in a moment.</p></div>` }));
  }
};
