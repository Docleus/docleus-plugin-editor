import type { Node as PmNode } from "@tiptap/pm/model";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";

/**
 * Where the cursor starts in a document. ProseMirror selects a leading atom,
 * such as a placeholder, which the first keystroke would replace; this is
 * the first text position instead, or a gap cursor before the first block
 * when the document has no text block.
 */
export function initialSelection(doc: PmNode): Selection {
  const start = Selection.atStart(doc);
  if (!(start instanceof NodeSelection)) return start;
  const $start = doc.resolve(0);
  return (
    TextSelection.findFrom($start, 1, true) ??
    (isGapAllowed(doc) ? new GapCursor($start) : start)
  );
}

/** A gap cursor before the first block, where Enter or typing adds a paragraph. */
function isGapAllowed(doc: PmNode): boolean {
  const paragraph = doc.type.schema.nodes.paragraph;
  return paragraph !== undefined && doc.canReplaceWith(0, 0, paragraph);
}

/**
 * The selection at child `path` of the block at `pos`, `offset` characters
 * into its text. Indexes and the offset are clamped, so the cursor stays
 * close by after the block's children change.
 */
export function selectionAt(
  doc: PmNode,
  pos: number,
  path: readonly number[],
  offset: number,
): Selection | undefined {
  let node = doc.nodeAt(pos);
  if (!node) return undefined;
  let start = pos;
  for (const index of path) {
    if (node.isTextblock || node.childCount === 0) break;
    const clamped = Math.min(Math.max(index, 0), node.childCount - 1);
    let childStart = start + 1;
    for (let i = 0; i < clamped; i++) childStart += node.child(i).nodeSize;
    node = node.child(clamped);
    start = childStart;
  }
  if (node.isTextblock) {
    const inside = Math.min(Math.max(offset, 0), node.content.size);
    return TextSelection.create(doc, start + 1 + inside);
  }
  if (NodeSelection.isSelectable(node) && node.isAtom) {
    return NodeSelection.create(doc, start);
  }
  return TextSelection.findFrom(doc.resolve(start + 1), 1, true) ?? undefined;
}
