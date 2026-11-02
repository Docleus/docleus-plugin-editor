import { Context, type EditorSlashItem } from "@docleus/sdk";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorRegistry } from "./registry.ts";
import { buildExtensions } from "./schema.ts";
import { filterSlashItems, slashQueryOf } from "./slash.ts";

const run = () => {};

const editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function editorWith(text: string): Editor {
  const registry = createEditorRegistry(new Context());
  registry.registerBlock({
    type: "acme.code",
    version: 1,
    content: "inline",
    isCode: true,
  });
  const editor = new Editor({
    extensions: buildExtensions(registry.snapshot()),
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
  editors.push(editor);
  editor.commands.insertContent(text);
  return editor;
}

describe("slashQueryOf", () => {
  it("finds the query before the cursor", () => {
    const editor = editorWith("Hello /hea");
    expect(slashQueryOf(editor.state)).toEqual({
      query: "hea",
      from: 7,
      to: 11,
    });
  });

  it("needs a slash at a word start", () => {
    expect(slashQueryOf(editorWith("/").state)?.query).toBe("");
    expect(slashQueryOf(editorWith("a/b").state)).toBeUndefined();
    expect(slashQueryOf(editorWith("/a b").state)).toBeUndefined();
  });

  it("ignores code blocks", () => {
    const editor = editorWith("/x");
    editor.commands.setNode("acme_code");
    expect(slashQueryOf(editor.state)).toBeUndefined();
  });
});

describe("filterSlashItems", () => {
  const items: EditorSlashItem[] = [
    { id: "h", label: "Heading 1", keywords: ["title"], run },
    { id: "t", label: "Table", run },
    { id: "q", label: "Quote", keywords: ["blockquote"], run },
  ];
  const ids = (query: string) =>
    filterSlashItems(items, query).map((item) => item.id);

  it("matches word prefixes of labels and keywords", () => {
    expect(ids("")).toEqual(["h", "t", "q"]);
    expect(ids("t")).toEqual(["h", "t"]);
    expect(ids("1")).toEqual(["h"]);
    expect(ids("BLOCK")).toEqual(["q"]);
    expect(ids("able")).toEqual([]);
  });
});
