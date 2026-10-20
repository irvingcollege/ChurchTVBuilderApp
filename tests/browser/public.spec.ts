import { test, expect } from "@playwright/test";
import fixture from "../../fixtures/sample-church.json" with { type: "json" };
test("landing links to an accessible multi-step intake, validates and previews branding", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /More than a stream/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Tell us about your church/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Your church", exact: true }),
  ).toBeVisible();
  for (const name of [
    "legalName",
    "displayName",
    "contactName",
    "contactEmail",
    "description",
    "website",
  ])
    await page
      .locator(`#intake [name=${name}]`)
      .fill(fixture[name as keyof typeof fixture] as string);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("[name=serviceSchedule]").fill(fixture.serviceSchedule);
  await page.locator("[name=livestreamUrl]").fill(fixture.livestreamUrl);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("[name=appName]").fill(fixture.appName);
  await expect(page.locator("[data-preview-title]")).toHaveText(
    fixture.appName,
  );
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#review-summary")).toContainText(
    fixture.contactEmail,
  );
  // Do not send data in a browser smoke test; full persistence is covered separately.
  await page.getByRole("button", { name: "Send for staff review" }).click();
  await expect(page.locator("#result")).toContainText("contentRights");
  expect(errors).toEqual([]);
});
test("staff pages redirect to login and API endpoints deny anonymous callers", async ({
  page,
  request,
}) => {
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/staff\/login/);
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  const r = await request.get(
    "/api/staff/asset?id=11111111-1111-4111-8111-111111111111",
  );
  expect(r.status()).toBe(401);
  const denied = await request.post("/api/staff/action", {
    headers: { Origin: "http://localhost:4321" },
    data: { action: "note" },
  });
  expect(denied.status()).toBe(401);
  const csrf = await request.post("/api/login", {
    headers: { Origin: "https://evil.example" },
    data: { email: "x@example.org", password: "x" },
  });
  expect(csrf.status()).toBe(403);
});
test("intake remains usable at a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/start");
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
