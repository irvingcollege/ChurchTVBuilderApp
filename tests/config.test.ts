import { describe, it, expect } from "vitest";
import fixture from "../fixtures/sample-church.json";
import { churchConfigSchema, canTransition } from "../src/lib/config";
import { inspectImage, normalizeImage } from "../src/lib/server/assets";
import { preflight, publicHttps } from "../src/lib/server/preflight";
import { simulateBuild } from "../src/lib/server/builds";
import { notifyMissing } from "../src/lib/server/email";
describe("versioned tenant configuration", () => {
  it("normalizes the fictional fixture", () => {
    expect(churchConfigSchema.parse(fixture).schemaVersion).toBe(1);
  });
  it.each([
    { consent: false },
    { contentRights: false },
    { contactEmail: "invalid" },
    { primaryColor: "red" },
    { schemaVersion: 2 },
    { platforms: [] },
    { timezone: "not-a-timezone" },
    { livestreamUrl: "javascript:alert(1)" },
    { website: "https://user:pass@example.org" },
  ])("rejects unsafe or incomplete intake %j", (change) => {
    expect(
      churchConfigSchema.safeParse({ ...fixture, ...change }).success,
    ).toBe(false);
  });
  it("does not allow status skipping", () => {
    expect(canTransition("submitted", "published")).toBe(false);
    expect(canTransition("submitted", "needs_info")).toBe(true);
  });
});
describe("honest, non-fetching stream preflight", () => {
  it.each([
    "https://127.0.0.1/live",
    "https://10.0.0.1/live",
    "https://169.254.169.254/",
    "https://[::1]/",
    "https://[::ffff:127.0.0.1]/",
    "https://2130706433/",
    "https://192.168.1.1/",
    "https://100.64.0.1/",
    "https://localhost/",
    "https://localhost./",
    "https://a.local/",
    "https://example.org:8443/",
    "http://example.org/",
    "https://user:pass@example.org/",
  ])("blocks %s", (url) => {
    expect(() => publicHttps(url)).toThrow();
  });
  it("never claims network or playback success from syntax", () => {
    expect(preflight(fixture.livestreamUrl)).toMatchObject({
      parse: "passed",
      manifest: "not_fetched",
      network: "unknown",
      deviceSupport: "unknown",
      codecSupport: "unknown",
    });
  });
});
describe("uploads", () => {
  it("accepts matching PNG magic bytes", () => {
    const b = new Uint8Array(25);
    b.set([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(inspectImage(b, "image/png")).toBe("png");
  });
  it("rejects spoofed MIME, SVG, empty and oversized files", () => {
    for (const [b, mime] of [
      [new Uint8Array([1, 2, 3]), "image/png"],
      [new TextEncoder().encode("<svg/>"), "image/svg+xml"],
      [new Uint8Array(), "image/jpeg"],
      [new Uint8Array(2097153), "image/png"],
    ] as const)
      expect(() => inspectImage(b, mime)).toThrow();
  });
});
describe("adapters", () => {
  it("cannot produce a ready artifact from a simulation", () => {
    expect(
      simulateBuild("roku", churchConfigSchema.parse(fixture)),
    ).toMatchObject({ status: "failed", artifact_path: null });
  });
  it("development notification never claims an email was sent", async () => {
    expect(
      await notifyMissing("test@example.org", "Please send a logo"),
    ).toEqual({ state: "simulated" });
  });
});

describe("image decoding", () => {
  it("normalizes a real image and rejects signature-only fakes", async () => {
    const pixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    expect((await normalizeImage(pixel, "image/png")).extension).toBe("png");
    const fake = new Uint8Array(25);
    fake.set([137, 80, 78, 71, 13, 10, 26, 10]);
    await expect(normalizeImage(fake, "image/png")).rejects.toThrow(
      /decoded safely/,
    );
  });
});
