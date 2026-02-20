function normalizeReturnTo(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw || !raw.startsWith("/")) return "";
  if (raw.startsWith("//")) return "";
  return raw;
}

function normalizeSupplierOnboardingStatus(supplier) {
  if (!supplier) return "";
  if (supplier.is_published === true) return "approved";
  const onboarding = String(supplier.onboarding_status || "").trim().toLowerCase();
  if (onboarding) return onboarding;
  const legacy = String(supplier.status || "").trim().toLowerCase();
  if (legacy === "approved") return "approved";
  if (legacy === "pending_review") return "pending_review";
  if (legacy === "rejected") return "rejected";
  return "approved";
}

export function getSupplierStartRoute(user, supplier) {
  if (!supplier?.id) return "/supplier/signup";
  const onboardingStatus = normalizeSupplierOnboardingStatus(supplier);
  if (supplier?.is_published === true) return "/supplier/dashboard";
  if (onboardingStatus === "approved") return "/supplier/dashboard";
  if (onboardingStatus === "awaiting_email_verification") return "/supplier/dashboard";
  if (["draft", "profile_incomplete", "rejected"].includes(onboardingStatus)) return "/suppliers/onboarding";
  return "/supplier/dashboard";
}

async function resolveRoleState(supabase, userId) {
  const { data: profileRow, error: profileErr } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  const profileRole = !profileErr && profileRow?.role ? String(profileRow.role).toLowerCase() : null;

  if (profileRole === "admin") return { role: "admin", supplier: null };
  if (profileRole === "supplier") {
    const { data: supplierRow } = await supabase
      .from("suppliers")
      .select("id,is_published,status,onboarding_status")
      .eq("auth_user_id", userId)
      .maybeSingle();
    return { role: "supplier", supplier: supplierRow || null };
  }
  if (profileRole === "venue_owner" || profileRole === "venue") return { role: "venue_owner", supplier: null };
  if (profileRole === "customer") return { role: "customer", supplier: null };

  const { data: adminRoleRow, error: adminRoleErr } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!adminRoleErr && adminRoleRow?.role === "admin") return { role: "admin", supplier: null };

  const { data: supplierRow, error: supplierErr } = await supabase
    .from("suppliers")
    .select("id,is_published,status,onboarding_status")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!supplierErr && supplierRow?.id) return { role: "supplier", supplier: supplierRow };

  const { data: venueOwnerRoleRow, error: venueOwnerRoleErr } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "venue_owner")
    .maybeSingle();
  if (!venueOwnerRoleErr && venueOwnerRoleRow?.role) return { role: "venue_owner", supplier: null };

  return { role: "customer", supplier: null };
}

export async function resolvePostAuthRoute(supabase, user, requestedReturnTo = "") {
  if (!user?.id) return "/login";
  const roleState = await resolveRoleState(supabase, user.id);
  const returnTo = normalizeReturnTo(requestedReturnTo);

  if (roleState.role === "admin") {
    if (returnTo && returnTo.startsWith("/admin")) return returnTo;
    return "/admin/dashboard";
  }
  if (roleState.role === "supplier") {
    const startRoute = getSupplierStartRoute(user, roleState.supplier);
    if (returnTo && returnTo.startsWith("/supplier")) return returnTo;
    if (returnTo && returnTo.startsWith("/suppliers/") && startRoute.startsWith("/suppliers/")) return returnTo;
    return startRoute;
  }
  if (roleState.role === "venue_owner") {
    if (returnTo && returnTo.startsWith("/venue")) return returnTo;
    return "/venue";
  }
  if (returnTo && returnTo.startsWith("/customer")) return returnTo;
  return "/customer";
}
