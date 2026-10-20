import { createClient } from "@supabase/supabase-js";
// This helper allowlists an EXISTING Supabase Auth user by UUID. It never creates passwords.
const id = process.argv[2];
if (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id || "",
  )
)
  throw new Error(
    "Usage: node --env-file=.env scripts/bootstrap-staff.mjs USER_UUID",
  );
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!url || !key)
  throw new Error(
    "Configure server-side Supabase environment variables first.",
  );
const db = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await db.auth.admin.getUserById(id);
if (error || !data.user) throw new Error("Supabase Auth user not found");
const result = await db
  .from("staff_users")
  .upsert({ user_id: id, role: "admin" }, { onConflict: "user_id" });
if (result.error)
  throw new Error(
    "Allowlisting failed; check migrations and service-role access",
  );
console.log(
  "Existing user allowlisted as staff. Sign in using that user’s Supabase Auth password.",
);
