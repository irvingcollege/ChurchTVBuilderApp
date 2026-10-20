import { test, expect } from "@playwright/test";
test("compiled login executes under CSP and reports a rejected login", async ({
  page,
}) => {
  const methods: string[] = [];
  const policyErrors: string[] = [];
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      /Content Security Policy|violates.*script-src/.test(m.text())
    )
      policyErrors.push(m.text());
  });
  await page.route("**/api/login", async (route) => {
    methods.push(route.request().method());
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Sign-in failed" }),
    });
  });
  await page.goto("/staff/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill("browser-test@example.org");
  await page
    .getByLabel("Password", { exact: true })
    .fill("fictional-test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#message")).toHaveText("Sign-in failed");
  expect(methods).toEqual(["POST"]);
  expect(policyErrors).toEqual([]);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  expect(page.url()).not.toContain("fictional-test-password");
});
test("without JavaScript, passwords are submitted in a POST body rather than the URL", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("http://localhost:4323/staff/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill("browser-test@example.org");
    await page
      .getByLabel("Password", { exact: true })
      .fill("fictional-test-password");
    const navigation = page.waitForRequest((r) => r.isNavigationRequest());
    await page.getByRole("button", { name: "Sign in" }).click();
    const request = await navigation;
    expect(request.method()).toBe("POST");
    expect(request.url()).not.toContain("fictional-test-password");
  } finally {
    await context.close();
  }
});
