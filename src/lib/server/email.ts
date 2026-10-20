import { env } from "./db";
export type NotificationResult = {
  state: "simulated" | "sent" | "failed";
  providerId?: string;
};
export async function notifyMissing(
  to: string,
  message: string,
): Promise<NotificationResult> {
  if ((env("EMAIL_PROVIDER") || "development") === "development")
    return { state: "simulated" };
  if (
    env("EMAIL_PROVIDER") !== "resend" ||
    !env("RESEND_API_KEY") ||
    !env("EMAIL_FROM")
  )
    return { state: "failed" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${env("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env("EMAIL_FROM"),
        to: [to],
        subject: "Church TV: additional materials requested",
        text: message,
      }),
    });
    if (!r.ok) return { state: "failed" };
    const result = await r.json();
    return result.id
      ? { state: "sent", providerId: result.id }
      : { state: "failed" };
  } catch {
    return { state: "failed" };
  }
}
