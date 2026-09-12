/* global Buffer */
// All remote/API traffic is intercepted. This module never contacts production.
export function workspaceFixtures(browser, base) {
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "admin@example.test",
    aud: "authenticated",
    role: "authenticated",
    user_metadata: { full_name: "Example Admin" },
  };
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;
  const supplier = {
    id: "supplier-1",
    business_name: "Example Event Catering",
    slug: "example-event-catering",
    base_city: "Manchester",
    base_postcode: "M1 1AA",
    credits_balance: 25,
    is_published: true,
    is_verified: true,
    auth_user_id: user.id,
    onboarding_status: "approved",
  };
  const suppliers = [
    supplier,
    {
      ...supplier,
      id: "supplier-2",
      business_name: "Example Live Music",
      slug: "example-live-music",
      base_city: "Lancaster",
      is_published: false,
      is_verified: false,
      credits_balance: 0,
    },
  ];
  const venues = [
    {
      id: "venue-1",
      name: "Example Assembly Rooms",
      slug: "example-assembly-rooms",
      city: "Manchester",
      guest_min: 20,
      guest_max: 150,
      is_published: true,
      listed_publicly: true,
      hero_image_url: "https://example.test/image.jpg",
      description: "Example venue description",
      website_url: "https://example.test",
    },
    {
      id: "venue-2",
      name: "Example Riverside Hall",
      slug: "example-riverside-hall",
      city: "Lancaster",
      guest_max: 80,
      is_published: false,
    },
  ];
  const enquiries = [
    {
      id: "enquiry-1",
      event_date: "2026-12-12",
      event_postcode: "M1 1AA",
      event_type: "Corporate",
      status: "new",
      match_source: "concierge",
      customers: {
        full_name: "Example Customer",
        email: "customer@example.test",
      },
      venues: { name: "Example Assembly Rooms" },
    },
    {
      id: "enquiry-2",
      event_date: "2026-12-18",
      event_postcode: "LA1 1AA",
      status: "quoted",
      match_source: "venue_referral",
      customers: { full_name: "Another Example" },
    },
  ];
  const metrics = suppliers.map((row, index) => ({
    supplier_id: row.id,
    supplier: row,
    quotes_sent: 12 + index,
    quotes_accepted: 4 + index,
    acceptance_rate: 0.35 + index / 10,
  }));
  const ledger = suppliers.map((row, index) => ({
    id: `credit-${index}`,
    supplier: row,
    delta: index ? -5 : 25,
    reason: index ? "Quote sent" : "Credit adjustment",
    created_at: "2026-09-10T10:30:00Z",
  }));

  async function fixture({
    role = "admin",
    state = "populated",
    signedIn = true,
    respond,
  } = {}) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const requests = [];
    const errors = [];
    const mode = { state, failFunnel: false };
    if (signedIn)
      await context.addInitScript(
        ({ user, token }) => {
          localStorage.setItem(
            "sb-127-auth-token",
            JSON.stringify({
              access_token: token,
              refresh_token: "fixture-refresh",
              token_type: "bearer",
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              user,
            }),
          );
        },
        { user, token },
      );
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const isApi = url.pathname.startsWith("/api/");
      const isSupabase =
        url.port === "54321" || url.hostname.endsWith("supabase.co");
      if (!isApi && !isSupabase) {
        if (url.origin === new URL(base).origin) return route.continue();
        return route.abort();
      }
      requests.push({
        url: request.url(),
        method: request.method(),
        body: request.postData(),
        authorization: request.headers().authorization,
      });
      if (mode.mutationDelay && request.method() !== "GET")
        await new Promise((resolve) => setTimeout(resolve, mode.mutationDelay));
      if (mode.failMutation && request.method() !== "GET")
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Fixture save unavailable" }),
        });
      let body = {};
      const table = url.pathname.split("/").pop();
      const isListRequest =
        (isApi && !url.pathname.includes("notifications")) ||
        (isSupabase && table === "suppliers");
      if (mode.state === "loading" && isListRequest)
        await new Promise((resolve) => setTimeout(resolve, 1200));
      if (
        (mode.state === "error" && isListRequest) ||
        (mode.failFunnel && url.pathname.endsWith("admin-quote-funnel"))
      )
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Fixture service unavailable",
            error: "Fixture service unavailable",
          }),
        });
      const empty = mode.state === "empty";
      const custom = respond && (await respond({ url, request, empty, mode }));
      if (custom !== undefined) body = custom;
      else if (isSupabase) {
        const single = request.headers().accept?.includes("object+json");
        if (url.pathname.includes("/auth/")) body = { user };
        else if (table === "user_profiles") body = { role };
        else if (table === "user_roles") body = { role };
        else if (table === "suppliers")
          body =
            single ||
            url.searchParams.has("auth_user_id") ||
            url.searchParams.has("id")
              ? supplier
              : empty
                ? []
                : suppliers;
        else if (table === "venues") body = empty ? [] : venues;
        else if (table === "customers")
          body = {
            id: "customer-1",
            full_name: "Example Customer",
            email: "customer@example.test",
          };
        else if (table === "enquiries" && request.method() === "POST")
          body = { id: "created-enquiry" };
        else body = single ? null : [];
      } else if (url.pathname.endsWith("admin-quote-funnel"))
        body = {
          totals: {
            sent: empty ? 0 : 25,
            accepted: empty ? 0 : 9,
            declined: empty ? 0 : 2,
            closed: 0,
            acceptance_rate: empty ? 0 : 0.36,
          },
        };
      else if (url.pathname.endsWith("admin-supplier-metrics"))
        body = { rows: empty ? [] : metrics };
      else if (url.pathname.endsWith("admin-credits-ledger"))
        body = {
          rows: empty ? [] : ledger,
          totalCount: empty ? 0 : ledger.length,
        };
      else if (url.pathname.endsWith("admin-venues"))
        body = url.searchParams.has("venueId")
          ? {
              venue: {
                name: venues[0].name,
                slug: venues[0].slug,
                city: "Manchester",
                listedPublicly: false,
              },
              venueTypes: [],
            }
          : {
              rows: empty ? [] : venues,
              venueTypes: [{ id: "type-1", name: "Event space" }],
            };
      else if (url.pathname.endsWith("admin-venue-save"))
        body = { venueId: "venue-1", ok: true };
      else if (url.pathname.endsWith("admin-create-supplier"))
        body = { supplier: { id: supplier.id }, ok: true };
      else if (url.searchParams.get("path")?.startsWith("enquiries/"))
        body = { enquiry: enquiries[0], invites: [] };
      else if (url.searchParams.get("path") === "enquiries")
        body = { rows: empty ? [] : enquiries };
      else if (
        url.pathname.includes("/drafts/") &&
        request.method() === "DELETE"
      )
        body = { ok: true };
      else if (url.pathname.endsWith("/listing"))
        body = {
          supplier: null,
          media: { hero: null, gallery: [] },
          categoryOptions: [],
        };
      else body = { ok: true, rows: [], notifications: [], unread_count: 0 };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    return { context, page, requests, errors, mode };
  }

  return fixture;
}
