const L = require("./_lib");

module.exports = async (req, res) => {
  const o = L.origin(req);
  try {
    const products = await L.getProducts();
    const cats = [...new Set(products.map((p) => p.category).filter((c) => L.CATEGORIES.includes(c)))];
    const urls = [
      { loc: o + "/" },
      ...cats.map((c) => ({ loc: `${o}/category/${L.catSlug(c)}` })),
      ...products.map((p) => ({ loc: `${o}/p/${encodeURIComponent(p.slug)}`, lastmod: p.updateTime })),
      { loc: o + "/disclosure.html" }, { loc: o + "/privacy.html" }
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
      + urls.map((u) => `  <url><loc>${L.esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${L.esc(u.lastmod)}</lastmod>` : ""}</url>`).join("\n") + "\n</urlset>\n";
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", L.CACHE);
    res.end(xml);
  } catch { res.statusCode = 500; res.end("error"); }
};
