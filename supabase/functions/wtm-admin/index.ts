// WTM login management — Supabase Edge Function "wtm-admin"
//
// Creates logins, resets passwords, and deletes logins. These need the service-role key,
// which must never reach the browser, so they run here. Permission rules
// (IT manages everyone; Admin manages supervisors and staff) are enforced
// by wtm_svc_check in the database, the same rules the app's own SQL uses.
//
// Deploy:  supabase functions deploy wtm-admin
// The platform injects SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// readable temporary password, e.g. "Kite-7Rq4-mPz9"
function tempPassword(): string {
  const words = ["Kite", "Fern", "Opal", "Reef", "Moss", "Wren", "Dune", "Pike", "Lark", "Sage", "Cove", "Flint"];
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const rnd = new Uint32Array(9);
  crypto.getRandomValues(rnd);
  const part = (o: number) => Array.from({ length: 4 }, (_, i) => abc[rnd[o + i] % abc.length]).join("");
  return `${words[rnd[8] % words.length]}-${part(0)}-${part(4)}`;
}

const ROLES = ["staff", "supervisor", "admin", "it"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Use POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // who is calling
  const caller = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: who, error: whoErr } = await caller.auth.getUser();
  if (whoErr || !who?.user) return reply({ error: "Your session has expired. Sign in again." }, 401);
  const callerId = who.user.id;

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Send a JSON body." }, 400); }

  try {
    switch (body.action) {
      case "create_user": {
        const email = String(body.email ?? "").trim().toLowerCase();
        const role = String(body.role ?? "staff");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply({ error: "Enter a valid email address." }, 400);
        if (!ROLES.includes(role)) return reply({ error: "Choose a role." }, 400);
        const chk = await admin.rpc("wtm_svc_check", { p_caller: callerId, p_target: null, p_role: role });
        if (chk.error) return reply({ error: chk.error.message }, 403);

        const password = typeof body.password === "string" && body.password.length >= 8 ? body.password : tempPassword();
        const created = await admin.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { full_name: String(body.full_name ?? "") },
        });
        if (created.error || !created.data.user) {
          return reply({ error: created.error?.message ?? "Couldn't create that login." }, 400);
        }
        const after = await admin.rpc("wtm_svc_after_create", {
          p_caller: callerId, p_user: created.data.user.id,
          p: {
            full_name: body.full_name ?? "", short_name: body.short_name ?? "", title: body.title ?? "",
            role, departments: Array.isArray(body.departments) ? body.departments : [],
          },
        });
        if (after.error) {
          await admin.from("profiles").delete().eq("id", created.data.user.id);
          await admin.auth.admin.deleteUser(created.data.user.id);
          return reply({ error: after.error.message }, 400);
        }
        return reply({ user_id: created.data.user.id, password });
      }

      case "reset_password": {
        const target = String(body.user_id ?? "");
        const chk = await admin.rpc("wtm_svc_check", { p_caller: callerId, p_target: target, p_role: null });
        if (chk.error) return reply({ error: chk.error.message }, 403);
        const password = typeof body.password === "string" && body.password.length >= 8 ? body.password : tempPassword();
        const upd = await admin.auth.admin.updateUserById(target, { password });
        if (upd.error) return reply({ error: upd.error.message }, 400);
        const after = await admin.rpc("wtm_svc_after_reset", { p_caller: callerId, p_user: target });
        if (after.error) return reply({ error: after.error.message }, 400);
        return reply({ password });
      }

      case "delete_user": {
        const target = String(body.user_id ?? "");
        const chk = await admin.rpc("wtm_svc_before_delete", { p_caller: callerId, p_user: target });
        if (chk.error) return reply({ error: chk.error.message }, 403);
        const gone = await admin.auth.admin.deleteUser(target);
        if (gone.error && !/not found/i.test(gone.error.message)) return reply({ error: gone.error.message }, 400);
        const after = await admin.rpc("wtm_svc_after_delete", { p_caller: callerId, p_user: target });
        if (after.error) return reply({ error: after.error.message }, 400);
        return reply({ ok: true });
      }

      case "set_active": {
        // Turning a login off in WTM already blocks all data access. This also
        // blocks signing in at all, so the person sees a clear message sooner.
        const target = String(body.user_id ?? "");
        const chk = await admin.rpc("wtm_svc_check", { p_caller: callerId, p_target: target, p_role: null });
        if (chk.error) return reply({ error: chk.error.message }, 403);
        const upd = await admin.auth.admin.updateUserById(target, { ban_duration: body.active ? "none" : "876000h" });
        if (upd.error) return reply({ error: upd.error.message }, 400);
        return reply({ ok: true });
      }

      default:
        return reply({ error: "Unknown action." }, 400);
    }
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
