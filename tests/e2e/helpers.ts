import { expect, type Page } from "@playwright/test";

export const COMMONMARK = "@docleus/plugin-blocks-commonmark";

let counter = 0;

/** A slug unique within the run, so tests share one server but no data. */
export function uniqueSlug(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  const form = page.getByRole("form", { name: "Development sign-in" });
  await form.getByLabel("Email").fill("e2e@example.com");
  await form.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Organizations" }),
  ).toBeVisible();
}

/** Signs in and creates an organization and a space; resolves to the space path. */
export async function openNewSpace(page: Page): Promise<string> {
  await signIn(page);
  await page.goto("/?new=org");
  const org = page.getByRole("form", { name: "Create organization" });
  await org.getByLabel("Name").fill("E2E");
  await org.getByLabel("Slug").fill(uniqueSlug("org"));
  await org.getByRole("button", { name: "Create organization" }).click();
  await expect(page).toHaveURL(/\/orgs\/[^/?]+$/);

  await page.goto(`${new URL(page.url()).pathname}?new=space`);
  const space = page.getByRole("form", { name: "Create space" });
  await space.getByLabel("Name").fill("Docs");
  await space.getByLabel("Slug").fill(uniqueSlug("space"));
  await space.getByRole("button", { name: "Create space" }).click();
  await expect(page).toHaveURL(/\/orgs\/[^/]+\/spaces\/[^/]+$/);
  return new URL(page.url()).pathname;
}

/** Adds a top-level page and opens it in edit mode. */
export async function newPage(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /^\+? ?New page$/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/pages\/[^/?]+(\?.*)?$/);
  await expect(editorBody(page)).toBeVisible();
}

export function editorBody(page: Page) {
  return page.getByRole("textbox", { name: "Page body" });
}

/** The save state the space top bar shows while editing. */
export function saveState(page: Page) {
  return page.locator(".bar .save-state");
}

/** Saves now (instead of waiting for autosave) and waits for it to land. */
export async function save(page: Page): Promise<void> {
  await editorBody(page).focus();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(saveState(page)).toHaveText("Saved");
}

/** Leaves the read-only view for edit mode, when the page is not in it. */
export async function startEditing(page: Page): Promise<void> {
  const bar = page.locator(".bar");
  const edit = bar.getByRole("button", { name: /^(Edit|Continue editing)$/ });
  if (await edit.isVisible()) await edit.click();
  await expect(bar.getByRole("button", { name: "Done" })).toBeVisible();
}

/** Runs a row action of the page tree from the row's ⋯ menu. */
export async function treeAction(
  page: Page,
  title: string,
  action: "Rename" | "Duplicate" | "Move to…" | "Delete" | "New subpage",
): Promise<void> {
  const tree = page.getByRole("navigation", { name: "Pages" });
  await tree.getByRole("link", { name: title, exact: true }).hover();
  await tree.getByRole("button", { name: `Actions for ${title}` }).click();
  await page
    .getByRole("menu", { name: `Actions for ${title}` })
    .getByRole("menuitem", { name: action })
    .click();
}

/** Renames a page from the tree. */
export async function renamePage(
  page: Page,
  title: string,
  next: string,
): Promise<void> {
  await treeAction(page, title, "Rename");
  const field = page.getByLabel("Rename page");
  await field.fill(next);
  await field.press("Enter");
  await expect(
    page
      .getByRole("navigation", { name: "Pages" })
      .getByRole("link", { name: next, exact: true }),
  ).toBeVisible();
}

/** The page's block tree as the server stores it. */
export async function storedBody(page: Page): Promise<unknown> {
  const path = new URL(page.url()).pathname;
  return page.evaluate(async (apiPath) => {
    const response = await fetch(`/api${apiPath}`);
    const json = (await response.json()) as { page: { body: unknown } };
    return json.page.body;
  }, path);
}

export async function setSpacePlugin(
  page: Page,
  spacePath: string,
  plugin: string,
  value: "inherit" | "on" | "off",
): Promise<void> {
  await page.goto(`${spacePath}/settings/plugins`);
  const choice = page
    .getByRole("group", { name: `Enable ${plugin}` })
    .getByRole("button", {
      name: { inherit: "Same as organization", on: "On", off: "Off" }[value],
      exact: true,
    });
  if ((await choice.getAttribute("aria-pressed")) === "true") return;
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().endsWith("/plugins"),
  );
  await choice.click();
  expect((await saved).ok()).toBe(true);
}
