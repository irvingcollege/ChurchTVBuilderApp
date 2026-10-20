import { z } from "zod";
import { authDatabase } from "../../lib/server/db";
import { endpoint, HttpError, json, readJson } from "../../lib/server/http";
export const POST = endpoint(async (c) => {
  const input = z
    .object({
      email: z.string().email().max(254),
      password: z.string().min(1).max(200),
    })
    .parse(await readJson(c.request));
  // An anon-key client is used for sign-in; service-role never substitutes for the staff JWT.
  const db = authDatabase();
  const { data, error } = await db.auth.signInWithPassword(input);
  if (error || !data.session) throw new HttpError(401, "Sign-in failed");
  const staff = await db
    .from("staff_users")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!staff.data) {
    await db.auth.signOut();
    throw new HttpError(403, "This account is not authorized staff");
  }
  c.cookies.set("staff_access", data.session.access_token, {
    httpOnly: true,
    secure: new URL(c.request.url).protocol === "https:",
    sameSite: "strict",
    path: "/",
    maxAge: data.session.expires_in,
  });
  return json({ ok: true });
});
