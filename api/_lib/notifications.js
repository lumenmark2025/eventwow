import { sendEmail } from "./email.js";
import {
  customerAcceptedConfirmationEmail,
  customerDeclinedConfirmationEmail,
  messageReceivedEmailToCustomer,
  messageReceivedEmailToSupplier,
  quoteAcceptedEmailToSupplier,
  quoteDeclinedEmailToSupplier,
  quoteSentEmail,
} from "./emailTemplates.js";

function trimPreview(text, max = 140) {
  const value = String(text || "").trim();
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

export function buildAbsoluteUrl(req, path = "") {
  const cleanedPath = path.startsWith("/") ? path : `/${path}`;
  const explicit = process.env.PUBLIC_APP_URL;
  if (explicit) return `${String(explicit).replace(/\/$/, "")}${cleanedPath}`;

  const host = req?.headers?.["x-forwarded-host"] || req?.headers?.host || "";
  if (!host) return cleanedPath;
  const proto = req?.headers?.["x-forwarded-proto"] || (String(host).includes("localhost") ? "http" : "https");
  return `${proto}://${host}${cleanedPath}`;
}

export async function reserveEvent(admin, eventKey, meta = null) {
  const { error } = await admin
    .from("notification_log")
    .insert([{ event_key: eventKey, meta: meta || null }]);

  if (!error) return { ok: true, reserved: true };
  if (error.code === "23505") return { ok: true, reserved: false };
  return { ok: false, error };
}

export async function createSupplierNotification(admin, payload) {
  const { error } = await admin.from("notifications").insert([payload]);
  if (error) return { ok: false, error };
  return { ok: true };
}

async function loadSupplierRow(admin, supplierId) {
  const attempts = [
    "id,business_name,public_email,auth_user_id",
    "id,business_name,auth_user_id",
    "id,business_name",
  ];

  for (const select of attempts) {
    const resp = await admin.from("suppliers").select(select).eq("id", supplierId).maybeSingle();
    if (!resp.error) return { row: resp.data || null, error: null };
    if (resp.error.code !== "PGRST204") return { row: null, error: resp.error };
  }

  return { row: null, error: null };
}

export async function getSupplierContact(admin, supplierId) {
  const loaded = await loadSupplierRow(admin, supplierId);
  if (loaded.error) return { error: loaded.error, supplier: null };
  if (!loaded.row) return { error: null, supplier: null };

  let email = loaded.row.public_email || null;

  if (!email && loaded.row.auth_user_id) {
    try {
      const authResp = await admin.auth.admin.getUserById(loaded.row.auth_user_id);
      email = authResp?.data?.user?.email || null;
    } catch {
      email = null;
    }
  }

  return {
    error: null,
    supplier: {
      id: loaded.row.id,
      name: loaded.row.business_name || "Supplier",
      email,
    },
  };
}

export async function getQuoteCustomerContact(admin, quoteId) {
  const { data: quote, error: quoteErr } = await admin
    .from("quotes")
    .select("id,customer_action_email,customer_action_name,enquiry_id")
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteErr) return { error: quoteErr, customer: null };
  if (!quote) return { error: null, customer: null };

  let email = quote.customer_action_email || null;
  let name = quote.customer_action_name || null;

  if (!email && quote.enquiry_id) {
    const { data: enquiry } = await admin
      .from("enquiries")
      .select("customer_id")
      .eq("id", quote.enquiry_id)
      .maybeSingle();

    if (enquiry?.customer_id) {
      const { data: customer } = await admin
        .from("customers")
        .select("email,full_name")
        .eq("id", enquiry.customer_id)
        .maybeSingle();

      email = email || customer?.email || null;
      name = name || customer?.full_name || null;
    }
  }

  return {
    error: null,
    customer: {
      email,
      name,
    },
  };
}

export async function getQuoteToken(admin, quoteId) {
  const { data } = await admin
    .from("quote_public_links")
    .select("token")
    .eq("quote_id", quoteId)
    .maybeSingle();
  return data?.token || null;
}

export async function notifyQuoteSent({ admin, req, quoteId, supplierId }) {
  const eventKey = `quote_sent:${quoteId}`;
  const lock = await reserveEvent(admin, eventKey, { quoteId, supplierId });
  if (!lock.ok || !lock.reserved) return lock;

  const supplierResp = await getSupplierContact(admin, supplierId);
  if (supplierResp.error || !supplierResp.supplier) return { ok: false, error: supplierResp.error || new Error("Supplier missing") };

  await createSupplierNotification(admin, {
    supplier_id: supplierId,
    type: "quote_sent",
    title: "Quote sent",
    body: "Your quote has been sent to the customer.",
    url: `/supplier/quotes?open=${quoteId}`,
    entity_type: "quote",
    entity_id: quoteId,
  });

  const supplierUrl = buildAbsoluteUrl(req, `/supplier/quotes?open=${quoteId}`);
  const email = quoteSentEmail({ supplierName: supplierResp.supplier.name, quoteId, supplierUrl });
  if (supplierResp.supplier.email) {
    await sendEmail({
      to: supplierResp.supplier.email,
      subject: email.subject,
      html: email.html,
      eventKey,
    });
  }

  return { ok: true, reserved: true };
}

export async function notifyQuoteAccepted({ admin, req, quoteId, supplierId, customerName, customerEmail }) {
  const supplierEvent = `quote_accepted_supplier:${quoteId}`;
  const supplierLock = await reserveEvent(admin, supplierEvent, { quoteId, supplierId });
  if (supplierLock.ok && supplierLock.reserved) {
    const supplierResp = await getSupplierContact(admin, supplierId);
    if (supplierResp.supplier) {
      await createSupplierNotification(admin, {
        supplier_id: supplierId,
        type: "quote_accepted",
        title: "Quote accepted",
        body: "A customer accepted your quote.",
        url: `/supplier/quotes?open=${quoteId}`,
        entity_type: "quote",
        entity_id: quoteId,
      });

      const supplierUrl = buildAbsoluteUrl(req, `/supplier/quotes?open=${quoteId}`);
      const tpl = quoteAcceptedEmailToSupplier({
        supplierName: supplierResp.supplier.name,
        quoteId,
        customerName,
        customerEmail,
        supplierUrl,
      });

      if (supplierResp.supplier.email) {
        await sendEmail({ to: supplierResp.supplier.email, subject: tpl.subject, html: tpl.html, eventKey: supplierEvent });
      }
    }
  }

  const customerEvent = `quote_accepted_customer:${quoteId}`;
  const customerLock = await reserveEvent(admin, customerEvent, { quoteId });
  if (customerLock.ok && customerLock.reserved) {
    const targetEmail = customerEmail || null;
    if (targetEmail) {
      const token = await getQuoteToken(admin, quoteId);
      const publicQuoteUrl = token ? buildAbsoluteUrl(req, `/quote/${token}`) : null;
      const tpl = customerAcceptedConfirmationEmail({
        customerName,
        quoteSummary: `Quote ID: ${quoteId}`,
        publicQuoteUrl,
      });
      await sendEmail({ to: targetEmail, subject: tpl.subject, html: tpl.html, eventKey: customerEvent });
    }
  }

  return { ok: true };
}

export async function notifyQuoteDeclined({ admin, req, quoteId, supplierId, customerName, customerEmail }) {
  const supplierEvent = `quote_declined_supplier:${quoteId}`;
  const supplierLock = await reserveEvent(admin, supplierEvent, { quoteId, supplierId });
  if (supplierLock.ok && supplierLock.reserved) {
    const supplierResp = await getSupplierContact(admin, supplierId);
    if (supplierResp.supplier) {
      await createSupplierNotification(admin, {
        supplier_id: supplierId,
        type: "quote_declined",
        title: "Quote declined",
        body: "A customer declined your quote.",
        url: `/supplier/quotes?open=${quoteId}`,
        entity_type: "quote",
        entity_id: quoteId,
      });

      const supplierUrl = buildAbsoluteUrl(req, `/supplier/quotes?open=${quoteId}`);
      const tpl = quoteDeclinedEmailToSupplier({
        supplierName: supplierResp.supplier.name,
        quoteId,
        customerName,
        customerEmail,
        supplierUrl,
      });

      if (supplierResp.supplier.email) {
        await sendEmail({ to: supplierResp.supplier.email, subject: tpl.subject, html: tpl.html, eventKey: supplierEvent });
      }
    }
  }

  const customerEvent = `quote_declined_customer:${quoteId}`;
  const customerLock = await reserveEvent(admin, customerEvent, { quoteId });
  if (customerLock.ok && customerLock.reserved) {
    const targetEmail = customerEmail || null;
    if (targetEmail) {
      const token = await getQuoteToken(admin, quoteId);
      const publicQuoteUrl = token ? buildAbsoluteUrl(req, `/quote/${token}`) : null;
      const tpl = customerDeclinedConfirmationEmail({
        customerName,
        quoteSummary: `Quote ID: ${quoteId}`,
        publicQuoteUrl,
      });
      await sendEmail({ to: targetEmail, subject: tpl.subject, html: tpl.html, eventKey: customerEvent });
    }
  }

  return { ok: true };
}

export async function notifyMessageToSupplier({ admin, req, messageId, supplierId, threadId, preview }) {
  const eventKey = `message_received_supplier:${messageId}`;
  const lock = await reserveEvent(admin, eventKey, { messageId, supplierId, threadId });
  if (!lock.ok || !lock.reserved) return lock;

  const supplierResp = await getSupplierContact(admin, supplierId);
  if (!supplierResp.supplier) return { ok: false };

  await createSupplierNotification(admin, {
    supplier_id: supplierId,
    type: "message_received",
    title: "New customer message",
    body: trimPreview(preview, 180),
    url: `/supplier/messages?thread=${threadId}`,
    entity_type: "thread",
    entity_id: threadId,
  });

  const threadUrl = buildAbsoluteUrl(req, `/supplier/messages?thread=${threadId}`);
  const tpl = messageReceivedEmailToSupplier({
    supplierName: supplierResp.supplier.name,
    preview: trimPreview(preview, 180),
    threadUrl,
  });

  if (supplierResp.supplier.email) {
    await sendEmail({ to: supplierResp.supplier.email, subject: tpl.subject, html: tpl.html, eventKey });
  }

  return { ok: true };
}

export async function notifyMessageToCustomer({ admin, req, messageId, quoteId, preview }) {
  const eventKey = `message_received_customer:${messageId}`;
  const lock = await reserveEvent(admin, eventKey, { messageId, quoteId });
  if (!lock.ok || !lock.reserved) return lock;

  const customerResp = await getQuoteCustomerContact(admin, quoteId);
  if (!customerResp.customer?.email) return { ok: true, skipped: true };

  const token = await getQuoteToken(admin, quoteId);
  const publicQuoteUrl = token ? buildAbsoluteUrl(req, `/quote/${token}`) : null;
  const tpl = messageReceivedEmailToCustomer({ preview: trimPreview(preview, 180), publicQuoteUrl });

  await sendEmail({
    to: customerResp.customer.email,
    subject: tpl.subject,
    html: tpl.html,
    eventKey,
  });

  return { ok: true };
}
