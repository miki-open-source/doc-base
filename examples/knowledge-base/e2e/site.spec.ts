import { test, expect } from "@playwright/test";
test("GIVEN combined documentation\nWHEN switching audiences and searching\nTHEN content, routes and keyboard interactions work", async ({
  page,
}) => {
  // GIVEN
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Contributors run validation before submitting changes."),
  ).toHaveCount(0);
  // WHEN 1
  await page.getByRole("link", { name: "Contributor", exact: true }).click();
  // THEN 1
  await expect(page).toHaveURL(/_audience\/contributor/);
  await expect(
    page.getByText("Contributors run validation before submitting changes."),
  ).toBeVisible();
  // WHEN 2
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("searchbox").fill("Getting started");
  // THEN 2
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "Getting started" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("old paths redirect directly to canonical pages", async ({ page }) => {
  await page.goto("/getting-started/");
  await expect(page).toHaveURL("/guides/quick-start/");
  await expect(
    page.getByRole("heading", { name: "Getting started", exact: true }),
  ).toBeVisible();
});

test("GIVEN MDX and generated metadata\nWHEN opening the component page\nTHEN its module, heading anchors and copied asset render", async ({
  page,
}) => {
  // GIVEN / WHEN
  await page.goto("/guides/components/");
  // THEN
  await expect(page.getByText("Built with MDX")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Components", exact: true }),
  ).toHaveAttribute("id", "components");
  const image = page.getByRole("img", { name: "Example diagram" });
  await expect(image).toBeVisible();
  expect(
    await image.evaluate((image) => (image as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
});
test("GIVEN independent audience search indexes\nWHEN reading emitted indexes\nTHEN hidden and excluded pages remain absent", async ({
  request,
  page,
}) => {
  // GIVEN / WHEN
  const publicRecords = await (
    await request.get("/_doc-base/search.json")
  ).json();
  const contributorRecords = await (
    await request.get("/_audience/contributor/_doc-base/search.json")
  ).json();
  // THEN
  expect(
    publicRecords.some((record: { key: string }) =>
      record.key.endsWith("::contributor-note"),
    ),
  ).toBe(false);
  expect(
    contributorRecords.some((record: { key: string }) =>
      record.key.endsWith("::contributor-note"),
    ),
  ).toBe(true);
  expect(
    publicRecords.some((record: { key: string }) =>
      record.key.endsWith("::small-note"),
    ),
  ).toBe(false);
  await page.goto("/_audience/contributor/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex",
  );
  await expect(page.getByText(/not authorization/)).toBeVisible();
});
