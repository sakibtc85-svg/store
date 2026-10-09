// Shared script for every page of the public store.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const CATEGORIES = ["Electronics & Tech", "Smart Home & Audio", "Kitchen & Appliances",
  "Health & Fitness", "Workstation & Office", "Gaming Gear"];

// ---------- small helpers ----------
const $ = (sel) => document.querySelector(sel);

// h("div", {class:"x", text:"hi"}, child1, child2) builds an element safely.
// "text" uses textContent, so database text can never run as HTML (XSS-safe).
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "text") el.textContent = v;
    else if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  kids.flat().forEach((c) => { if (c != null) el.append(c); });
  return el;
}
const catSlug = (n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
// Only allow https images and real Amazon links.
const safeImg = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : "");
const safeAmazon = (u) => (typeof u === "string" && u.startsWith("https://www.amazon.com/") ? u : "");
const discount = (p) =>
  p.originalPrice && p.originalPrice > p.price ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 3500);
}
function friendly(e) {
  return e && e.code === "permission-denied"
    ? "The server refused this request. Please try again later."
    : "We couldn't load products. Check your connection and try again.";
}

// ---------- state ----------
let settings = { siteTitle: "Tech & Home Finds", contactEmail: "", affiliateTag: "", defaultCommissionRate: 0 };
let products = [];
let loadError = "";
let user = null;
let wishlist = loadLocalWish();

// ---------- wishlist storage ----------
function loadLocalWish() {
  try {
    const a = JSON.parse(localStorage.getItem("wishlist") || "[]");
    return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}
function saveLocalWish() {
  try { localStorage.setItem("wishlist", JSON.stringify(wishlist)); } catch { /* ignore */ }
}

// When a user logs in: merge the local list with the cloud list and save it.
async function syncWishlist() {
  const ref = doc(db, "users", user.uid);
  try {
    const snap = await getDoc(ref);
    const cloud = snap.exists() && Array.isArray(snap.data().wishlist) ? snap.data().wishlist : [];
    wishlist = [...new Set([...cloud, ...wishlist])];
    // Only these keys are allowed by the Firestore rules.
    const data = { name: user.displayName || "", email: user.email || "", photo: user.photoURL || "", wishlist };
    if (!snap.exists()) data.createdAt = serverTimestamp();
    await setDoc(ref, data, { merge: true });
    saveLocalWish();
  } catch (e) {
    toast("Could not sync your wishlist right now.");
  }
}

async function toggleWish(slug) {
  wishlist = wishlist.includes(slug) ? wishlist.filter((s) => s !== slug) : [...wishlist, slug];
  saveLocalWish();
  renderWish();
  refreshHearts();
  if (user) {
    try { await setDoc(doc(db, "users", user.uid), { wishlist }, { merge: true }); }
    catch { toast("Saved on this device, but cloud sync failed."); }
  }
}

function heart(slug) {
  return h("button", {
    class: "heart", type: "button", "data-slug": slug, "aria-label": "Save to wishlist",
    onclick: (e) => { e.preventDefault(); toggleWish(slug); }
  });
}
function refreshHearts() {
  document.querySelectorAll(".heart").forEach((b) => {
    const on = wishlist.includes(b.dataset.slug);
    b.setAttribute("aria-pressed", String(on));
    b.textContent = on ? "♥" : "♡";
  });
}

// ---------- header, footer, drawer ----------
function buildChrome() {
  const header = $("#siteHeader");
  header.className = "header";
  header.append(h("div", { class: "wrap bar" },
    h("a", { href: "/", class: "brand", id: "brand", text: settings.siteTitle }),
    h("div", { class: "actions" },
      h("button", { class: "btn ghost", id: "wishBtn", type: "button", "aria-label": "Open wishlist", onclick: openDrawer },
        "♥ ", h("span", { id: "wishCount", text: "0" })),
      h("span", { id: "userName", class: "muted small" }),
      h("button", { class: "btn", id: "authBtn", type: "button", onclick: onAuthClick, text: "Sign in with Google" }))));

  $("#siteFooter").append(h("div", { class: "wrap" },
    h("p", { text: "As an Amazon Associate I earn from qualifying purchases." }),
    h("p", {}, h("a", { href: "/privacy.html", text: "Privacy" }), " · ",
      h("a", { href: "/disclosure.html", text: "Affiliate Disclosure" }))));

  document.body.append(
    h("div", { id: "overlay", class: "overlay", hidden: "", onclick: closeDrawer }),
    h("aside", { id: "drawer", class: "drawer", hidden: "", "aria-label": "Wishlist" },
      h("div", { class: "drawer-head" },
        h("strong", { text: "Your wishlist" }),
        h("button", { class: "btn ghost", type: "button", "aria-label": "Close wishlist", onclick: closeDrawer, text: "✕" })),
      h("ul", { id: "wishList", class: "wish-list" })),
    h("div", { id: "toast", class: "toast", role: "status", "aria-live": "polite" }));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
}
function openDrawer() { $("#overlay").hidden = false; $("#drawer").hidden = false; }
function closeDrawer() { $("#overlay").hidden = true; $("#drawer").hidden = true; }

function renderWish() {
  $("#wishCount").textContent = wishlist.length;
  const ul = $("#wishList");
  ul.replaceChildren();
  const items = wishlist.map((s) => products.find((p) => p.slug === s)).filter(Boolean);
  if (!items.length) {
    ul.append(h("li", { class: "muted", text: "Nothing saved yet. Tap the heart on a product." }));
    return;
  }
  items.forEach((p) => ul.append(h("li", {},
    h("a", { href: "/p/" + encodeURIComponent(p.slug), text: p.title }),
    h("button", { class: "btn ghost", type: "button", onclick: () => toggleWish(p.slug), text: "Remove" }))));
}

// ---------- login ----------
async function onAuthClick() {
  try {
    if (user) {
      await signOut(auth);
      wishlist = []; // clear the local copy on logout so it is not left on a shared device
      saveLocalWish(); renderWish(); refreshHearts();
      toast("Signed out.");
    } else {
      await signInWithPopup(auth, new GoogleAuthProvider());
    }
  } catch { toast("Sign-in did not complete. Please try again."); }
}

// ---------- data loading ----------
async function loadProducts() {
  try {
    const snap = await getDocs(collection(db, "products"));
    // The document ID is the slug.
    products = snap.docs.map((d) => ({ ...d.data(), slug: d.id }));
  } catch (e) { loadError = friendly(e); }
}

// ---------- home page ----------
function emptyState(title, msg) {
  return h("div", { class: "empty" }, h("h2", { text: title }), h("p", { class: "muted", text: msg }));
}
function priceRow(p) {
  const d = discount(p);
  return h("p", { class: "price-row" },
    h("span", { class: "price", text: money(p.price) }),
    d ? h("s", { class: "muted", text: money(p.originalPrice) }) : null,
    d ? h("span", { class: "badge", text: `-${d}%` }) : null);
}
function card(p) {
  const url = "/p/" + encodeURIComponent(p.slug);
  const img = safeImg(p.imageUrl);
  return h("article", { class: "card" },
    h("a", { href: url, class: "thumb" },
      img ? h("img", { src: img, alt: p.title, loading: "lazy", referrerpolicy: "no-referrer" })
          : h("span", { class: "noimg", text: "No image" })),
    heart(p.slug),
    h("div", { class: "card-body" },
      h("p", { class: "muted small", text: p.brand || "" }),
      h("h2", { class: "card-title" }, h("a", { href: url, text: p.title })),
      priceRow(p),
      h("p", { class: "small " + (p.inStock ? "ok" : "warn"), text: p.inStock ? "In stock" : "Currently unavailable" })));
}
const SORTS = {
  "price-asc": (a, b) => a.price - b.price,
  "price-desc": (a, b) => b.price - a.price,
  discount: (a, b) => discount(b) - discount(a),
  newest: (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
};
function renderGrid() {
  const grid = $("#grid"), status = $("#status");
  grid.replaceChildren();
  if (loadError) { status.textContent = loadError; return; }
  if (!products.length) {
    status.textContent = "";
    grid.append(emptyState("No products yet", "New picks are on the way. Please check back soon."));
    return;
  }
  const q = $("#q").value.trim().toLowerCase();
  const c = $("#cat").value;
  const max = parseFloat($("#maxPrice").value);
  const list = products
    .filter((p) => (!c || p.category === c)
      && (isNaN(max) || p.price <= max)
      && (!q || [p.title, p.brand, p.category].join(" ").toLowerCase().includes(q)))
    .sort(SORTS[$("#sort").value] || SORTS.newest);
  status.textContent = `${list.length} product${list.length === 1 ? "" : "s"}`;
  if (!list.length) { grid.append(emptyState("No matches", "Try a different search or clear the filters.")); return; }
  list.forEach((p) => grid.append(card(p)));
  refreshHearts();
}
function initHome() {
  document.title = settings.siteTitle;
  const cat = $("#cat");
  cat.append(h("option", { value: "", text: "All categories" }));
  CATEGORIES.forEach((c) => cat.append(h("option", { value: c, text: c })));
  const wanted = $("#grid").dataset.cat || new URLSearchParams(location.search).get("cat");
  if (CATEGORIES.includes(wanted)) cat.value = wanted;
  ["q", "cat", "sort", "maxPrice"].forEach((id) => $("#" + id).addEventListener("input", renderGrid));
  renderGrid();
}

// ---------- product page ----------
// Buy: log the click (never block on failure), then open Amazon.
function buy(p, ev) {
  ev.preventDefault();
  const url = safeAmazon(p.affiliateUrl);
  if (!url) { toast("This product link is unavailable."); return; }
  try {
    addDoc(collection(db, "clicks"), {            // exactly the 5 keys the rules allow
      productId: String(p.slug).slice(0, 59),
      productTitle: String(p.title),
      price: Number(p.price),
      commissionRate: Number(settings.defaultCommissionRate) || 0,
      ts: serverTimestamp()
    }).catch(() => {});
  } catch { /* ignore */ }
  window.open(url, "_blank", "noopener,noreferrer");
}

async function shareProduct(p) {
  const url = location.origin + "/p/" + encodeURIComponent(p.slug);
  try {
    if (navigator.share) await navigator.share({ title: p.title, url });
    else { await navigator.clipboard.writeText(url); toast("Link copied."); }
  } catch { /* user cancelled */ }
}

function setHead(p) {
  document.title = p.seoTitle || `${p.title} | ${settings.siteTitle}`;
  let m = document.querySelector('meta[name="description"]');
  if (!m) { m = document.createElement("meta"); m.name = "description"; document.head.append(m); }
  m.content = p.seoDescription || String(p.description || "").slice(0, 155);
  let c = document.querySelector('link[rel="canonical"]');
  if (!c) { c = document.createElement("link"); c.rel = "canonical"; document.head.append(c); }
  c.href = location.origin + "/p/" + encodeURIComponent(p.slug);

  // JSON-LD Product data for search engines (no ratings or reviews).
  const ld = {
    "@context": "https://schema.org", "@type": "Product",
    name: p.title, image: [p.imageUrl], description: p.description, sku: p.asin,
    brand: { "@type": "Brand", name: p.brand },
    offers: {
      "@type": "Offer", price: Number(p.price).toFixed(2), priceCurrency: "USD",
      availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: c.href
    }
  };
  if (document.querySelector('script[type="application/ld+json"]')) return; // server already provided it
  const s = document.createElement("script");
  s.type = "application/ld+json";
  s.textContent = JSON.stringify(ld).replace(/</g, "\\u003c");
  document.head.append(s);
}

function initProduct() {
  const slug = (location.pathname.match(/^\/p\/([a-z0-9-]+)/) || [])[1] || new URLSearchParams(location.search).get("slug") || "";
  const box = $("#product");
  const p = products.find((x) => x.slug === slug);
  if (!p) {
    document.title = "Product not found | " + settings.siteTitle;
    box.replaceChildren(emptyState(loadError ? "Something went wrong" : "Product not found",
      loadError || "This product may have been removed."));
    return;
  }
  setHead(p);
  $("#crumbs").replaceChildren(
    h("a", { href: "/", text: "Home" }), " / ",
    h("a", { href: p.category ? "/category/" + catSlug(p.category) : "/", text: p.category || "Products" }), " / ",
    h("span", { text: p.title }));

  const img = safeImg(p.imageUrl);
  const features = Array.isArray(p.features) ? p.features : [];
  box.replaceChildren(
    h("div", { class: "p-media" },
      img ? h("img", { src: img, alt: p.title, referrerpolicy: "no-referrer" }) : h("span", { class: "noimg", text: "No image" })),
    h("div", { class: "p-info" },
      h("p", { class: "muted", text: p.brand || "" }),
      h("h1", { text: p.title }),
      priceRow(p),
      h("p", { class: "small " + (p.inStock ? "ok" : "warn"), text: p.inStock ? "In stock" : "Currently unavailable" }),
      h("p", { class: "muted small", text: "Prices and availability may change. The price on Amazon at checkout is final." }),
      h("div", { class: "p-actions" },
        h("a", { class: "btn buy", href: safeAmazon(p.affiliateUrl) || "#", target: "_blank",
          rel: "sponsored nofollow noopener", onclick: (e) => buy(p, e), text: "Buy on Amazon" }),
        h("button", { class: "btn ghost", type: "button", text: "Share", onclick: () => shareProduct(p) }),
        heart(p.slug)),
      h("p", { class: "muted small", text: "Affiliate link: we may earn a commission at no extra cost to you." }),
      h("p", { text: p.description || "" }),
      features.length ? [h("h2", { text: "Key features" }), h("ul", { class: "features" }, features.map((f) => h("li", { text: f })))] : null));
}

// Fill contact email on privacy/disclosure pages.
function fillContact() {
  document.querySelectorAll(".contactEmail").forEach((a) => {
    if (settings.contactEmail) { a.textContent = settings.contactEmail; a.href = "mailto:" + settings.contactEmail; }
    else a.textContent = "our contact email (coming soon)";
  });
}

// ---------- start ----------
async function main() {
  buildChrome();
  try {
    const s = await getDoc(doc(db, "settings", "site"));
    if (s.exists()) settings = { ...settings, ...s.data() };
  } catch { /* use defaults */ }
  settings.siteTitle = settings.siteTitle || "Tech & Home Finds";
  $("#brand").textContent = settings.siteTitle;
  fillContact();

  onAuthStateChanged(auth, async (u) => {
    user = u;
    $("#authBtn").textContent = u ? "Sign out" : "Sign in with Google";
    $("#userName").textContent = u ? (u.displayName || "").split(" ")[0] : "";
    if (u) await syncWishlist();
    renderWish(); refreshHearts();
  });

  await loadProducts();
  if ($("#grid")) initHome();
  if ($("#product")) initProduct();
  renderWish(); refreshHearts();
}
main();
