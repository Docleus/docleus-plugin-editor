import { expect, test, type Page } from "@playwright/test";
import {
  COMMONMARK,
  editorBody,
  newPage,
  openNewSpace,
  renamePage,
  save,
  saveState,
  setSpacePlugin,
  startEditing,
  storedBody,
  treeAction,
} from "./helpers.ts";

interface StoredBlock {
  readonly id: string;
  readonly type: string;
  readonly content?: readonly StoredBlock[];
}

/** Types a heading, a two-item list and a paragraph through the shortcuts. */
async function typeBasicBlocks(page: Page): Promise<void> {
  const body = editorBody(page);
  await body.click();
  await page.keyboard.type("# Getting started");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- first item");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second item");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("A plain paragraph.");
  await expect(
    body.getByRole("heading", { name: "Getting started" }),
  ).toBeVisible();
  await expect(body.getByRole("listitem")).toHaveText([
    "first item",
    "second item",
  ]);
}

/** Opens a page from the tree and switches to edit mode. */
async function openPageFromTree(page: Page, title: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Pages" })
    .getByRole("link", { name: title })
    .click();
  await expect(editorBody(page)).toBeVisible();
  await startEditing(page);
}

test("a new page keeps its blocks across save and reload", async ({ page }) => {
  await openNewSpace(page);
  await newPage(page);
  await typeBasicBlocks(page);
  await expect(saveState(page)).toHaveText(/Unsaved|Saving…|Saved/);
  await save(page);
  const saved = await storedBody(page);

  // The space edits main directly here; a reload shows the read-only view.
  await page.goto(new URL(page.url()).pathname);
  const body = editorBody(page);
  await expect(body).toHaveAttribute("contenteditable", "false");
  await expect(
    body.getByRole("heading", { name: "Getting started" }),
  ).toBeVisible();
  await expect(body.getByRole("listitem")).toHaveText([
    "first item",
    "second item",
  ]);
  await expect(body.getByText("A plain paragraph.")).toBeVisible();

  // Opening it for editing and leaving changes nothing.
  await startEditing(page);
  await expect(saveState(page)).toHaveCount(0);
  await page.locator(".bar").getByRole("button", { name: "Done" }).click();
  expect(await storedBody(page)).toEqual(saved);
});

test("blocks of a disabled plugin stay as placeholders and survive a save", async ({
  page,
}) => {
  const spacePath = await openNewSpace(page);
  await newPage(page);
  await typeBasicBlocks(page);
  await save(page);
  const before = (await storedBody(page)) as StoredBlock;
  const [heading, list] = before.content ?? [];
  expect(heading?.type).toBe("commonmark.heading");
  expect(list?.type).toBe("commonmark.list");

  await setSpacePlugin(page, spacePath, COMMONMARK, "off");
  await openPageFromTree(page, "Untitled");
  const body = editorBody(page);
  const placeholders = body.locator(".docleus-passthrough-block");
  await expect(placeholders).toHaveCount(2);
  await expect(placeholders.first()).toHaveAttribute(
    "data-block-type",
    "commonmark.heading",
  );
  await expect(placeholders.nth(1)).toHaveAttribute(
    "data-block-type",
    "commonmark.list",
  );
  await expect(body.getByRole("heading")).toHaveCount(0);

  await body.getByText("A plain paragraph.").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Edited.");
  await save(page);

  const after = (await storedBody(page)) as StoredBlock;
  expect(after.content?.[0]).toEqual(heading);
  expect(after.content?.[1]).toEqual(list);
  expect(JSON.stringify(after.content?.[2])).toContain(
    "A plain paragraph. Edited.",
  );

  await setSpacePlugin(page, spacePath, COMMONMARK, "inherit");
  await openPageFromTree(page, "Untitled");
  await expect(body.locator(".docleus-passthrough-block")).toHaveCount(0);
  await expect(
    body.getByRole("heading", { name: "Getting started" }),
  ).toBeVisible();
  await expect(body.getByRole("listitem")).toHaveText([
    "first item",
    "second item",
  ]);
  await expect(body.getByText("A plain paragraph. Edited.")).toBeVisible();
});

test("a page that starts with a placeholder opens with a text cursor", async ({
  page,
}) => {
  const spacePath = await openNewSpace(page);
  await newPage(page);
  await typeBasicBlocks(page);
  await save(page);
  const before = (await storedBody(page)) as StoredBlock;

  await setSpacePlugin(page, spacePath, COMMONMARK, "off");
  await openPageFromTree(page, "Untitled");
  const body = editorBody(page);
  const placeholders = body.locator(".docleus-passthrough-block");
  await expect(placeholders).toHaveCount(2);
  // The page opens with a text cursor, not with the first block selected.
  await expect(placeholders.first()).not.toHaveClass(
    /ProseMirror-selectednode/,
    { timeout: 1000 },
  );
  await body.focus();
  await page.keyboard.type("Intro. ");
  await expect(body.locator(".docleus-passthrough-block")).toHaveCount(2);
  await save(page);

  const after = (await storedBody(page)) as StoredBlock;
  expect(after.content?.slice(0, 2)).toEqual(before.content?.slice(0, 2));
  expect(JSON.stringify(after.content?.[2])).toContain(
    "Intro. A plain paragraph.",
  );
});

test("task items and table rows are edited where the cursor is", async ({
  page,
}) => {
  await openNewSpace(page);
  await newPage(page);
  const body = editorBody(page);
  await body.click();
  await page.keyboard.type("- [ ] Write docs");
  await expect(body.getByRole("checkbox", { name: "Done" })).not.toBeChecked();
  await expect(body.getByRole("listitem")).toHaveText(["Write docs"]);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  await page.keyboard.type("/table");
  await page.keyboard.press("Enter");
  const cells = body.getByRole("cell");
  await expect(cells).toHaveCount(4);
  await cells.nth(1).click();
  await page.keyboard.type("B1");
  const settings = page.getByRole("group", { name: "Table" });
  await settings.getByRole("button", { name: "Add row below" }).click();
  await expect(cells).toHaveCount(6);
  await page.keyboard.type("B2");
  await expect(body.getByRole("row").nth(1)).toHaveText("B2");
  await settings.getByRole("button", { name: "Add column right" }).click();
  await expect(cells).toHaveCount(9);
  await page.keyboard.type("C2");

  const rows = body.getByRole("row");
  await rows.nth(0).getByRole("cell").nth(0).click();
  await settings.getByRole("button", { name: "Add row above" }).click();
  await expect(cells).toHaveCount(12);
  await page.keyboard.type("A0");
  await expect(rows.nth(0)).toHaveText("A0");
  await expect(rows.nth(1)).toHaveText("B1");
  await settings.getByRole("button", { name: "Add column left" }).click();
  await expect(cells).toHaveCount(16);
  await page.keyboard.type("Z0");
  await expect(rows.nth(0).getByRole("cell")).toHaveText(["Z0", "A0", "", ""]);
  await expect(rows.nth(2).getByRole("cell")).toHaveText(["", "", "B2", "C2"]);

  await rows.nth(1).getByRole("cell").nth(2).click();
  await settings.getByRole("button", { name: "Remove row" }).click();
  await expect(cells).toHaveCount(12);
  await expect(body).not.toContainText("B1");
  await rows.nth(1).getByRole("cell").nth(3).click();
  await settings.getByRole("button", { name: "Remove column" }).click();
  await expect(cells).toHaveCount(9);
  await expect(body).not.toContainText("C2");
  await save(page);

  const stored = JSON.stringify(await storedBody(page));
  expect(stored).toContain('"checked":false');
  expect(stored).toContain("Write docs");
});

test("the page tree creates, renames, nests and deletes pages", async ({
  page,
}) => {
  await openNewSpace(page);
  const tree = page.getByRole("navigation", { name: "Pages" });
  await newPage(page);
  await renamePage(page, "Untitled", "Guide");
  await expect(
    page.getByRole("heading", { level: 1, name: "Guide" }),
  ).toBeVisible();

  await newPage(page);
  await renamePage(page, "Untitled", "Install");
  await treeAction(page, "Install", "Move to…");
  const move = page.getByRole("dialog", { name: "Move “Install”" });
  await move.getByRole("option", { name: "Guide" }).click();
  await expect(move).toHaveCount(0);
  await expect(tree.locator('.trow[style*="--d: 1"]')).toHaveText(/Install/);

  await treeAction(page, "Guide", "Delete");
  await expect(tree.getByRole("link")).toHaveCount(0);
  // Deleting runs at once and offers Undo, which brings the pages back.
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(
    tree.getByRole("link", { name: "Guide", exact: true }),
  ).toBeVisible();
  await expect(
    tree.getByRole("link", { name: "Install", exact: true }),
  ).toBeVisible();
});

test("the selection toolbar formats text and the block menu turns blocks", async ({
  page,
}) => {
  await openNewSpace(page);
  await newPage(page);
  const body = editorBody(page);
  await body.click();
  await page.keyboard.type("Make this bold");
  await body
    .getByText("Make this bold", { exact: true })
    .click({ clickCount: 3 });
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("Make this bold");
  const toolbar = page.getByRole("toolbar", { name: "Formatting" });
  await toolbar.getByRole("button", { name: "Bold" }).click();
  await expect(body.locator("strong")).toHaveText("Make this bold");

  await body.getByText("Make this bold").click();
  await page.keyboard.press("End");
  await body.getByText("Make this bold").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Turn into" }).click();
  await page.getByRole("menuitem", { name: "Heading 2", exact: true }).click();
  await expect(body.getByRole("heading")).toHaveText("Make this bold");
  await save(page);
  expect(JSON.stringify(await storedBody(page))).toContain(
    "commonmark.heading",
  );
});
