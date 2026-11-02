import { BLOCK_ID_ATTR, Context } from "@docleus/sdk";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorHandle } from "./handle.ts";
import { createEditorRegistry } from "./registry.ts";
import { buildExtensions } from "./schema.ts";
import { blockOf } from "./tree.ts";

const editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function setup(text = "") {
  const registry = createEditorRegistry(new Context());
  registry.registerBlock({
    type: "acme.heading",
    version: 1,
    content: "inline",
    attrs: { depth: 1 },
  });
  registry.registerBlock({ type: "acme.quote", version: 1, content: "blocks" });
  registry.registerBlock({ type: "acme.rule", version: 1, content: "atom" });
  registry.registerInline({ type: "acme.mention", attrs: { user: null } });
  const editor = new Editor({
    extensions: buildExtensions(registry.snapshot()),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          ...(text && { content: [{ type: "text", text }] }),
        },
      ],
    },
  });
  editors.push(editor);
  return { editor, handle: createEditorHandle(editor) };
}

const topTypes = (editor: Editor) => {
  const types: string[] = [];
  editor.state.doc.forEach((node) => types.push(node.type.name));
  return types;
};

describe("createEditorHandle", () => {
  it("sets blocks by block type", () => {
    const { editor, handle } = setup("Title");
    expect(handle.setBlock("acme.heading", { depth: 2 })).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe("acme_heading");
    expect(editor.state.doc.child(0).attrs.depth).toBe(2);
    expect(handle.isActive("acme.heading", { depth: 2 })).toBe(true);
    expect(handle.isActive("acme.missing")).toBe(false);
  });

  it("wraps in container blocks", () => {
    const { editor, handle } = setup("Quote");
    expect(handle.wrapIn("acme.quote")).toBe(true);
    expect(topTypes(editor)).toEqual(["acme_quote"]);
  });

  it("toggles marks", () => {
    const { editor, handle } = setup("bold");
    editor.commands.selectAll();
    expect(handle.toggleMark("bold")).toBe(true);
    expect(handle.isActive("bold")).toBe(true);
    expect(handle.toggleMark("acme.missing")).toBe(false);
  });

  it("replaces an empty paragraph when inserting a block", () => {
    const { editor, handle } = setup();
    expect(handle.insertBlock("acme.rule")).toBe(true);
    expect(topTypes(editor)[0]).toBe("acme_rule");
    expect(topTypes(editor)).not.toContain("paragraph");
  });

  it("inserts a block after the current one", () => {
    const { editor, handle } = setup("text");
    expect(handle.insertBlock("acme.heading", { depth: 3 }, "New")).toBe(true);
    expect(topTypes(editor)).toEqual(["paragraph", "acme_heading"]);
    expect(editor.state.doc.child(1).textContent).toBe("New");
  });

  it("inserts inline nodes", () => {
    const { editor, handle } = setup("Hi ");
    editor.commands.focus("end");
    expect(handle.insertInline("acme.mention", { user: "u1" })).toBe(true);
    const last = editor.state.doc.child(0).lastChild;
    expect(last?.type.name).toBe("acme_mention");
    expect(last?.attrs.user).toBe("u1");
  });

  it("inserts block trees with fresh ids, keeping unknown blocks", () => {
    const { editor, handle } = setup("text");
    const tree = {
      id: "",
      type: "acme.quote",
      v: 1,
      attrs: {},
      content: [
        {
          id: "",
          type: "paragraph",
          v: 1,
          attrs: {},
          inline: [{ type: "text", text: "Q" }],
        },
        { id: "", type: "acme.unknown", v: 2, attrs: { a: 1 } },
      ],
    };
    expect(handle.insertTree(tree)).toBe(true);
    expect(topTypes(editor)).toEqual(["paragraph", "acme_quote"]);
    const quote = blockOf(editor.state.doc.child(1));
    expect(quote?.content?.map((child) => child.type)).toEqual([
      "paragraph",
      "acme.unknown",
    ]);
    const ids = [quote?.id, ...(quote?.content ?? []).map((c) => c.id)];
    expect(ids.every((id) => typeof id === "string" && id !== "")).toBe(true);
    expect(new Set(ids).size).toBe(3);
    expect(quote?.content?.[1]).toMatchObject({ v: 2, attrs: { a: 1 } });
  });

  it("updates the attrs of the innermost selected block", () => {
    const { editor, handle } = setup("Title");
    handle.setBlock("acme.heading", { depth: 1 });
    const id: unknown = editor.state.doc.child(0).attrs[BLOCK_ID_ATTR];
    expect(handle.updateBlock("acme.heading", { depth: 4 })).toBe(true);
    expect(editor.state.doc.child(0).attrs).toMatchObject({
      depth: 4,
      [BLOCK_ID_ATTR]: id,
    });
    expect(handle.updateBlock("acme.quote", { x: 1 })).toBe(false);
  });

  it("refuses unknown types", () => {
    const { handle } = setup();
    expect(handle.setBlock("acme.missing")).toBe(false);
    expect(handle.insertBlock("acme.missing")).toBe(false);
    expect(handle.insertInline("acme.missing")).toBe(false);
    expect(handle.updateBlock("acme.missing", {})).toBe(false);
  });
});
