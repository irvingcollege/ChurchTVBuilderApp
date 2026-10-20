import { z } from "zod";
import { endpoint, json, readJson, staff } from "../../../lib/server/http";
import { preflight } from "../../../lib/server/preflight";
export const POST = endpoint(async (c) => {
  await staff(c);
  const { url } = z
    .object({ url: z.string().max(2048) })
    .parse(await readJson(c.request));
  return json(preflight(url));
});
