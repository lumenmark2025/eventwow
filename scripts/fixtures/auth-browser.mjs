/* global Buffer */
import { workspaceFixtures } from "../workspace-fixtures.mjs";
export function authFixtures(browser, base) {
  const common = workspaceFixtures(browser, base);
  return async function fixture({
    role = "customer",
    signedIn = false,
    confirmed = true,
    onboarding = "draft",
  } = {}) {
    const f = await common({ signedIn: false, role });
    f.page.setDefaultTimeout(12000);
    const state = {
      role,
      confirmed,
      onboarding,
      calls: [],
      authError: "",
      apiError: "",
      delay: 0,
      empty: false,
      existing: false,
    };
    const user = () => ({
      id: `00000000-0000-4000-8000-00000000000${{ customer: 1, supplier: 2, venue_owner: 3, admin: 4, none: 5 }[state.role]}`,
      email: `${state.role}@example.test`,
      aud: "authenticated",
      role: "authenticated",
      email_confirmed_at: state.confirmed ? "2026-09-12T12:00:00Z" : null,
      user_metadata: { full_name: "Fixture user" },
    });
    const session = () => ({
      access_token: `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user().id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`,
      refresh_token: "fixture-refresh",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: user(),
    });
    const supplier = () => ({
      id: "supplier-1",
      auth_user_id: user().id,
      business_name: "Fixture supplier",
      onboarding_status: state.onboarding,
      is_published: state.onboarding === "approved",
      credits_balance: 25,
      listing_categories: [],
      short_description: "",
      about: "",
      location_label: "",
    });
    if (signedIn)
      await f.context.addInitScript(
        (value) =>
          localStorage.setItem("sb-127-auth-token", JSON.stringify(value)),
        session(),
      );
    await f.context.route("**/*", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname;
      const auth = path.startsWith("/auth/v1/"),
        rest = path.startsWith("/rest/v1/");
      const ownApi =
        [
          "/api/public/suppliers/signup",
          "/api/suppliers/me",
          "/api/suppliers/me/update",
          "/api/suppliers/submit-for-review",
          "/api/suppliers/create-draft",
          "/api/public/categories/options",
          "/api/public-venue",
          "/api/public/venue-claim/verify",
        ].includes(path) || path.endsWith("/claim-request");
      if (!auth && !rest && !ownApi) return route.fallback();
      let body;
      try {
        body = req.postDataJSON();
      } catch {
        body = req.postData();
      }
      state.calls.push({
        path,
        query: Object.fromEntries(url.searchParams),
        method: req.method(),
        body,
        authorization: req.headers().authorization,
      });
      const reply = (data, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      if (state.delay)
        await new Promise((resolve) => setTimeout(resolve, state.delay));
      if (auth) {
        if (state.authError)
          return reply(
            {
              msg: state.authError,
              message: state.authError,
              error_description: state.authError,
            },
            400,
          );
        if (path.endsWith("/token") || path.endsWith("/verify"))
          return reply(session());
        if (path.endsWith("/user")) return reply(user());
        return reply({});
      }
      if (rest) {
        const table = path.split("/").pop();
        if (table === "user_profiles")
          return reply(state.role === "none" ? null : { role: state.role });
        if (table === "user_roles") return reply(null);
        if (table === "suppliers")
          return reply(state.role === "supplier" ? supplier() : null);
        if (table === "customers")
          return reply(
            state.role === "customer"
              ? { id: "customer-1", user_id: user().id }
              : null,
          );
        return route.fallback();
      }
      if (state.apiError)
        return reply({ error: state.apiError, details: state.apiError }, 503);
      if (path === "/api/public/suppliers/signup")
        return reply({ ok: true, existing_account: state.existing });
      if (path === "/api/suppliers/me")
        return state.role === "supplier"
          ? reply({ supplier: state.empty ? null : supplier() })
          : reply({ error: "Forbidden" }, 403);
      if (path === "/api/public/categories/options")
        return reply(
          state.categoriesEmpty
            ? []
            : [
                { slug: "catering", display_name: "Catering" },
                { slug: "photography", display_name: "Photography" },
              ],
        );
      if (path === "/api/suppliers/me/update")
        return reply({ supplier: { ...supplier(), ...body } });
      if (path === "/api/suppliers/submit-for-review") {
        state.onboarding = "pending_review";
        return reply({ supplier: supplier() });
      }
      if (path === "/api/suppliers/create-draft")
        return reply({ supplier: supplier() });
      if (path === "/api/public-venue")
        return state.empty
          ? reply({}, 404)
          : reply({ venue: { id: "venue-1", name: "Fixture Event Hall" } });
      if (path.endsWith("/claim-request"))
        return reply({
          message: "Check your email for the claim verification link.",
        });
      return reply({
        ok: true,
        venue: { slug: "fixture-hall", name: "Fixture Event Hall" },
        requester_email: "owner@example.test",
      });
    });
    return { ...f, state, user, session };
  };
}
