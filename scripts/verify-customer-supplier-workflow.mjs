/* global console */
import assert from "node:assert/strict";
import { test } from "node:test";
import { workflowBackend, invoke, uid } from "./fixtures/workflow-backend.mjs";
import createEnquiry from "../api/public/enquiries.js";
import customerList from "../api/customer/enquiries/index.js";
import customerDetail from "../api/customer/enquiries/[id].js";
import targets from "../api/customer/enquiries/[id]/messaging-targets.js";
import customerOpen from "../api/customer/threads/get-or-create.js";
import customerMessages from "../api/customer/threads/[threadId]/messages.js";
import supplierList from "../api/supplier-enquiries.js";
import supplierDetail from "../api/supplier/enquiries/[id].js";
import startQuote from "../api/supplier-start-quote-from-enquiry.js";
import saveQuote from "../api/supplier-save-draft-quote.js";
import sendQuote from "../api/supplier-send-quote.js";
import quoteLink from "../api/supplier-get-public-link.js";
import supplierQuotes from "../api/supplier/quotes.js";
import acceptQuote from "../api/public-quote-accept.js";
import declineQuote from "../api/public-quote-decline.js";
import supplierThread from "../api/supplier-thread.js";
import supplierSend from "../api/supplier-send-message.js";
import notifications from "../api/supplier-notifications.js";
import markRead from "../api/supplier-notifications-mark-read.js";
import bookingDetail from "../api/supplier/bookings/[id].js";

const ok = async (handler, options) => {
  const result = await invoke(handler, options);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data;
};
function seedThread(db) {
  const enquiry = {
    id: uid(),
    customer_id: db.tables.customers[0].id,
    customer_user_id: db.users.customer.id,
  };
  const quote = {
    id: uid(),
    supplier_id: db.tables.suppliers[0].id,
    enquiry_id: enquiry.id,
    status: "sent",
  };
  const thread = {
    id: uid(),
    quote_id: quote.id,
    supplier_id: quote.supplier_id,
    enquiry_id: enquiry.id,
  };
  db.tables.enquiries.push(enquiry);
  db.tables.quotes.push(quote);
  db.tables.message_threads.push(thread);
  return { enquiry, quote, thread };
}
test("Customer detail excludes drafts AND their item/token/thread content", async () => {
  const db = workflowBackend(),
    restore = db.install();
  try {
    const { enquiry, quote, thread } = seedThread(db);
    quote.status = "draft";
    quote.quote_text = "PRIVATE DRAFT";
    db.tables.quote_items.push({
      id: uid(),
      quote_id: quote.id,
      title: "PRIVATE ITEM",
    });
    db.tables.quote_public_links.push({
      id: uid(),
      quote_id: quote.id,
      token: uid(),
    });
    db.tables.messages.push({
      id: uid(),
      thread_id: thread.id,
      body: "PRIVATE HISTORY",
    });
    for (const status of ["sent", "accepted", "declined", "closed"])
      db.tables.quotes.push({
        id: uid(),
        enquiry_id: enquiry.id,
        supplier_id: quote.supplier_id,
        status,
      });
    const data = await ok(customerDetail, { query: { id: enquiry.id } });
    assert.deepEqual(data.quotes.map((q) => q.status).sort(), [
      "accepted",
      "closed",
      "declined",
      "sent",
    ]);
    assert.ok(!JSON.stringify(data).includes("PRIVATE"));
    assert.ok(
      !db.requests.some((r) => r.query.quote_id?.includes(quote.id)),
      "Draft relations must not be fetched",
    );
    assert.equal(
      (
        await invoke(customerDetail, {
          role: "otherCustomer",
          query: { id: enquiry.id },
        })
      ).status,
      404,
    );
  } finally {
    restore();
  }
});
test("Latest message windows preserve newest replies in chronological display order", async () => {
  const db = workflowBackend(),
    restore = db.install();
  try {
    const { thread } = seedThread(db);
    for (let i = 1; i <= 505; i++)
      db.tables.messages.push({
        id: uid(),
        thread_id: thread.id,
        sender_type: i % 2 ? "customer" : "supplier",
        body: `Message ${i}`,
        created_at: new Date(Date.UTC(2026, 8, 1, 0, 0, i)).toISOString(),
      });
    const supplier = await ok(supplierThread, {
      role: "supplier",
      query: { threadId: thread.id },
    });
    assert.equal(supplier.messages.length, 500);
    assert.equal(supplier.messages[0].body, "Message 6");
    assert.equal(supplier.messages.at(-1).body, "Message 505");
    const customer = await ok(customerMessages, {
      query: { threadId: thread.id, limit: "50" },
    });
    assert.equal(customer.messages.length, 50);
    assert.equal(customer.messages[0].body, "Message 456");
    assert.equal(customer.messages.at(-1).body, "Message 505");
    const older = await ok(customerMessages, {
      query: { threadId: thread.id, limit: "50", cursor: customer.next_cursor },
    });
    assert.equal(older.messages.at(-1).body, "Message 455");
    assert.equal(
      (
        await invoke(customerMessages, {
          role: "otherCustomer",
          query: { threadId: thread.id },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await invoke(supplierThread, {
          role: "otherSupplier",
          query: { threadId: thread.id },
        })
      ).status,
      404,
    );
  } finally {
    restore();
  }
});
test("Connected enquiry → quote decisions → bookings → two-way persisted fixture messages", async (t) => {
  const db = workflowBackend(),
    restore = db.install();
  try {
    const supplierId = db.tables.suppliers[0].id;
    const created = await ok(createEnquiry, {
      method: "POST",
      body: {
        full_name: "Fixture Customer",
        email: db.users.customer.email,
        event_type: "corporate",
        enquiry_category_slug: "catering",
        event_date: "2026-12-12",
        start_time: "18:00",
        guest_count: 80,
        venue_name: "Manchester",
        venue_known: true,
        budget_amount: 1200,
        message:
          "We are organising a community celebration with seasonal catering for eighty guests. Please include setup, vegetarian options and serving staff for the evening.",
        supplier_id: supplierId,
      },
    });
    const id = created.enquiry_id;
    assert.equal(created.invitedCount, 1);
    assert.equal((await ok(customerList)).rows[0].id, id);
    assert.equal(
      (await ok(supplierList, { role: "supplier" })).rows[0].enquiryId,
      id,
    );
    assert.equal(
      (await ok(supplierDetail, { role: "supplier", query: { id } })).enquiry
        .id,
      id,
    );
    assert.equal(
      (await ok(notifications, { role: "supplier" })).unread_count,
      1,
    );
    const draft = await ok(startQuote, {
        role: "supplier",
        method: "POST",
        body: { enquiryId: id },
      }),
      quoteId = draft.quoteId;
    assert.equal(
      (
        await ok(startQuote, {
          role: "supplier",
          method: "POST",
          body: { enquiryId: id },
        })
      ).quoteId,
      quoteId,
    );
    const payload = {
      quote_id: quoteId,
      items: [{ title: "Catering", qty: 80, unit_price: 12.5, sort_order: 1 }],
      quote_text: "Seasonal menu with setup.",
    };
    const saved = await ok(saveQuote, {
      role: "supplier",
      method: "POST",
      body: payload,
    });
    assert.equal(saved.total, 1000);
    assert.equal(saved.quote.status, "draft");
    assert.equal(
      (await ok(customerDetail, { query: { id } })).quotes.length,
      0,
    );
    assert.equal(
      (
        await invoke(customerOpen, {
          method: "POST",
          body: { enquiry_id: id, supplier_id: supplierId, quote_id: quoteId },
        })
      ).status,
      409,
    );
    const credits = db.tables.suppliers[0].credits_balance;
    db.faults.push({
      table: "rpc/apply_credit_delta",
      method: "POST",
      message: "INSUFFICIENT_CREDITS",
    });
    assert.equal(
      (
        await invoke(sendQuote, {
          role: "supplier",
          method: "POST",
          body: { quote_id: quoteId },
        })
      ).status,
      409,
    );
    assert.equal(db.tables.quotes[0].status, "draft");
    assert.equal(db.tables.suppliers[0].credits_balance, credits);
    await ok(sendQuote, {
      role: "supplier",
      method: "POST",
      body: { quote_id: quoteId, quote_text: payload.quote_text },
    });
    assert.equal(db.tables.suppliers[0].credits_balance, credits - 1);
    assert.equal(
      (
        await invoke(sendQuote, {
          role: "supplier",
          method: "POST",
          body: { quote_id: quoteId },
        })
      ).status,
      409,
    );
    assert.equal(db.tables.credits_ledger.length, 1);
    assert.equal(
      (await ok(supplierList, { role: "supplier" })).rows[0].status,
      "quoted",
    );
    // Existing limitation: send itself does not create the public decision token.
    assert.equal(
      (await ok(customerDetail, { query: { id } })).quotes[0].quoteToken,
      null,
    );
    t.diagnostic(
      "Existing send/link gap reproduced: Customer decision token is absent until Supplier opens/copies the public link.",
    );
    const { token } = await ok(quoteLink, {
      role: "supplier",
      method: "POST",
      body: { quote_id: quoteId },
    });
    assert.equal(
      (await ok(customerDetail, { query: { id } })).quotes[0].quoteToken,
      token,
    );
    await ok(acceptQuote, { role: null, method: "POST", body: { token } });
    assert.equal(
      (await ok(supplierQuotes, { role: "supplier" })).rows[0].status,
      "accepted",
    );
    assert.equal(db.tables.supplier_bookings.length, 1);
    assert.equal(db.tables.supplier_bookings[0].status, "confirmed");
    assert.equal(db.tables.supplier_bookings[0].value_gross, 1000);
    await ok(acceptQuote, { role: null, method: "POST", body: { token } });
    assert.equal(
      db.tables.supplier_bookings.length,
      1,
      "Replay must not duplicate booking",
    );
    assert.equal(
      db.tables.notifications.filter((n) => n.type === "quote_accepted").length,
      1,
    );
    assert.equal(
      (
        await invoke(declineQuote, {
          role: null,
          method: "POST",
          body: { token },
        })
      ).status,
      409,
    );
    const revised = await ok(saveQuote, {
      role: "supplier",
      method: "POST",
      body: {
        ...payload,
        items: [
          { title: "Revised catering", qty: 80, unit_price: 15, sort_order: 1 },
        ],
      },
    });
    assert.equal(revised.reacceptRequired, true);
    assert.equal(db.tables.supplier_bookings[0].status, "draft");
    assert.equal(
      (await ok(customerDetail, { query: { id } })).quotes[0].reacceptRequired,
      true,
    );
    await ok(acceptQuote, { role: null, method: "POST", body: { token } });
    assert.equal(db.tables.supplier_bookings[0].status, "confirmed");
    assert.equal(db.tables.supplier_bookings[0].value_gross, 1200);
    assert.equal(db.tables.suppliers[0].credits_balance, credits - 1);
    const target = (await ok(targets, { query: { id } })).rows[0];
    const opened = await ok(customerOpen, {
        method: "POST",
        body: {
          enquiry_id: id,
          supplier_id: supplierId,
          quote_id: target.quote_id,
        },
      }),
      threadId = opened.thread_id;
    await ok(customerMessages, {
      method: "POST",
      query: { threadId },
      body: { body: "  Please arrive at 17:00.  " },
    });
    let history = await ok(supplierThread, {
      role: "supplier",
      query: { threadId },
    });
    assert.equal(history.messages.at(-1).body, "Please arrive at 17:00.");
    await ok(supplierSend, {
      role: "supplier",
      method: "POST",
      body: { threadId, body: "  We will be there.  ", clientMessageId: uid() },
    });
    const reopened = await ok(customerOpen, {
      method: "POST",
      body: { enquiry_id: id, supplier_id: supplierId, quote_id: quoteId },
    });
    assert.equal(reopened.thread_id, threadId);
    history = await ok(customerMessages, { query: { threadId, limit: "50" } });
    assert.deepEqual(
      history.messages.map((m) => m.body),
      ["Please arrive at 17:00.", "We will be there."],
    );
    assert.deepEqual(
      history.messages.map((m) => m.senderType),
      ["customer", "supplier"],
    );
    db.faults.push({ table: "messages", method: "POST" });
    assert.equal(
      (
        await invoke(customerMessages, {
          method: "POST",
          query: { threadId },
          body: { body: "Failed message" },
        })
      ).status,
      500,
    );
    assert.equal(db.tables.messages.length, 2);
    assert.ok((await ok(notifications, { role: "supplier" })).unread_count > 1);
    await ok(markRead, {
      role: "supplier",
      method: "POST",
      body: { all: true },
    });
    assert.equal(
      (await ok(notifications, { role: "supplier" })).unread_count,
      0,
    );
    const bookingId = db.tables.supplier_bookings[0].id;
    await ok(bookingDetail, {
      role: "supplier",
      method: "PATCH",
      query: { id: bookingId },
      body: { status: "cancelled" },
    });
    assert.equal(db.tables.supplier_bookings[0].status, "cancelled");
    // Another sent quote exercises decline without converting an accepted quote.
    const q2 = {
      ...db.tables.quotes[0],
      id: uid(),
      status: "sent",
      accepted_at: null,
    };
    db.tables.quotes.push(q2);
    const token2 = uid();
    db.tables.quote_public_links.push({
      id: uid(),
      quote_id: q2.id,
      token: token2,
    });
    await ok(declineQuote, {
      role: null,
      method: "POST",
      body: { token: token2 },
    });
    await ok(declineQuote, {
      role: null,
      method: "POST",
      body: { token: token2 },
    });
    assert.equal(
      db.tables.quotes.find((q) => q.id === q2.id).status,
      "declined",
    );
    assert.equal(db.tables.supplier_bookings.length, 1);
    assert.equal(
      (
        await invoke(acceptQuote, {
          role: null,
          method: "POST",
          body: { token: token2 },
        })
      ).status,
      409,
    );
    for (const role of ["supplier", "admin", "venue_owner"])
      assert.equal(
        (await invoke(customerDetail, { role, query: { id } })).status,
        403,
      );
    for (const role of ["customer", "admin", "venue_owner", "otherSupplier"])
      assert.notEqual(
        (await invoke(supplierDetail, { role, query: { id } })).status,
        200,
      );
    for (const role of [null, "expired"])
      assert.equal((await invoke(customerList, { role })).status, 401);
    assert.equal(
      (
        await invoke(supplierSend, {
          role: "otherSupplier",
          method: "POST",
          body: { threadId, body: "Not owned" },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await invoke(bookingDetail, {
          role: "customer",
          query: { id: bookingId },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await invoke(acceptQuote, {
          role: null,
          method: "POST",
          body: { token: uid() },
        })
      ).status,
      404,
    );
    assert.deepEqual(db.blocked, []);
    t.diagnostic(
      `${db.requests.length} real Supabase-client requests exercised against isolated state; no external network requests.`,
    );
  } finally {
    restore();
  }
});
