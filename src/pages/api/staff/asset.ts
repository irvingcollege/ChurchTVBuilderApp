import { z } from "zod";
import { database, checked } from "../../../lib/server/db";
import { endpoint, json, staff } from "../../../lib/server/http";
export const GET = endpoint(async (c) => {
  const { db, user } = await staff(c);
  const id = z.string().uuid().parse(c.url.searchParams.get("id"));
  const asset = checked(
    await db.from("assets").select("id,bucket_path").eq("id", id).single(),
  );
  const admin = database();
  const signed = checked(
    await admin.storage
      .from("church-assets")
      .createSignedUrl(asset!.bucket_path, 60),
  );
  checked(
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "asset_read_url_issued",
      entity_id: id,
    }),
  );
  return json({ url: signed!.signedUrl, expiresIn: 60 });
});
