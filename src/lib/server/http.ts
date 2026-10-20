import type { APIContext } from "astro";
import { z } from "zod";
import { database, env } from "./db";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(env("SITE_URL") || request.url).origin;
  if (!origin || origin !== expected)
    throw new HttpError(403, "Request origin is not allowed");
}
export async function staff(context: APIContext) {
  const token = context.cookies.get("staff_access")?.value;
  if (!token) throw new HttpError(401, "Staff sign-in required");
  const db = database(token);
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);
  if (error || !user)
    throw new HttpError(401, "Session expired; sign in again");
  const { data } = await db
    .from("staff_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) throw new HttpError(403, "Staff access required");
  return { db, user };
}
export function endpoint(fn: (c: APIContext) => Promise<Response>) {
  return async (c: APIContext) => {
    try {
      if (c.request.method !== "GET") sameOrigin(c.request);
      return await fn(c);
    } catch (e) {
      if (e instanceof z.ZodError)
        return json(
          {
            error: "Validation failed",
            issues: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
          },
          400,
        );
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      if (e instanceof Error && e.message === "SETUP_REQUIRED")
        return json(
          { error: "Supabase is not configured. Follow README setup." },
          503,
        );
      console.error(
        "Request failed",
        e instanceof Error ? e.name : "UnknownError",
      );
      return json(
        { error: "Operation failed. Please retry or contact staff." },
        500,
      );
    }
  };
}
export async function readJson(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 16384)
    throw new HttpError(413, "Request too large");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing body");
  let text = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 16384) {
      await reader.cancel();
      throw new HttpError(413, "Request too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
