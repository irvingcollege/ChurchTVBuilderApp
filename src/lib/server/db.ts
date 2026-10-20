import { createClient } from "@supabase/supabase-js";
export function env(name: string): string {
  return process.env[name] || import.meta.env[name] || "";
}
export function database(token?: string) {
  const url = env("SUPABASE_URL");
  const key = env(token ? "SUPABASE_ANON_KEY" : "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SETUP_REQUIRED");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(token
      ? { global: { headers: { Authorization: `Bearer ${token}` } } }
      : {}),
  });
}
export function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new Error("Database operation failed");
  return result.data;
}

export function authDatabase() {
  const url = env("SUPABASE_URL"),
    key = env("SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("SETUP_REQUIRED");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
