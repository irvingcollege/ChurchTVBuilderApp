import ipaddr from "ipaddr.js";
import { webUrl } from "../config";
export function publicHttps(input: string) {
  const url = new URL(webUrl.parse(input));
  const host = url.hostname
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
    .replace(/\.$/, "");
  if (
    (url.port && url.port !== "443") ||
    !host.includes(".") ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".test") ||
    host.endsWith(".invalid") ||
    host === "localhost"
  )
    throw new Error("Private or non-public destination");
  if (ipaddr.isValid(host) && ipaddr.process(host).range() !== "unicast")
    throw new Error("Private or reserved IP destination");
  return url;
}
export function preflight(input: string) {
  try {
    publicHttps(input);
    return {
      parse: "passed",
      scheme: "HTTPS",
      manifest: "not_fetched",
      network: "unknown",
      cors: "For web-based TV players, the stream host must allow the deployed player origin. Server checks cannot prove browser CORS compatibility.",
      codecSupport: "unknown",
      deviceSupport: "unknown",
      guidance:
        "Syntax only. No DNS, manifest, segment, codec, or device test was performed. Validate on actual target devices.",
    };
  } catch {
    return {
      parse: "failed",
      scheme: "HTTPS required",
      manifest: "not_fetched",
      network: "unknown",
      codecSupport: "unknown",
      deviceSupport: "unknown",
      error:
        "Use a public HTTPS URL without credentials, private addresses, or custom ports.",
    };
  }
}
