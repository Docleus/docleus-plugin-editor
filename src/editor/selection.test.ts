import { Context, toEditorDocument, type BlockNode } from "@docleus/sdk";
import { getSchema } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { Node as PmNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { createEditorRegistry } from "./registry.ts";
import { buildExtensions } from "./schema.ts";
import { initialSelection } from "./selection.ts";
import { schemaInfo } from "./tree.ts";

const schema = getSchema(
  buildExtensions(createEditorRegistry(new Context()).snapshot()),
);

const block = (
  id: string,
  type: string,
  rest: Partial<BlockNode> = {},
): BlockNode => ({ id, type, v: 1, attrs: {}, ...rest });

const docOf = (...content: BlockNode[]): PmNode =>
  PmNode.fromJSON(
    schema,
    toEditorDocument(block("root", "doc", { content }), schemaInfo(schema)),
  );

describe("initialSelection", () => {
  it("puts the cursor in the first text block after leading placeholders", () => {
    const doc = docOf(
      block("a", "acme.unknown"),
      block("p", "paragraph", { inline: [{ type: "text", text: "Hi" }] }),
    );
    const selection = initialSelection(doc);
    expect(selection).toBeInstanceOf(TextSelection);
    expect(selection.$from.parent.textContent).toBe("Hi");
    expect(selection.$from.parentOffset).toBe(0);
  });

  it("keeps the default cursor of a document that starts with text", () => {
    const doc = docOf(block("p", "paragraph"));
    expect(initialSelection(doc).from).toBe(1);
  });

  it("uses a gap cursor when no block holds text", () => {
    const doc = docOf(block("a", "acme.unknown"));
    const selection = initialSelection(doc);
    expect(selection).toBeInstanceOf(GapCursor);
    expect(selection.from).toBe(0);
  });
});
