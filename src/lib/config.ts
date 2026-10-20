import { z } from "zod";
export const webUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Use an HTTPS URL without embedded credentials");
const optionalUrl = z.union([webUrl, z.literal("")]).default("");
export const platforms = ["roku", "androidtv", "samsung", "lg"] as const;
export const churchConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    legalName: z.string().trim().min(2).max(180),
    displayName: z.string().trim().min(2).max(100),
    contactName: z.string().trim().min(2).max(120),
    contactEmail: z.string().trim().email().max(254),
    website: optionalUrl,
    socialLinks: z.array(webUrl).max(6),
    description: z.string().trim().min(10).max(2000),
    serviceSchedule: z.string().trim().min(3).max(600),
    timezone: z
      .string()
      .max(80)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Use an IANA timezone, e.g. America/Chicago"),
    livestreamUrl: webUrl,
    archiveUrl: optionalUrl,
    appName: z.string().trim().min(2).max(50),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    platforms: z
      .array(z.enum(platforms))
      .min(1)
      .max(4)
      .transform((v) => [...new Set(v)]),
    contentRights: z.literal(true),
    consent: z.literal(true),
  })
  .strict();
export type ChurchConfig = z.infer<typeof churchConfigSchema>;
export const statuses = [
  "submitted",
  "needs_info",
  "approved",
  "building",
  "qa",
  "publishing",
  "published",
  "rejected",
  "on_hold",
] as const;
export type Status = (typeof statuses)[number];
export const transitions: Record<Status, readonly Status[]> = {
  submitted: ["needs_info", "approved", "rejected", "on_hold"],
  needs_info: ["approved", "rejected", "on_hold"],
  approved: ["building", "needs_info", "rejected", "on_hold"],
  building: ["qa", "needs_info", "on_hold"],
  qa: ["publishing", "building", "on_hold"],
  publishing: ["published", "qa", "on_hold"],
  published: ["on_hold"],
  rejected: [],
  on_hold: ["needs_info", "approved", "rejected"],
};
export function canTransition(from: Status, to: Status) {
  return transitions[from].includes(to);
}
