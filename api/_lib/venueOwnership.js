export async function isVenueOwner(admin, userId, venueId) {
  const resp = await admin
    .from("venue_owners_link")
    .select("id")
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .maybeSingle();
  if (resp.error) return { ok: false, error: resp.error.message, owns: false };
  return { ok: true, owns: !!resp.data };
}

export async function listOwnedVenueIds(admin, userId) {
  const resp = await admin
    .from("venue_owners_link")
    .select("venue_id")
    .eq("user_id", userId);
  if (resp.error) return { ok: false, error: resp.error.message, venueIds: [] };
  const venueIds = Array.from(new Set((resp.data || []).map((row) => row.venue_id).filter(Boolean)));
  return { ok: true, venueIds };
}

