import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DIST_DIR = path.resolve(process.cwd(), "dist");
const TEMPLATE_PATH = path.join(DIST_DIR, "index.html");
const SITE_ORIGIN = "https://eventwow.co.uk";
const TOP_N = Number.isFinite(Number(process.env.PRERENDER_TOP_N))
  ? Math.max(10, Math.min(500, Number(process.env.PRERENDER_TOP_N)))
  : 200;

async function loadDotEnv() {
  const envPaths = [".env.local", ".env"];
  for (const file of envPaths) {
    try {
      const raw = await readFile(path.resolve(process.cwd(), file), "utf8");
      const lines = raw.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx <= 0) continue;
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
        if (!key) continue;
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch {
      // Ignore missing env files.
    }
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clip(value, max = 180) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}...`;
}

function canonicalFor(routePath) {
  const normalized = routePath.startsWith("/") ? routePath : `/${routePath}`;
  return `${SITE_ORIGIN}${normalized}`;
}

function ensureTag(html, regex, tag) {
  if (regex.test(html)) return html.replace(regex, tag);
  return html.replace("</head>", `  ${tag}\n</head>`);
}

function setSeoHead(template, { title, description, canonicalPath, jsonLd = null }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const canonical = canonicalFor(canonicalPath);
  const safeCanonical = escapeHtml(canonical);
  const safeImage = `${SITE_ORIGIN}/eventwow-social-card.jpg`;

  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  html = ensureTag(html, /<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${safeDescription}" />`);
  html = ensureTag(html, /<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${safeTitle}" />`);
  html = ensureTag(html, /<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${safeDescription}" />`);
  html = ensureTag(html, /<meta\s+property="og:type"[^>]*>/i, `<meta property="og:type" content="website" />`);
  html = ensureTag(html, /<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${safeCanonical}" />`);
  html = ensureTag(html, /<meta\s+property="og:image"[^>]*>/i, `<meta property="og:image" content="${safeImage}" />`);
  html = ensureTag(html, /<meta\s+name="twitter:card"[^>]*>/i, `<meta name="twitter:card" content="summary_large_image" />`);
  html = ensureTag(html, /<meta\s+name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${safeTitle}" />`);
  html = ensureTag(html, /<meta\s+name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${safeDescription}" />`);
  html = ensureTag(html, /<meta\s+name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${safeImage}" />`);
  html = ensureTag(html, /<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${safeCanonical}" />`);

  if (jsonLd) {
    const script = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
    html = ensureTag(html, /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/i, script);
  }

  return html;
}

function setRootHtml(template, rootHtml) {
  const marker = /<div id="root"><\/div>/i;
  if (!marker.test(template)) {
    throw new Error("Could not find <div id=\"root\"></div> marker in dist/index.html");
  }
  return template.replace(marker, `<div id="root">${rootHtml}</div>`);
}

function appShell({ h1, intro, bodyHtml }) {
  return [
    '<main class="pr-wrap">',
    '<section class="pr-hero">',
    `<h1>${escapeHtml(h1)}</h1>`,
    `<p>${escapeHtml(intro)}</p>`,
    "</section>",
    bodyHtml,
    "</main>",
    "<style>",
    ".pr-wrap{max-width:1120px;margin:0 auto;padding:24px 16px 40px;color:#0f172a;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}",
    ".pr-hero{padding:20px 0 10px}",
    ".pr-hero h1{margin:0;font-size:clamp(1.9rem,4vw,2.9rem);line-height:1.1;color:#1e3a8a}",
    ".pr-hero p{margin:.7rem 0 0;color:#334155;max-width:75ch}",
    ".pr-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));margin-top:18px}",
    ".pr-card{background:#fff;border:1px solid #dbeafe;border-radius:14px;padding:14px}",
    ".pr-card h2{margin:0 0 .55rem;font-size:1rem;color:#1e3a8a}",
    ".pr-card p{margin:.45rem 0 0;color:#475569;font-size:.92rem}",
    ".pr-list{margin:0;padding-left:18px;display:grid;gap:6px}",
    ".pr-list a{color:#1d4ed8;text-decoration:none}",
    ".pr-list a:hover{text-decoration:underline}",
    ".pr-inline{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}",
    ".pr-pill{display:inline-block;border:1px solid #bfdbfe;border-radius:999px;padding:5px 10px;font-size:.82rem;color:#1e3a8a;text-decoration:none;background:#eff6ff}",
    ".pr-pill:hover{background:#dbeafe}",
    "</style>",
  ].join("");
}

function linkedList(items, emptyText) {
  if (!items.length) return `<p>${escapeHtml(emptyText)}</p>`;
  return `<ul class="pr-list">${items
    .map((item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`)
    .join("")}</ul>`;
}

function homeHtml(categories, venues, suppliers) {
  const categoryLinks = categories.slice(0, 10).map((cat) => ({ href: `/categories/${cat.slug}`, label: cat.name }));
  const venueLinks = venues.slice(0, 8).map((venue) => ({ href: `/venues/${venue.slug}`, label: venue.name }));
  const supplierLinks = suppliers.slice(0, 8).map((supplier) => ({ href: `/suppliers/${supplier.slug}`, label: supplier.name }));
  return appShell({
    h1: "Plan your event. Get trusted suppliers in minutes.",
    intro:
      "Eventwow connects you with venues and event professionals across the UK - free to post, easy to compare, built for confidence.",
    bodyHtml: [
      '<section class="pr-grid">',
      '<article class="pr-card"><h2>Explore Event Services</h2>',
      linkedList(categoryLinks, "No categories available yet."),
      "</article>",
      '<article class="pr-card"><h2>Discover venues near you</h2>',
      linkedList(venueLinks, "No venues available yet."),
      "</article>",
      '<article class="pr-card"><h2>Trusted suppliers</h2>',
      linkedList(supplierLinks, "No suppliers available yet."),
      "</article>",
      "</section>",
      '<section class="pr-inline">',
      '<a class="pr-pill" href="/request">Post an enquiry</a>',
      '<a class="pr-pill" href="/venues">Browse venues</a>',
      '<a class="pr-pill" href="/suppliers">Browse suppliers</a>',
      "</section>",
    ].join(""),
  });
}

function listPageHtml({ h1, intro, links, secondaryLinks, secondaryTitle }) {
  return appShell({
    h1,
    intro,
    bodyHtml: [
      '<section class="pr-grid">',
      '<article class="pr-card"><h2>Listings</h2>',
      linkedList(links, "No listings available yet."),
      "</article>",
      `<article class="pr-card"><h2>${escapeHtml(secondaryTitle)}</h2>`,
      linkedList(secondaryLinks, "No additional links available."),
      "</article>",
      "</section>",
    ].join(""),
  });
}

function detailPageHtml({ h1, intro, details, relatedLinks }) {
  const detailItems = details.filter(Boolean).map((line) => ({ href: "#", label: line }));
  return appShell({
    h1,
    intro,
    bodyHtml: [
      '<section class="pr-grid">',
      '<article class="pr-card"><h2>At a glance</h2>',
      detailItems.length
        ? `<ul class="pr-list">${detailItems.map((item) => `<li>${escapeHtml(item.label)}</li>`).join("")}</ul>`
        : "<p>No additional detail available.</p>",
      "</article>",
      '<article class="pr-card"><h2>Related links</h2>',
      linkedList(relatedLinks, "No related links available."),
      "</article>",
      "</section>",
    ].join(""),
  });
}

async function writeRouteHtml(routePath, html) {
  const relative = routePath === "/" ? "index.html" : path.join(routePath.slice(1), "index.html");
  const outputPath = path.join(DIST_DIR, relative);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf8");
}

async function writeSitemap(routes) {
  const unique = Array.from(new Set(routes)).sort();
  const body = unique
    .map((route) => {
      const loc = canonicalFor(route);
      return `  <url><loc>${escapeHtml(loc)}</loc></url>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  await writeFile(path.join(DIST_DIR, "sitemap.xml"), xml, "utf8");
}

function requireSupabaseClient() {
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL (or VITE_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY for prerender build.");
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

async function tableColumns(admin, tableName) {
  const { data, error } = await admin
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", tableName);
  if (error) return new Set();
  return new Set((data || []).map((row) => String(row.column_name || "")));
}

async function loadCategories(admin) {
  const optionCols = await tableColumns(admin, "supplier_category_options");
  const nameCol = optionCols.has("display_name") ? "display_name" : optionCols.has("label") ? "label" : "slug";
  const descCol = optionCols.has("browse_copy") ? "browse_copy" : optionCols.has("description") ? "description" : null;
  const selectCols = ["slug", nameCol, "is_active"];
  if (descCol) selectCols.push(descCol);

  let query = admin.from("supplier_category_options").select(selectCols.join(","));
  if (optionCols.has("is_active")) query = query.eq("is_active", true);
  if (optionCols.has("featured_order")) query = query.order("featured_order", { ascending: true, nullsFirst: false });
  query = query.order(nameCol, { ascending: true });

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load categories: ${error.message}`);

  return (data || [])
    .map((row) => ({
      slug: String(row.slug || "").trim(),
      name: String(row[nameCol] || row.slug || "").trim(),
      description: String(descCol ? row[descCol] || "" : "").trim(),
    }))
    .filter((row) => row.slug && row.name);
}

async function loadTopVenues(admin, limit, columns) {
  const orderBy = columns.has("published_at") ? "published_at" : "created_at";
  const visibilityColumn = columns.has("is_published") ? "is_published" : columns.has("listed_publicly") ? "listed_publicly" : null;
  let query = admin
    .from("venues")
    .select("slug,name,location_label,city,short_description,description,about,hero_image_url,created_at")
    .order(orderBy, { ascending: false, nullsFirst: false })
    .limit(limit);
  if (visibilityColumn) query = query.eq(visibilityColumn, true);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load venues for prerender: ${error.message}`);
  return (data || [])
    .map((row) => ({
      slug: String(row.slug || "").trim(),
      name: clip(row.name || "Venue", 120),
      town: clip(row.location_label || row.city || "", 80),
      summary: clip(row.short_description || row.description || row.about || "", 180),
      image: String(row.hero_image_url || "").trim(),
    }))
    .filter((row) => row.slug && row.name);
}

async function loadTopSuppliers(admin, limit, columns) {
  const orderBy = columns.has("published_at") ? "published_at" : "created_at";
  const visibilityColumn = columns.has("is_published") ? "is_published" : null;
  let query = admin
    .from("suppliers")
    .select("slug,business_name,location_label,base_city,short_description,description,about,listing_categories,created_at")
    .order(orderBy, { ascending: false, nullsFirst: false })
    .limit(limit);
  if (visibilityColumn) query = query.eq(visibilityColumn, true);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load suppliers for prerender: ${error.message}`);
  return (data || [])
    .map((row) => {
      const categories = Array.isArray(row.listing_categories) ? row.listing_categories : [];
      return {
        slug: String(row.slug || "").trim(),
        name: clip(row.business_name || "Supplier", 120),
        town: clip(row.location_label || row.base_city || "", 80),
        summary: clip(row.short_description || row.description || row.about || "", 180),
        category: clip(categories[0] || "", 60),
      };
    })
    .filter((row) => row.slug && row.name);
}

function makeVenueJsonLd(venue) {
  const address = { addressCountry: "GB" };
  if (venue.town) address.addressLocality = venue.town;
  return {
    "@context": "https://schema.org",
    "@type": "EventVenue",
    name: venue.name,
    url: canonicalFor(`/venues/${venue.slug}`),
    description: venue.summary || undefined,
    image: venue.image || undefined,
    address,
  };
}

function makeSupplierJsonLd(supplier) {
  const address = { addressCountry: "GB" };
  if (supplier.town) address.addressLocality = supplier.town;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: supplier.name,
    url: canonicalFor(`/suppliers/${supplier.slug}`),
    description: supplier.summary || undefined,
    areaServed: supplier.town || undefined,
    address,
  };
}

async function main() {
  await loadDotEnv();
  const template = await readFile(TEMPLATE_PATH, "utf8");
  const admin = requireSupabaseClient();
  const [categories, venueCols, supplierCols] = await Promise.all([
    loadCategories(admin),
    tableColumns(admin, "venues"),
    tableColumns(admin, "suppliers"),
  ]);
  const [venues, suppliers] = await Promise.all([
    loadTopVenues(admin, TOP_N, venueCols),
    loadTopSuppliers(admin, TOP_N, supplierCols),
  ]);

  const routes = ["/", "/venues", "/suppliers", "/categories"];

  const homeDoc = setRootHtml(
    setSeoHead(template, {
      title: "Eventwow | Venues & event suppliers across the UK",
      description:
        "Eventwow connects you with venues and event professionals across the UK - free to post, easy to compare, built for confidence.",
      canonicalPath: "/",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Eventwow",
        url: SITE_ORIGIN,
      },
    }),
    homeHtml(categories, venues, suppliers)
  );
  await writeRouteHtml("/", homeDoc);

  const venueListDoc = setRootHtml(
    setSeoHead(template, {
      title: "Event venues near you | Eventwow",
      description: "Discover event venues across the UK and compare options by location, style, and guest capacity.",
      canonicalPath: "/venues",
    }),
    listPageHtml({
      h1: "Event venues near you",
      intro: "Browse published venues and explore spaces that fit your event plans.",
      links: venues.slice(0, 80).map((venue) => ({ href: `/venues/${venue.slug}`, label: venue.name })),
      secondaryTitle: "Popular categories",
      secondaryLinks: categories.slice(0, 20).map((cat) => ({ href: `/categories/${cat.slug}`, label: cat.name })),
    })
  );
  await writeRouteHtml("/venues", venueListDoc);

  const supplierListDoc = setRootHtml(
    setSeoHead(template, {
      title: "Event suppliers near you | Eventwow",
      description: "Find trusted event suppliers across the UK and request personalised quotes directly.",
      canonicalPath: "/suppliers",
    }),
    listPageHtml({
      h1: "Event suppliers near you",
      intro: "Browse published suppliers, compare categories, and shortlist providers quickly.",
      links: suppliers.slice(0, 80).map((supplier) => ({ href: `/suppliers/${supplier.slug}`, label: supplier.name })),
      secondaryTitle: "Browse categories",
      secondaryLinks: categories.slice(0, 20).map((cat) => ({ href: `/categories/${cat.slug}`, label: cat.name })),
    })
  );
  await writeRouteHtml("/suppliers", supplierListDoc);

  const categoryIndexDoc = setRootHtml(
    setSeoHead(template, {
      title: "Browse event categories | Eventwow",
      description: "Explore event service categories and discover trusted suppliers across the UK.",
      canonicalPath: "/categories",
    }),
    listPageHtml({
      h1: "Browse event categories",
      intro: "Explore service categories and jump straight to supplier listings.",
      links: categories.map((cat) => ({ href: `/categories/${cat.slug}`, label: cat.name })),
      secondaryTitle: "Popular suppliers",
      secondaryLinks: suppliers.slice(0, 20).map((supplier) => ({ href: `/suppliers/${supplier.slug}`, label: supplier.name })),
    })
  );
  await writeRouteHtml("/categories", categoryIndexDoc);

  for (const category of categories) {
    const route = `/categories/${category.slug}`;
    routes.push(route);
    const relatedSuppliers = suppliers
      .filter((supplier) => supplier.category && supplier.category.toLowerCase().includes(category.name.toLowerCase()))
      .slice(0, 24)
      .map((supplier) => ({ href: `/suppliers/${supplier.slug}`, label: supplier.name }));
    const doc = setRootHtml(
      setSeoHead(template, {
        title: `${category.name} in UK | Eventwow`,
        description: clip(category.description || `Browse trusted ${category.name.toLowerCase()} suppliers on Eventwow.`, 160),
        canonicalPath: route,
      }),
      listPageHtml({
        h1: category.name,
        intro: category.description || `Discover trusted ${category.name.toLowerCase()} suppliers ready to quote.`,
        links: relatedSuppliers,
        secondaryTitle: "Other categories",
        secondaryLinks: categories
          .filter((cat) => cat.slug !== category.slug)
          .slice(0, 20)
          .map((cat) => ({ href: `/categories/${cat.slug}`, label: cat.name })),
      })
    );
    await writeRouteHtml(route, doc);
  }

  for (const venue of venues.slice(0, TOP_N)) {
    const route = `/venues/${venue.slug}`;
    routes.push(route);
    const doc = setRootHtml(
      setSeoHead(template, {
        title: `${venue.name}${venue.town ? ` (${venue.town})` : ""} | Eventwow`,
        description: clip(venue.summary || "Venue profile on Eventwow.", 160),
        canonicalPath: route,
        jsonLd: makeVenueJsonLd(venue),
      }),
      detailPageHtml({
        h1: venue.name,
        intro: venue.summary || "Venue profile on Eventwow.",
        details: [venue.town ? `Location: ${venue.town}` : "", venue.summary ? `Overview: ${venue.summary}` : ""],
        relatedLinks: [
          { href: "/venues", label: "Browse all venues" },
          { href: "/categories", label: "Explore event services" },
        ],
      })
    );
    await writeRouteHtml(route, doc);
  }

  for (const supplier of suppliers.slice(0, TOP_N)) {
    const route = `/suppliers/${supplier.slug}`;
    routes.push(route);
    const doc = setRootHtml(
      setSeoHead(template, {
        title: `${supplier.name}${supplier.town ? ` (${supplier.town})` : ""} | Eventwow`,
        description: clip(supplier.summary || "Supplier profile on Eventwow.", 160),
        canonicalPath: route,
        jsonLd: makeSupplierJsonLd(supplier),
      }),
      detailPageHtml({
        h1: supplier.name,
        intro: supplier.summary || "Supplier profile on Eventwow.",
        details: [supplier.town ? `Area: ${supplier.town}` : "", supplier.category ? `Category: ${supplier.category}` : ""],
        relatedLinks: [
          { href: "/suppliers", label: "Browse all suppliers" },
          { href: "/categories", label: "Browse categories" },
        ],
      })
    );
    await writeRouteHtml(route, doc);
  }

  await writeSitemap(routes);

  console.log("[prerender-seo] completed", {
    categories: categories.length,
    venues: Math.min(venues.length, TOP_N),
    suppliers: Math.min(suppliers.length, TOP_N),
    routeCount: routes.length,
  });
}

main().catch((err) => {
  console.error("[prerender-seo] failed:", err);
  process.exit(1);
});
