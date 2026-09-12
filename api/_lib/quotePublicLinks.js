// Call only after the handler has verified quote ownership/status.
// The quote_id unique constraint arbitrates concurrent creators; never rotate
// an existing token or silently reactivate a deliberately revoked link.
export async function ensureQuotePublicLink(admin, quoteId, createdByUser) {
  const load = () =>
    admin
      .from("quote_public_links")
      .select("id,token,revoked_at")
      .eq("quote_id", quoteId)
      .maybeSingle();
  let result = await load();
  if (result.error)
    throw new Error(`Link lookup failed: ${result.error.message}`);
  if (!result.data) {
    result = await admin
      .from("quote_public_links")
      .insert([{ quote_id: quoteId, created_by_user: createdByUser }])
      .select("id,token,revoked_at")
      .single();
    if (result.error?.code === "23505") result = await load();
    if (result.error)
      throw new Error(`Failed to create link: ${result.error.message}`);
  }
  if (!result.data?.token) throw new Error("Quote link unavailable");
  if (result.data.revoked_at) {
    const error = new Error(
      "Quote link has been revoked; it cannot be reused.",
    );
    error.status = 409;
    throw error;
  }
  return result.data;
}
