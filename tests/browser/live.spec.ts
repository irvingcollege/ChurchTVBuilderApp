import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import fixture from "../../fixtures/sample-church.json" with { type: "json" };
// Opt-in only: never run against a production project.
const enabled = process.env.LOCAL_SUPABASE_E2E === "1";
test("real local Supabase: intake, private upload, staff review, email simulation and dry run", async ({
  page,
  request,
}) => {
  test.skip(!enabled, "Requires an explicitly enabled local Supabase stack");
  const url = process.env.SUPABASE_URL!;
  expect(["localhost", "127.0.0.1"]).toContain(new URL(url).hostname);
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const anon = createClient(url, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const suffix = randomUUID();
  const email = `staff-${suffix}@example.org`;
  const password = randomUUID() + "aA1!";
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  const uid = created.data.user!.id;
  try {
    expect(
      (
        await admin
          .from("staff_users")
          .insert({ user_id: uid, role: "reviewer" })
      ).error,
    ).toBeNull();
    const config = { ...fixture, displayName: `Test ${suffix}` };
    const response = await request.post("/api/intake", {
      headers: { Origin: "http://localhost:4321" },
      multipart: {
        config: JSON.stringify(config),
        company: "",
        logo: {
          name: "../../unsafe.png",
          mimeType: "image/png",
          buffer: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
        },
      },
    });
    expect(response.status(), await response.text()).toBe(201);
    const { id } = await response.json();
    const submission = await admin
      .from("submissions")
      .select("*")
      .eq("id", id)
      .single();
    expect(submission.error).toBeNull();
    const assets = await admin
      .from("assets")
      .select("*")
      .eq("church_id", submission.data!.church_id);
    expect(assets.data).toHaveLength(1);
    expect(assets.data![0].bucket_path).not.toContain("unsafe");
    const publicRead = await anon.from("submissions").select("*");
    expect(publicRead.data || []).toHaveLength(0);
    const publicImage = await request.get(
      `${url}/storage/v1/object/public/church-assets/${assets.data![0].bucket_path}`,
    );
    expect(publicImage.ok()).toBe(false);
    await page.goto("/staff/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/staff$/);
    await page.goto(`/staff/${id}`);
    await expect(
      page.getByRole("heading", { name: config.displayName, exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "View logo" }).click();
    await expect(page.locator("#asset-output img")).toBeVisible();
    await page
      .locator("form[data-action=note] textarea")
      .fill("Integration review note");
    await page.getByRole("button", { name: "Add note", exact: true }).click();
    await expect(
      page.getByText("Integration review note", { exact: true }),
    ).toBeVisible();
    await page
      .locator("form[data-action=status] select")
      .selectOption("needs_info");
    await page
      .locator("form[data-action=status] textarea")
      .fill("Logo needs review");
    await page.getByRole("button", { name: "Save status" }).click();
    await expect(
      page.getByText("submitted → needs_info", { exact: true }),
    ).toBeVisible();
    await page
      .locator("form[data-action=notify] textarea")
      .fill("Please provide a banner");
    await page
      .getByRole("button", { name: "Request missing materials" })
      .click();
    await expect(page.locator("#action-result")).toContainText("No email sent");
    await expect(page.getByText("simulated", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Run simulation" }).click();
    await expect(page.locator("#action-result")).toContainText("No artifact");
    await expect(
      page.getByText("failed · roku", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Check stream URL syntax" }).click();
    await expect(page.locator("#preflight-result")).toContainText(
      "not_fetched",
    );
    const signed = await page.request.get(
      `/api/staff/asset?id=${assets.data![0].id}`,
    );
    expect(signed.status()).toBe(200);
    const signedBody = await signed.json();
    expect(signedBody.expiresIn).toBe(60);
    expect((await request.get(signedBody.url)).ok()).toBe(true);
  } finally {
    // Audit/history deliberately retain actor references. Remove access, not the immutable actor.
    await admin.from("staff_users").delete().eq("user_id", uid);
    await admin.auth.admin.updateUserById(uid, { ban_duration: "876000h" });
  }
});
