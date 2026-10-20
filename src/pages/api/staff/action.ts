import { z } from "zod";
import { platforms, statuses, churchConfigSchema } from "../../../lib/config";
import { database, checked } from "../../../lib/server/db";
import {
  endpoint,
  HttpError,
  json,
  readJson,
  staff,
} from "../../../lib/server/http";
import { notifyMissing } from "../../../lib/server/email";
const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    id: z.string().uuid(),
    expected: z.enum(statuses),
    target: z.enum(statuses),
    note: z.string().trim().min(1).max(4000),
  }),
  z.object({
    action: z.literal("note"),
    id: z.string().uuid(),
    note: z.string().trim().min(1).max(4000),
  }),
  z.object({
    action: z.literal("notify"),
    id: z.string().uuid(),
    note: z.string().trim().min(1).max(4000),
  }),
  z.object({
    action: z.literal("build"),
    id: z.string().uuid(),
    platform: z.enum(platforms),
  }),
]);
export const POST = endpoint(async (c) => {
  const { db } = await staff(c);
  const a = actionSchema.parse(await readJson(c.request));
  const submission = checked(
    await db.from("submissions").select("*").eq("id", a.id).single(),
  );
  if (!submission) throw new HttpError(404, "Submission not found");
  if (a.action === "status") {
    const result = await db.rpc("change_status", {
      sid: a.id,
      expected: a.expected,
      target: a.target,
      reason: a.note,
    });
    if (result.error)
      throw new HttpError(
        409,
        "Status change refused. Reload and check transition rules; QA and later states require an actual artifact.",
      );
  }
  if (a.action === "note")
    checked(await db.rpc("add_note", { sid: a.id, note: a.note }));
  if (a.action === "notify") {
    const church = checked(
      await db
        .from("churches")
        .select("contact_email")
        .eq("id", submission.church_id)
        .single(),
    );
    const nid = checked(
      await db.rpc("request_materials", { sid: a.id, message: a.note }),
    );
    // Privileged update is only for delivery receipt after staff authentication and RLS lookup.
    const result = await notifyMissing(church!.contact_email, a.note);
    checked(
      await database()
        .from("notifications")
        .update({ state: result.state, provider_id: result.providerId || null })
        .eq("id", nid),
    );
    return json({
      message:
        result.state === "simulated"
          ? "Development simulation recorded. No email sent."
          : result.state === "sent"
            ? "Email provider accepted the message; delivery is not guaranteed."
            : "Email failed. Request recorded; contact the church manually.",
    });
  }
  if (a.action === "build") {
    const config = checked(
      await db
        .from("church_configs")
        .select("*")
        .eq("church_id", submission.church_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),
    );
    churchConfigSchema.parse(config.config_json);
    const jid = checked(
      await db.rpc("queue_simulation", {
        tenant: submission.church_id,
        config_id: config.id,
        target: a.platform,
      }),
    );
    checked(await db.rpc("finish_simulation", { jid }));
    return json({
      message:
        "Dry run recorded as failed: native build worker is not installed. No artifact or download exists.",
    });
  }
  return json({ message: "Saved" });
});
