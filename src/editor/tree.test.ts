import { Context, type BlockNode } from "@docleus/sdk";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorRegistry } from "./registry.ts";
import { buildExtensions } from "./schema.ts";
import { blockOf, describeSchema, editorJsonOf } from "./tree.ts";

const editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function editorWithQuote(): Editor {
  const registry = createEditorRegistry(new Context());
  registry.registerBlock({ type: "acme.quote", version: 1, content: "blocks" });
  const editor = new Editor({
    extensions: buildExtensions(registry.snapshot()),
  });
  editors.push(editor);
  return editor;
}

const TREE: BlockNode = {
  id: "q",
  type: "acme.quote",
  v: 1,
  attrs: {},
  content: [
    {
      id: "p",
      type: "paragraph",
      v: 1,
      attrs: {},
      inline: [{ type: "text", text: "x", marks: [{ type: "bold" }] }],
    },
    {
      id: "",
      type: "acme.unknown",
      v: 1,
      attrs: {},
      content: [{ id: "", type: "paragraph", v: 1, attrs: {} }],
    },
  ],
};

describe("editorJsonOf and blockOf", () => {
  it("round-trip a block tree, filling empty ids", () => {
    const editor = editorWithQuote();
    const node = editor.schema.nodeFromJSON(editorJsonOf(editor.schema, TREE));
    const block = blockOf(node);
    expect(block).toMatchObject({
      id: "q",
      content: [{ id: "p", inline: TREE.content?.[0]?.inline }, {}],
    });
    const unknown = block?.content?.[1];
    expect(unknown?.type).toBe("acme.unknown");
    expect(unknown?.id).not.toBe("");
    expect(unknown?.content?.[0]?.id).not.toBe("");
  });
});

describe("describeSchema", () => {
  it("lists attrs with their defaults and the marks that overlap", () => {
    const description = describeSchema(editorWithQuote().schema);
    expect(description.nodes.acme_quote).toEqual({
      blockId: null,
      blockVersion: null,
    });
    expect(description.nodes.text).toEqual({});
    expect(Object.keys(description.marks)).toEqual([
      "link",
      "strike",
      "bold",
      "italic",
      "code",
    ]);
    expect(description.marks.link).toMatchObject({ href: null });
    // Code excludes no mark, not even itself.
    expect(description.overlappingMarks).toEqual(["code"]);
  });
});
