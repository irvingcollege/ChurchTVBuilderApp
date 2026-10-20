import { randomUUID } from "node:crypto";
import { churchConfigSchema } from "../../lib/config";
import {
  boundedForm,
  normalizeImage,
  MAX_ASSET,
} from "../../lib/server/assets";
import { database, checked } from "../../lib/server/db";
import { endpoint, HttpError, json } from "../../lib/server/http";
import { publicHttps } from "../../lib/server/preflight";
export const POST = endpoint(async ({ request }) => {
  const db = database();
  if (!checked(await db.rpc("consume_intake_budget")))
    throw new HttpError(
      429,
      "Submission capacity reached. Please try again later.",
    );
  const form = await boundedForm(request);
  if (form.get("company"))
    throw new HttpError(400, "Unable to accept submission");
  let input;
  try {
    input = JSON.parse(String(form.get("config")));
  } catch {
    throw new HttpError(400, "Invalid submission");
  }
  const config = churchConfigSchema.parse(input);
  for (const value of [
    config.website,
    config.livestreamUrl,
    config.archiveUrl,
    ...config.socialLinks,
  ].filter(Boolean)) {
    try {
      publicHttps(value);
    } catch {
      throw new HttpError(400, "Links must use public HTTPS destinations");
    }
  }
  const tenant = randomUUID();
  const prepared = [];
  for (const kind of ["logo", "banner"]) {
    const file = form.get(kind);
    if (file instanceof File && file.size) {
      if (file.size > MAX_ASSET)
        throw new HttpError(400, "Each image must be at most 2 MiB");
      const normalized = await normalizeImage(
        new Uint8Array(await file.arrayBuffer()),
        file.type,
      );
      const bytes = normalized.bytes;
      const ext = normalized.extension;
      prepared.push({
        kind,
        bytes,
        mime_type: file.type,
        size_bytes: bytes.length,
        bucket_path: `${tenant}/${randomUUID()}.${ext}`,
      });
    }
  }
  const uploaded: string[] = [];
  try {
    for (const file of prepared) {
      checked(
        await db.storage
          .from("church-assets")
          .upload(file.bucket_path, file.bytes, {
            contentType: file.mime_type,
            upsert: false,
          }),
      );
      uploaded.push(file.bucket_path);
    }
    const assets = prepared.map(
      ({ kind, mime_type, size_bytes, bucket_path }) => ({
        kind,
        mime_type,
        size_bytes,
        bucket_path,
      }),
    );
    const id = checked(
      await db.rpc("submit_church", { tenant, config, uploaded: assets }),
    );
    return json(
      {
        id,
        message:
          "Submission received. Our team will review your materials; no app has been built.",
      },
      201,
    );
  } catch (e) {
    if (uploaded.length) {
      const cleanup = await db.storage.from("church-assets").remove(uploaded);
      if (cleanup.error)
        console.error("Orphan upload cleanup required for tenant", tenant);
    }
    throw e;
  }
});
