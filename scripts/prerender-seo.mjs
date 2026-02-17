import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DIST_DIR = path.resolve(process.cwd(), "dist");
const TEMPLATE_PATH = path.join(DIST_DIR, "index.html");
const PRERENDER_ORIGIN = String(process.env.PRERENDER_ORIGIN || "https://eventwow.co.uk").replace(/\/+$/, "");
const CANONICAL_BASE = "https://eventwow.co.uk";
const MAX_DYNAMIC_ROUTES = Number.isFinite(Number(process.env.PRERENDER_MAX_ROUTES))
  ? Math.max(10, Number(process.env.PRERENDER_MAX_ROUTES))
  : 120;
const ENV_SUPPLIER_SLUGS = String(process.env.PRERENDER_SUPPLIER_SLUGS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const FALLBACK_CATEGORIES = [
  { slug: "pizza-catering", display_name: "Pizza Catering", short_description: "Pizza catering suppliers for events." },
  { slug: "photographers", display_name: "Photographers", short_description: "Trusted event photographers." },
  { slug: "djs", display_name: "DJs", short_description: "Book DJs for weddings, parties, and events." },
  { slug: "venues", display_name: "Venues", short_description: "Explore event venues for every style." },
  { slug: "florists", display_name: "Florists", short_description: "Floral suppliers for weddings and events." },
  { slug: "bands", display_name: "Bands", short_description: "Live bands and music acts." },
  { slug: "decor", display_name: "Decor", short_description: "Decor and styling suppliers." },
  { slug: "cakes", display_name: "Cakes", short_description: "Celebration cakes and dessert suppliers." },
];

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clip(value, max) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}...`;
}

function ensureTag(html, regex, tag) {
  if (regex.test(html)) return html.replace(regex, tag);
  return html.replace("</head>", `  ${tag}\n</head>`);
}

function setSeoHead(template, { title, description, canonicalPath, ogType = "website" }) {
  const safeTitle = escapeHtml(title || "Eventwow");
  const safeDescription = escapeHtml(description || "Eventwow");
  const canonical = `${CANONICAL_BASE}${canonicalPath.startsWith("/") ? canonicalPath : `/${canonicalPath}`}`;
  const safeCanonical = escapeHtml(canonical);
  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  html = ensureTag(html, /<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${safeDescription}" />`);
  html = ensureTag(html, /<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${safeTitle}" />`);
  html = ensureTag(html, /<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${safeDescription}" />`);
  html = ensureTag(html, /<meta\s+property="og:type"[^>]*>/i, `<meta property="og:type" content="${escapeHtml(ogType)}" />`);
  html = ensureTag(html, /<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${safeCanonical}" />`);
  html = ensureTag(html, /<meta\s+name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${safeTitle}" />`);
  html = ensureTag(html, /<meta\s+name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${safeDescription}" />`);
  html = ensureTag(html, /<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${safeCanonical}" />`);
  return html;
}

function setRootHtml(template, rootHtml) {
  const marker = /<div id="root"><\/div>/i;
  if (!marker.test(template)) {
    throw new Error("Could not find <div id=\"root\"></div> marker in dist/index.html");
  }
  return template.replace(marker, `<div id="root">${rootHtml}</div>`);
}

function renderList(items, emptyText) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  }
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function pageShell({ eyebrow, title, description, primaryListTitle, primaryList, secondaryListTitle, secondaryList }) {
  return `
    <main class="seo-wrap">
      <section class="hero">
        <p class="eyebrow">${escapeHtml(eyebrow || "Eventwow")}</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="lede">${escapeHtml(description)}</p>
      </section>
      <section class="grid">
        <article class="card">
          <h2>${escapeHtml(primaryListTitle)}</h2>
          ${renderList(primaryList, "No items available yet.")}
        </article>
        <article class="card">
          <h2>${escapeHtml(secondaryListTitle)}</h2>
          ${renderList(secondaryList, "No items available yet.")}
        </article>
      </section>
    </main>
    <style>
      .seo-wrap{max-width:1100px;margin:0 auto;padding:24px 16px 32px;color:#0f172a;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
      .hero h1{font-size:clamp(1.8rem,4vw,2.8rem);line-height:1.1;margin:.2rem 0 .8rem}
      .eyebrow{margin:0;color:#0f766e;font-weight:600;font-size:.9rem}
      .lede{margin:0;max-width:70ch;color:#334155}
      .grid{display:grid;gap:16px;margin-top:20px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
      .card{border:1px solid #cbd5e1;border-radius:14px;background:#fff;padding:16px}
      .card h2{margin:0 0 10px;font-size:1rem}
      .card ul{margin:0;padding-left:18px;display:grid;gap:6px}
      .muted{margin:0;color:#475569}
    </style>
  `;
}

async function fetchJson(pathname) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  const url = `${PRERENDER_ORIGIN}${pathname}`;
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function collectCategories() {
  const primary = await fetchJson("/api/public/categories");
  if (Array.isArray(primary) && primary.length > 0) return primary;
  const featured = await fetchJson("/api/public/categories/featured");
  if (Array.isArray(featured) && featured.length > 0) return featured;
  return FALLBACK_CATEGORIES;
}

async function collectSuppliers() {
  const rows = [];
  let offset = 0;
  while (rows.length < MAX_DYNAMIC_ROUTES) {
    const page = await fetchJson(`/api/public-suppliers?limit=60&offset=${offset}`);
    const list = Array.isArray(page?.rows) ? page.rows : [];
    if (!list.length) break;
    rows.push(...list);
    offset += list.length;
    if (rows.length >= Number(page?.totalCount || rows.length)) break;
  }
  if (rows.length > 0) return rows.slice(0, MAX_DYNAMIC_ROUTES);

  const dedupe = new Map();
  const seeds = ["a", "e", "i", "o", "u", "dj", "pizza", "photo", "venue", "cake", "band", "florist"];
  for (const q of seeds) {
    const search = await fetchJson(`/api/public/suppliers/search?q=${encodeURIComponent(q)}&page=1&pageSize=24`);
    const list = Array.isArray(search?.suppliers) ? search.suppliers : [];
    for (const row of list) {
      const slug = String(row?.slug || "").trim();
      if (!slug) continue;
      dedupe.set(slug, row);
      if (dedupe.size >= MAX_DYNAMIC_ROUTES) break;
    }
    if (dedupe.size >= MAX_DYNAMIC_ROUTES) break;
  }
  return Array.from(dedupe.values()).slice(0, MAX_DYNAMIC_ROUTES);
}

async function collectVenues() {
  const rows = [];
  let offset = 0;
  while (rows.length < MAX_DYNAMIC_ROUTES) {
    const page = await fetchJson(`/api/public-venues?limit=60&offset=${offset}`);
    const list = Array.isArray(page?.rows) ? page.rows : [];
    if (!list.length) break;
    rows.push(...list);
    offset += list.length;
    if (rows.length >= Number(page?.totalCount || rows.length)) break;
  }
  return rows.slice(0, MAX_DYNAMIC_ROUTES);
}

async function collectSupplierSlugsFromVenueProfiles(venueRows) {
  const slugs = new Set();
  for (const venue of (venueRows || []).slice(0, MAX_DYNAMIC_ROUTES)) {
    const slug = String(venue?.slug || "").trim();
    if (!slug) continue;
    const profile = await fetchJson(`/api/public-venue?slug=${encodeURIComponent(slug)}`);
    const linked = Array.isArray(profile?.linkedSuppliers) ? profile.linkedSuppliers : [];
    for (const supplier of linked) {
      const supplierSlug = String(supplier?.slug || "").trim();
      if (supplierSlug) slugs.add(supplierSlug);
      if (slugs.size >= MAX_DYNAMIC_ROUTES) return Array.from(slugs);
    }
  }
  return Array.from(slugs);
}

async function writeRouteHtml(routePath, html) {
  const relative = routePath === "/" ? "index.html" : path.join(routePath.slice(1), "index.html");
  const outputPath = path.join(DIST_DIR, relative);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf8");
}

function buildPage(template, routePath, page) {
  const withSeo = setSeoHead(template, {
    title: page.title,
    description: page.description,
    canonicalPath: routePath,
    ogType: page.ogType || "website",
  });
  return setRootHtml(withSeo, page.rootHtml);
}

async function main() {
  const template = await readFile(TEMPLATE_PATH, "utf8");
  const categories = await collectCategories();
  const featuredSuppliers = (await fetchJson("/api/public/featured-suppliers?limit=8")) || {};
  const venueRows = await collectVenues();
  const supplierRows = await collectSuppliers();
  const venueSupplierSlugs = await collectSupplierSlugsFromVenueProfiles(venueRows);
  const supplierSlugSet = new Set(
    [...supplierRows.map((row) => row?.slug), ...venueSupplierSlugs, ...ENV_SUPPLIER_SLUGS]
      .map((slug) => String(slug || "").trim())
      .filter(Boolean)
  );

  const staticPages = [
    {
      route: "/",
      title: "Book trusted event suppliers fast | Eventwow",
      description: "Find It. Book It. Wow Them. Compare trusted suppliers and venues on Eventwow.",
      rootHtml: pageShell({
        eyebrow: "Eventwow",
        title: "Book trusted event suppliers faster.",
        description: "Find It. Book It. Wow Them.",
        primaryListTitle: "Popular categories",
        primaryList: categories.slice(0, 8).map((c) => c.display_name || c.slug),
        secondaryListTitle: "Featured suppliers",
        secondaryList: (Array.isArray(featuredSuppliers?.suppliers) ? featuredSuppliers.suppliers : [])
          .slice(0, 8)
          .map((s) => s.name || s.business_name || s.slug),
      }),
    },
    {
      route: "/browse",
      title: "Browse suppliers | Eventwow",
      description: "Search trusted suppliers or browse categories on Eventwow.",
      rootHtml: pageShell({
        eyebrow: "Supplier directory",
        title: "Browse suppliers",
        description: "Search trusted suppliers or jump into a category.",
        primaryListTitle: "Featured categories",
        primaryList: categories.slice(0, 16).map((c) => c.display_name || c.slug),
        secondaryListTitle: "Top suppliers",
        secondaryList: supplierRows.slice(0, 12).map((s) => s.name || s.business_name || s.slug),
      }),
    },
    {
      route: "/venues",
      title: "Browse venues | Eventwow",
      description: "Discover event venues and supplier-ready spaces on Eventwow.",
      rootHtml: pageShell({
        eyebrow: "Venue directory",
        title: "Browse venues",
        description: "Find venue spaces for weddings, parties, and corporate events.",
        primaryListTitle: "Published venues",
        primaryList: venueRows.slice(0, 18).map((v) => v.name || v.slug),
        secondaryListTitle: "Locations",
        secondaryList: venueRows
          .map((v) => v.locationLabel)
          .filter(Boolean)
          .slice(0, 18),
      }),
    },
    {
      route: "/categories",
      title: "Browse suppliers | Eventwow",
      description: "Explore supplier categories and compare trusted event suppliers.",
      rootHtml: pageShell({
        eyebrow: "Categories",
        title: "Browse suppliers",
        description: "Explore supplier categories and compare quotes faster.",
        primaryListTitle: "Featured categories",
        primaryList: categories.slice(0, 16).map((c) => c.display_name || c.slug),
        secondaryListTitle: "Recently featured suppliers",
        secondaryList: supplierRows.slice(0, 12).map((s) => s.name || s.business_name || s.slug),
      }),
    },
  ];

  for (const page of staticPages) {
    await writeRouteHtml(page.route, buildPage(template, page.route, page));
  }

  for (const cat of categories.slice(0, MAX_DYNAMIC_ROUTES)) {
    const slug = String(cat?.slug || "").trim();
    if (!slug) continue;
    const payload = await fetchJson(`/api/public/categories/${encodeURIComponent(slug)}/suppliers?page=1&pageSize=24`);
    const name = payload?.category?.display_name || cat.display_name || slug;
    const shortDescription =
      payload?.category?.short_description || cat.short_description || `Browse trusted ${name.toLowerCase()} suppliers on Eventwow.`;
    const route = `/categories/${slug}`;
    const rootHtml = pageShell({
      eyebrow: "Category",
      title: name,
      description: shortDescription,
      primaryListTitle: `${name} suppliers`,
      primaryList: (Array.isArray(payload?.suppliers) ? payload.suppliers : []).slice(0, 18).map((s) => s.name || s.slug),
      secondaryListTitle: "Other categories",
      secondaryList: categories.slice(0, 12).map((item) => item.display_name || item.slug),
    });
    await writeRouteHtml(
      route,
      buildPage(template, route, {
        title: `${name} | Eventwow`,
        description: clip(shortDescription, 160),
        rootHtml,
      })
    );
  }

  for (const slug of Array.from(supplierSlugSet).slice(0, MAX_DYNAMIC_ROUTES)) {
    const profile = await fetchJson(`/api/public-supplier?slug=${encodeURIComponent(slug)}`);
    const row = profile?.supplier;
    if (!row) continue;
    const name = row.name || slug;
    const shortDescription = row.shortDescription || row.short_description || "Supplier profile on Eventwow.";
    const about = clip(row.about || row.description || "", 220);
    const location = row.locationLabel || "United Kingdom";
    const route = `/suppliers/${slug}`;
    const rootHtml = pageShell({
      eyebrow: "Supplier profile",
      title: name,
      description: shortDescription,
      primaryListTitle: "At a glance",
      primaryList: [location, row.is_insured ? "Insured" : "", row.fsa_rating_value ? `Food hygiene rating: ${row.fsa_rating_value}` : ""].filter(Boolean),
      secondaryListTitle: "About",
      secondaryList: about ? [about] : [],
    });
    await writeRouteHtml(
      route,
      buildPage(template, route, {
        title: `${name} | Eventwow`,
        description: clip(shortDescription, 160),
        rootHtml,
      })
    );
  }

  for (const venue of venueRows.slice(0, MAX_DYNAMIC_ROUTES)) {
    const slug = String(venue?.slug || "").trim();
    if (!slug) continue;
    const profile = await fetchJson(`/api/public-venue?slug=${encodeURIComponent(slug)}`);
    const row = profile?.venue;
    if (!row) continue;
    const name = row.name || venue.name || slug;
    const shortDescription = row.shortDescription || row.short_description || "Venue profile on Eventwow.";
    const route = `/venues/${slug}`;
    const supplierNames = (Array.isArray(profile?.linkedSuppliers) ? profile.linkedSuppliers : [])
      .slice(0, 12)
      .map((s) => s.name || s.slug);
    const guestMax = Number(row.guestMax);
    const guestLabel = Number.isFinite(guestMax) && guestMax > 0 ? `Up to ${guestMax} guests` : "";
    const rootHtml = pageShell({
      eyebrow: "Venue profile",
      title: name,
      description: shortDescription,
      primaryListTitle: "Venue details",
      primaryList: [row.locationLabel, guestLabel, clip(row.about || "", 200)].filter(Boolean),
      secondaryListTitle: "Suppliers linked to this venue",
      secondaryList: supplierNames,
    });
    await writeRouteHtml(
      route,
      buildPage(template, route, {
        title: `${name} | Eventwow`,
        description: clip(shortDescription, 160),
        rootHtml,
      })
    );
  }

  console.log("[prerender-seo] completed", {
    origin: PRERENDER_ORIGIN,
    categories: categories.length,
    suppliers: supplierSlugSet.size,
    venues: venueRows.length,
  });
}

main().catch((err) => {
  console.error("[prerender-seo] failed:", err);
  process.exit(1);
});
