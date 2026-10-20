import { HttpError } from "./http";
export const MAX_ASSET = 2 * 1024 * 1024;
export function inspectImage(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > MAX_ASSET)
    throw new HttpError(400, "Images must be between 1 byte and 2 MiB");
  const png =
    bytes.length > 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const jpeg =
    bytes.length > 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255 &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217;
  if (mime === "image/png" && png) return "png";
  if (mime === "image/jpeg" && jpeg) return "jpg";
  throw new HttpError(
    400,
    "Only PNG and JPEG images with matching file signatures are accepted",
  );
}
export async function boundedForm(request: Request) {
  const limit = 2 * MAX_ASSET + 65536;
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing form");
  let size = 0;
  const parts: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, "Submission exceeds upload limit");
    }
    parts.push(value);
  }
  return new Response(new Blob(parts as BlobPart[]), {
    headers: { "Content-Type": request.headers.get("content-type") || "" },
  }).formData();
}

export async function normalizeImage(bytes: Uint8Array, mime: string) {
  const extension = inspectImage(bytes, mime);
  const { default: sharp } = await import("sharp");
  try {
    const image = sharp(bytes, {
      limitInputPixels: 16_000_000,
      failOn: "warning",
    });
    const meta = await image.metadata();
    if (!meta.width || !meta.height || (meta.pages || 1) > 1)
      throw new Error("Invalid or animated image");
    // Decode and re-encode to discard metadata and trailing/polyglot bytes.
    const clean =
      extension === "png"
        ? await image.rotate().png().toBuffer()
        : await image.rotate().jpeg({ quality: 90 }).toBuffer();
    if (clean.length > MAX_ASSET)
      throw new Error("Normalized image exceeds size limit");
    return { extension, bytes: clean };
  } catch {
    throw new HttpError(
      400,
      "Image could not be decoded safely. Use a non-animated PNG or JPEG, at most 16 megapixels and 2 MiB after normalization.",
    );
  }
}
