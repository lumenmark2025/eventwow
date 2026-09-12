/* global process, URL, Headers, Response */
// Test-only transport for the REAL API handlers and Supabase JS client.
// Models the used PostgREST operations; it is not PostgreSQL, RLS, Auth or a transaction emulator.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export const uid = () => randomUUID();
export function workflowBackend() {
  const tables = Object.fromEntries(
    [
      "user_profiles",
      "user_roles",
      "customers",
      "suppliers",
      "supplier_images",
      "venues",
      "venue_owners_link",
      "enquiries",
      "enquiry_suppliers",
      "quotes",
      "quote_items",
      "quote_public_links",
      "quote_events",
      "message_threads",
      "messages",
      "supplier_thread_state",
      "supplier_bookings",
      "booking_access_links",
      "notifications",
      "notification_log",
      "credit_transactions",
      "credits_ledger",
      "enquiry_shortlists",
    ].map((t) => [t, []]),
  );
  const users = Object.fromEntries(
    [
      "customer",
      "otherCustomer",
      "supplier",
      "otherSupplier",
      "admin",
      "venue_owner",
    ].map((role) => [
      role,
      {
        id: uid(),
        email: `${role}@example.test`,
        role: "authenticated",
        aud: "authenticated",
        user_metadata: { full_name: `Fixture ${role}` },
      },
    ]),
  );
  for (const [role, user] of Object.entries(users))
    tables.user_profiles.push({
      user_id: user.id,
      role: role
        .replace(/^otherCustomer$/, "customer")
        .replace(/^otherSupplier$/, "supplier"),
    });
  for (const role of ["customer", "otherCustomer"])
    tables.customers.push({
      id: uid(),
      user_id: users[role].id,
      full_name: `Fixture ${role}`,
      email: users[role].email,
    });
  for (const role of ["supplier", "otherSupplier"]) {
    const supplier = {
      id: uid(),
      auth_user_id: users[role].id,
      business_name: `Fixture ${role}`,
      credits_balance: 10,
      email: users[role].email,
      is_published: true,
      is_verified: true,
      listing_categories: ["catering"],
      location_label: "Manchester",
      short_description: "Catering for community events and celebrations.",
      about:
        "We prepare fresh food for local events, with flexible menus and friendly service. Our team brings equipment and handles all setup and clearing.",
      services: ["Catering", "Setup", "Service"],
    };
    tables.suppliers.push(supplier);
    for (const type of ["hero", "gallery", "gallery"])
      tables.supplier_images.push({
        id: uid(),
        supplier_id: supplier.id,
        type,
      });
  }
  const requests = [],
    blocked = [],
    faults = [];
  let tick = 0;
  const now = () =>
    new Date(Date.UTC(2026, 8, 12, 10, 0, 0) + tick++).toISOString();
  const reply = (value, status = 200, headers = {}) =>
    new Response(value === null ? null : JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  function matches(row, key, filter) {
    if (
      ["select", "order", "limit", "offset", "on_conflict", "columns"].includes(
        key,
      )
    )
      return true;
    const neg = filter.startsWith("not.");
    if (neg) return !matches(row, key, filter.slice(4));
    const dot = filter.indexOf("."),
      op = filter.slice(0, dot),
      value = filter.slice(dot + 1);
    if (op === "eq") return String(row[key]) === value;
    if (op === "neq") return String(row[key]) !== value;
    if (op === "is")
      return value === "null" ? row[key] == null : String(row[key]) === value;
    if (op === "in")
      return value
        .slice(1, -1)
        .split(",")
        .map((s) => s.replaceAll('"', ""))
        .includes(String(row[key]));
    if (op === "lt") return row[key] < value;
    if (op === "gt") return row[key] > value;
    if (op === "gte") return row[key] >= value;
    if (op === "lte") return row[key] <= value;
    throw new Error(`Unmodelled filter ${key}=${filter}`);
  }
  function fields(select) {
    let depth = 0,
      start = 0;
    const result = [];
    for (let i = 0; i < select.length; i++) {
      if (select[i] === "(") depth++;
      if (select[i] === ")") depth--;
      if (select[i] === "," && depth === 0) {
        result.push(select.slice(start, i));
        start = i + 1;
      }
    }
    result.push(select.slice(start));
    return result;
  }
  function project(table, row, select = "*") {
    const out = {};
    for (const field of fields(select)) {
      if (field === "*") {
        Object.assign(out, row);
        continue;
      }
      if (!field.includes("(")) {
        out[field] = row[field] ?? null;
        continue;
      }
      const relation = field.slice(0, field.indexOf("(")),
        nested = field.slice(field.indexOf("(") + 1, -1);
      const foreign = {
        enquiries: "enquiry_id",
        quotes: "quote_id",
        customers: "customer_id",
        suppliers: "supplier_id",
        venues: "venue_id",
      }[relation];
      assert.ok(foreign, `Unmodelled relation ${table}.${relation}`);
      const target = tables[relation].find((r) => r.id === row[foreign]);
      out[relation] = target ? project(relation, target, nested) : null;
    }
    return out;
  }
  async function fetch(input, options = {}) {
    const url = new URL(typeof input === "string" ? input : input.url),
      method = options.method || "GET";
    const headers = new Headers(options.headers);
    const body = options.body ? JSON.parse(options.body) : null;
    if (url.origin !== "http://workflow.invalid") {
      blocked.push(url.origin);
      throw new Error(`External request blocked: ${url.origin}`);
    }
    requests.push({
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      method,
      body,
    });
    if (url.pathname === "/auth/v1/user") {
      const role = headers.get("authorization")?.replace("Bearer ", "");
      return users[role]
        ? reply(users[role])
        : reply(
            { message: "Invalid or expired fixture session", code: "bad_jwt" },
            401,
          );
    }
    if (url.pathname.startsWith("/auth/v1/admin/users/")) {
      const user = Object.values(users).find(
        (u) => u.id === url.pathname.split("/").at(-1),
      );
      return user ? reply({ user }) : reply({ message: "User not found" }, 404);
    }
    assert.ok(
      url.pathname.startsWith("/rest/v1/"),
      `Unexpected endpoint ${url.pathname}`,
    );
    const table = url.pathname.slice("/rest/v1/".length);
    const faultIndex = faults.findIndex(
      (f) => f.table === table && f.method === method,
    );
    if (faultIndex >= 0) {
      const fault = faults.splice(faultIndex, 1)[0];
      return reply(
        {
          code: fault.code || "XX000",
          message: fault.message || "Injected failure",
        },
        400,
      );
    }
    if (table === "rpc/apply_credit_delta") {
      // Explicit model of the RPC boundary, not a test of its SQL locking/ledger implementation.
      const supplier = tables.suppliers.find(
        (s) => s.id === body.p_supplier_id,
      );
      if (supplier.credits_balance + body.p_delta < 0)
        return reply({ code: "P0001", message: "INSUFFICIENT_CREDITS" }, 400);
      supplier.credits_balance += body.p_delta;
      tables.credits_ledger.push({ id: uid(), ...body });
      return reply([{ credits_balance: supplier.credits_balance }]);
    }
    assert.ok(tables[table], `Unmodelled table ${table}`);
    const params = url.searchParams;
    let rows = tables[table].filter((row) =>
      [...params].every(([k, v]) => matches(row, k, v)),
    );
    if (method === "POST") {
      const batch = Array.isArray(body) ? body : [body];
      rows = [];
      for (const value of batch) {
        const conflictKeys = (
          params.get("on_conflict") ||
          {
            notification_log: "event_key",
            quote_public_links: "quote_id",
            message_threads: "quote_id",
            supplier_bookings: "quote_id",
          }[table] ||
          "id"
        ).split(",");
        const existing = tables[table].find((r) =>
          conflictKeys.every((k) => value[k] != null && r[k] === value[k]),
        );
        if (
          existing &&
          !headers.get("prefer")?.includes("resolution=merge-duplicates")
        )
          return reply(
            { code: "23505", message: "Fixture unique conflict" },
            409,
          );
        if (existing) {
          Object.assign(existing, value);
          rows.push(existing);
          continue;
        }
        const row = { id: uid(), created_at: now(), ...value };
        if (table === "quote_public_links") row.token = uid();
        tables[table].push(row);
        rows.push(row);
      }
    } else if (method === "PATCH") {
      for (const row of rows) Object.assign(row, body);
    } else if (method === "DELETE") {
      tables[table] = tables[table].filter((r) => !rows.includes(r));
    } else
      assert.ok(
        ["GET", "HEAD"].includes(method),
        `Unmodelled method ${method}`,
      );
    const count = rows.length;
    const order = params.get("order");
    if (order)
      rows.sort((a, b) => {
        for (const term of order.split(",")) {
          const [k, dir] = term.split(".");
          const result = String(a[k] ?? "").localeCompare(String(b[k] ?? ""));
          if (result) return dir === "desc" ? -result : result;
        }
        return 0;
      });
    const offset = Number(params.get("offset") || 0);
    rows = rows.slice(
      offset,
      params.has("limit") ? offset + Number(params.get("limit")) : undefined,
    );
    if (method === "HEAD")
      return reply(null, 200, {
        "content-range": `0-${Math.max(0, count - 1)}/${count}`,
      });
    const projected = rows.map((row) =>
      project(table, row, params.get("select") || "*"),
    );
    if (headers.get("accept")?.includes("vnd.pgrst.object")) {
      if (projected.length !== 1)
        return reply(
          {
            code: "PGRST116",
            message: "JSON object requested",
            details: `The result contains ${projected.length} rows`,
          },
          406,
        );
      return reply(projected[0]);
    }
    return reply(projected, 200, {
      "content-range": `0-${Math.max(0, count - 1)}/${count}`,
    });
  }
  function install() {
    const oldFetch = globalThis.fetch,
      env = { ...process.env };
    process.env.SUPABASE_URL = "http://workflow.invalid";
    process.env.SUPABASE_ANON_KEY = "fixture-anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service";
    delete process.env.RESEND_API_KEY;
    globalThis.fetch = fetch;
    return () => {
      globalThis.fetch = oldFetch;
      for (const key of Object.keys(process.env))
        if (!(key in env)) delete process.env[key];
      Object.assign(process.env, env);
    };
  }
  return { tables, users, requests, blocked, faults, fetch, install, now };
}
export async function invoke(
  handler,
  { role = "customer", method = "GET", query = {}, body = {} } = {},
) {
  let status = 200,
    data;
  await handler(
    {
      method,
      query,
      body,
      headers: {
        host: "localhost:5173",
        ...(role ? { authorization: `Bearer ${role}` } : {}),
      },
    },
    {
      status(code) {
        status = code;
        return this;
      },
      json(value) {
        data = value;
        return this;
      },
    },
  );
  return { status, data };
}
