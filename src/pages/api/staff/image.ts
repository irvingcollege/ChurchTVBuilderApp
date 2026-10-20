import { z } from "zod";
import { database, checked } from "../../../lib/server/db";
import { endpoint, staff, HttpError } from "../../../lib/server/http";
export const GET = endpoint(async (c) => {
  const { db, user } = await staff(c);
  const id = z.string().uuid().parse(c.url.searchParams.get("id"));
  const asset = checked(
    await db.from("assets").select("*").eq("id", id).single(),
  );
  const admin = database();
  const signed = checked(
    await admin.storage
      .from("church-assets")
      .createSignedUrl(asset!.bucket_path, 60),
  );
  const result = await fetch(signed!.signedUrl, {
    signal: AbortSignal.timeout(8000),
    redirect: "error",
  });
  if (!result.ok) throw new HttpError(502, "Storage image unavailable");
  const image = await result.blob();
  if (image.size > 2097152) throw new HttpError(413, "Image too large");
  checked(
    await admin
      .from("audit_log")
      .insert({ actor_id: user.id, action: "asset_viewed", entity_id: id }),
  );
  return new Response(image, {
    headers: {
      "Content-Type": asset.mime_type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
