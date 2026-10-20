import { endpoint, json } from "../../lib/server/http";
import { database } from "../../lib/server/db";
export const POST = endpoint(async (c) => {
  const token = c.cookies.get("staff_access")?.value;
  c.cookies.delete("staff_access", { path: "/" });
  if (token) await database(token).auth.signOut();
  return json({ ok: true });
});
