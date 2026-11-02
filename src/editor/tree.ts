import {
  BLOCK_ID_ATTR,
  BLOCK_VERSION_ATTR,
  fromEditorDocument,
  toEditorDocument,
  type BlockNode,
  type EditorJsonNode,
  type EditorSchemaDescription,
  type EditorSchemaInfo,
} from "@docleus/sdk";
import type { JSONContent } from "@tiptap/core";
import type { Node as PmNode, Schema } from "@tiptap/pm/model";
import { createBlockId } from "./ids.ts";

const attrKeys = (spec: { attrs?: object } | undefined) =>
  spec ? new Set(Object.keys(spec.attrs ?? {})) : undefined;

/** What `schema` can show, for `toEditorDocument`. */
export function schemaInfo(schema: Schema): EditorSchemaInfo {
  return {
    nodeAttrs: (name) => attrKeys(schema.nodes[name]?.spec),
    markAttrs: (name) => attrKeys(schema.marks[name]?.spec),
  };
}

function attrDefaults(
  attrs: Readonly<Record<string, { readonly default?: unknown }>> | undefined,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(attrs ?? {}).map(([name, spec]) => [
      name,
      spec.default ?? null,
    ]),
  );
}

/** What collaboration providers learn about `schema`, in schema order. */
export function describeSchema(schema: Schema): EditorSchemaDescription {
  return {
    nodes: Object.fromEntries(
      Object.entries(schema.nodes).map(([name, type]) => [
        name,
        attrDefaults(type.spec.attrs),
      ]),
    ),
    marks: Object.fromEntries(
      Object.entries(schema.marks).map(([name, type]) => [
        name,
        attrDefaults(type.spec.attrs),
      ]),
    ),
    overlappingMarks: Object.values(schema.marks)
      .filter((type) => !type.excludes(type))
      .map((type) => type.name),
  };
}

function withIds(block: BlockNode): BlockNode {
  return {
    ...block,
    id: block.id === "" ? createBlockId() : block.id,
    ...(block.content && { content: block.content.map(withIds) }),
  };
}

/**
 * The editor JSON of a block tree; blocks the schema cannot show become
 * passthrough nodes. Empty ids get fresh ones here, since passthrough nodes
 * keep their block, children included, as one attr.
 */
export function editorJsonOf(schema: Schema, block: BlockNode): JSONContent {
  const doc = toEditorDocument(
    { id: "-", type: "doc", v: 1, attrs: {}, content: [withIds(block)] },
    schemaInfo(schema),
  );
  const [json] = doc.content ?? [];
  // Tiptap does not mutate the content it inserts.
  return json as JSONContent;
}

/** The block tree of a block node in the editor. */
export function blockOf(node: PmNode): BlockNode | undefined {
  const doc = fromEditorDocument({
    type: "doc",
    attrs: { [BLOCK_ID_ATTR]: "-", [BLOCK_VERSION_ATTR]: 1 },
    content: [node.toJSON() as EditorJsonNode],
  });
  return doc.content?.[0];
}
