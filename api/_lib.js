// Shared helpers for the server-rendered pages. Reads Firestore through its public REST API
// (your rules already allow public read on products and settings).
const PROJECT = "affiliates-750f8";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const CATEGORIES = ["Electronics & Tech", "Smart Home & Audio", "Kitchen & Appliances",
  "Health & Fitness", "Workstation & Office", "Gaming Gear"];
const DEFAULTS = { siteTitle: "Tech & Home Finds", contactEmail: "", affiliateTag: "", defaultCommissionRate: 0 };

const catSlug = (n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const money = (n) => "$" + (Number(n) || 0).toFixed(2);
const discount = (p) => (p.originalPrice && p.originalPrice > p.price ? Math.round((1 - p.price / p.originalPrice) * 100) : 0);
const safeImg = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : "");
const safeAmazon = (u) => (typeof u === "string" && u.startsWith("https://www.amazon.com/") ? u : "");
const origin = (req) => `https://${req.headers["x-forwarded-host"] || req.headers.host}`;

function val(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(val);
  if ("mapValue" in v) return fields(v.mapValue.fields || {});
  return null;
}
function fields(f) { const o = {}; for (const [k, v] of Object.entries(f)) o[k] = val(v); return o; }
function toProduct(d) {
  const p = fields(d.fields || {});
  p.slug = d.name.split("/").pop();
  p.updateTime = d.updateTime;
  return p;
}
async function getProducts() {
  const out = []; let token = "";
  do {
    const r = await fetch(`${BASE}/products?pageSize=300${token ? "&pageToken=" + encodeURIComponent(token) : ""}`);
    if (!r.ok) throw new Error("firestore " + r.status);
    const j = await r.json();
    (j.documents || []).forEach((d) => out.push(toProduct(d)));
    token = j.nextPageToken || "";
  } while (token);
  return out.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}
async function getProduct(slug) {
  const r = await fetch(`${BASE}/products/${slug}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("firestore " + r.status);
  return toProduct(await r.json());
}
async function getSettings() {
  try {
    const r = await fetch(`${BASE}/settings/site`);
    if (!r.ok) return { ...DEFAULTS };
    return { ...DEFAULTS, ...fields((await r.json()).fields || {}) };
  } catch { return { ...DEFAULTS }; }
}

function cardHtml(p) {
  const url = "/p/" + encodeURIComponent(p.slug);
  const img = safeImg(p.imageUrl);
  const d = discount(p);
  return `<article class="card"><a href="${url}" class="thumb">${img
    ? `<img src="${esc(img)}" alt="${esc(p.title)}" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="noimg">No image</span>`}</a>
<div class="card-body"><p class="muted small">${esc(p.brand)}</p>
<h2 class="card-title"><a href="${url}">${esc(p.title)}</a></h2>
<p class="price-row"><span class="price">${money(p.price)}</span>${d ? `<s class="muted">${money(p.originalPrice)}</s><span class="badge">-${d}%</span>` : ""}</p>
<p class="small ${p.inStock ? "ok" : "warn"}">${p.inStock ? "In stock" : "Currently unavailable"}</p></div></article>`;
}

function page({ title, desc, canonical, image, type = "website", jsonld = [], body, noindex = false, site }) {
  const ld = jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("\n");
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="${noindex ? "noindex,follow" : "index,follow,max-image-preview:large"}">
<meta property="og:site_name" content="${esc(site)}"><meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">${image ? `<meta property="og:image" content="${esc(image)}">` : ""}
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">${image ? `<meta name="twitter:image" content="${esc(image)}">` : ""}
<link rel="stylesheet" href="/style.css">
${ld}
</head><body>
<a class="skip" href="#main">Skip to content</a>
<header id="siteHeader"></header>
<main id="main" class="wrap">${body}</main>
<footer id="siteFooter"></footer>
<script type="module" src="/app.js"></script>
</body></html>`;
}

function send(res, status, html, cache) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", cache || "no-store");
  res.end(html);
}
const CACHE = "public, s-maxage=1800, stale-while-revalidate=86400";

module.exports = { CATEGORIES, catSlug, esc, money, discount, safeImg, safeAmazon, origin,
  getProducts, getProduct, getSettings, cardHtml, page, send, CACHE };
