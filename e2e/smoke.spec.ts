import { expect, test } from "@playwright/test";

test("login → today → plan", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Passphrase").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong passphrase.")).toBeVisible();

  await page.getByLabel("Passphrase").fill("e2e-passphrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/Day \d+ of 47/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Start today's session" })).toBeVisible();

  await page.getByRole("link", { name: "Plan" }).click();
  await expect(page.getByRole("heading", { name: "47-day roadmap" })).toBeVisible();
  await expect(page.getByText("Day 47")).toBeVisible();
  await expect(page.getByText("EXAM DAY")).toBeVisible();
  await expect(page.getByText(/0\/26 tasks studied/)).toBeVisible();

  // tick day 1 and see the count move
  await page.getByRole("button", { name: "Mark day 1 done" }).click();
  await expect(page.getByText(/1\/47 days done/)).toBeVisible();
});

test("empty-bank screens degrade gracefully and the design page renders both themes", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Passphrase").fill("e2e-passphrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/practice");
  await expect(page.getByText("The bank is empty")).toBeVisible();
  await page.goto("/exam");
  await expect(page.getByRole("button", { name: "Start a full mock" })).toBeDisabled();
  await page.goto("/analytics");
  await expect(page.getByText("Readiness gates")).toBeVisible();
  await expect(page.getByText(/Cold baseline|cold baseline/)).toBeVisible();
  await page.goto("/design");
  await expect(page.locator('[data-theme="dark"]')).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByText("Bank, generation and spend")).toBeVisible();
});
