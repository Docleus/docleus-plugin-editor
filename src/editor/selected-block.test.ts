import { Context, toEditorDocument, type BlockNode } from "@docleus/sdk";
import { getSchema } from "@tiptap/core";
import { Node as PmNode } from "@tiptap/pm/model";
import {
  EditorState,
  NodeSelection,
  TextSelection,
  type Selection,
} from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { createEditorRegistry } from "./registry.ts";
import { buildExtensions } from "./schema.ts";
import { selectedBlockOf } from "./selected-block.ts";
import { selectionAt } from "./selection.ts";
import { schemaInfo } from "./tree.ts";

const registry = createEditorRegistry(new Context());
registry.registerBlock({
  type: "acme.table",
  version: 1,
  content: "blocks",
  children: "acme_row+",
});
registry.registerBlock({
  type: "acme.row",
  version: 1,
  content: "blocks",
  group: "acmeRow",
  children: "acme_cell+",
});
registry.registerBlock({
  type: "acme.cell",
  version: 1,
  content: "inline",
  group: "acmeCell",
});
registry.registerBlock({ type: "acme.rule", version: 1, content: "atom" });
registry.registerBlock({ type: "acme.quote", version: 1, content: "blocks" });
const schema = getSchema(buildExtensions(registry.snapshot()));
const Panel = () => null;
const panels = new Map([
  ["acme_table", Panel],
  ["acme_quote", Panel],
]);

const block = (
  id: string,
  type: string,
  rest: Partial<BlockNode> = {},
): BlockNode => ({ id, type, v: 1, attrs: {}, ...rest });

const cell = (id: string, text: string) =>
  block(id, "acme.cell", { inline: [{ type: "text", text }] });

const docOf = (...content: BlockNode[]): PmNode =>
  PmNode.fromJSON(
    schema,
    toEditorDocument(block("root", "doc", { content }), schemaInfo(schema)),
  );

const table = block("t", "acme.table", {
  content: [
    block("r0", "acme.row", { content: [cell("a", "A1"), cell("b", "B1")] }),
    block("r1", "acme.row", { content: [cell("c", "A2"), cell("d", "B2")] }),
  ],
});

/** The position just inside the textblock whose text is `text`. */
function textStart(doc: PmNode, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isTextblock && node.textContent === text) {
      found = pos + 1;
    }
  });
  return found;
}

const selected = (doc: PmNode, selection: Selection) =>
  selectedBlockOf(EditorState.create({ doc, selection }), panels);

describe("selectedBlockOf", () => {
  it("gives the path from the block to the cursor's textblock", () => {
    const doc = docOf(table);
    const found = selected(
      doc,
      TextSelection.create(doc, textStart(doc, "B2") + 1),
    );
    expect(found?.type).toBe("acme.table");
    expect(found?.path).toEqual([1, 1]);
  });

  it("gives an empty path when the block itself is selected", () => {
    const doc = docOf(table);
    expect(selected(doc, NodeSelection.create(doc, 0))?.path).toEqual([]);
  });

  it("ends the path at a selected child block", () => {
    const doc = docOf(
      block("q", "acme.quote", {
        content: [block("p", "paragraph"), block("h", "acme.rule")],
      }),
    );
    const rule = doc.child(0).child(0).nodeSize + 1;
    expect(selected(doc, NodeSelection.create(doc, rule))?.path).toEqual([1]);
  });
});

describe("selectionAt", () => {
  it("puts the cursor at the same path and offset", () => {
    const doc = docOf(table);
    const selection = selectionAt(doc, 0, [1, 1], 1);
    expect(selection?.$from.parent.textContent).toBe("B2");
    expect(selection?.$from.parentOffset).toBe(1);
  });

  it("clamps indexes and offsets that no longer exist", () => {
    const doc = docOf(table);
    const selection = selectionAt(doc, 0, [5, 9], 40);
    expect(selection?.$from.parent.textContent).toBe("B2");
    expect(selection?.$from.parentOffset).toBe(2);
  });

  it("selects an atom at the path", () => {
    const doc = docOf(
      block("q", "acme.quote", {
        content: [block("p", "paragraph"), block("h", "acme.rule")],
      }),
    );
    const selection = selectionAt(doc, 0, [1], 0);
    expect(selection).toBeInstanceOf(NodeSelection);
    expect((selection as NodeSelection).node.type.name).toBe("acme_rule");
  });
});
