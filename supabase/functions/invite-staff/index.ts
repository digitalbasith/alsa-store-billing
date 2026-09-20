import { createClient } from "supabase";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const allowedRoles = new Set([
  "admin",
  "cashier",
  "inventory_manager",
  "accountant",
  "staff",
]);

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return response(200, { ok: true });
  if (request.method !== "POST") return response(405, { error: "Method not allowed" });

  const authorization = request.headers.get("Authorization");
  if (!authorization) return response(401, { error: "Authentication required" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}") as Record<string, string>;
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as Record<string, string>;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || publishableKeys.default;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || secretKeys.default;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response(500, { error: "Function configuration is incomplete" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return response(401, { error: "Invalid session" });

  let payload: { store_id?: string; email?: string; display_name?: string; role?: string };
  try {
    payload = await request.json();
  } catch {
    return response(400, { error: "Invalid JSON body" });
  }

  const storeId = payload.store_id?.trim();
  const email = payload.email?.trim().toLowerCase();
  const displayName = payload.display_name?.trim() || "Nila Staff";
  const role = payload.role?.trim() || "staff";
  if (!storeId || !email || !email.includes("@") || !allowedRoles.has(role)) {
    return response(400, { error: "Valid store, email and staff role are required" });
  }

  const { data: callerMembership, error: membershipError } = await userClient
    .from("store_members")
    .select("role")
    .eq("store_id", storeId)
    .eq("user_id", authData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (membershipError || !callerMembership || !["super_admin", "admin"].includes(callerMembership.role)) {
    return response(403, { error: "Only a Super Admin or Admin can invite staff" });
  }
  if (role === "admin" && callerMembership.role !== "super_admin") {
    return response(403, { error: "Only a Super Admin can invite another Admin" });
  }

  let invitedUserId: string | undefined;
  let newlyInvited = false;
  const { data: invitation, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: displayName, invited_store_id: storeId },
  });

  if (!inviteError && invitation.user) {
    invitedUserId = invitation.user.id;
    newlyInvited = true;
  } else {
    const { data: usersPage, error: usersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) return response(400, { error: inviteError?.message || "Staff invitation failed" });
    invitedUserId = usersPage.users.find((user) => user.email?.toLowerCase() === email)?.id;
    if (!invitedUserId) return response(400, { error: inviteError?.message || "Staff invitation failed" });
  }

  const { error: linkError } = await adminClient.from("store_members").upsert({
    store_id: storeId,
    user_id: invitedUserId,
    role,
    display_name: displayName,
    active: true,
  }, { onConflict: "store_id,user_id" });

  if (linkError) {
    if (newlyInvited) await adminClient.auth.admin.deleteUser(invitedUserId);
    return response(400, { error: "Could not assign the staff role" });
  }

  return response(200, {
    ok: true,
    invited: newlyInvited,
    message: newlyInvited ? "Invitation email sent" : "Existing user added to the store",
  });
});
