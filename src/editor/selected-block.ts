import {
  blockTypeOf,
  type BlockSettingsProps,
  type UiComponent,
} from "@docleus/sdk";
import type { Node as PmNode } from "@tiptap/pm/model";
import { NodeSelection, type EditorState } from "@tiptap/pm/state";

export interface SelectedBlock {
  readonly type: string;
  readonly node: PmNode;
  readonly pos: number;
  /** Child indexes from the block to the selected block or textblock. */
  readonly path: readonly number[];
  /** The cursor's offset in its textblock. */
  readonly offset: number;
  readonly settings: UiComponent<BlockSettingsProps>;
}

/**
 * The innermost selected node with a settings panel: the selected node
 * itself, or the closest ancestor of the cursor.
 */
export function selectedBlockOf(
  state: EditorState,
  settings: ReadonlyMap<string, UiComponent<BlockSettingsProps>>,
): SelectedBlock | undefined {
  const { selection } = state;
  const { $from } = selection;
  const isBlockSelected =
    selection instanceof NodeSelection && !selection.node.isInline;
  const found = (
    node: PmNode,
    pos: number,
    path: readonly number[],
  ): SelectedBlock | undefined => {
    const panel = settings.get(node.type.name);
    return (
      panel && {
        type: blockTypeOf(node.type.name),
        node,
        pos,
        path,
        offset: isBlockSelected ? 0 : $from.parentOffset,
        settings: panel,
      }
    );
  };
  if (selection instanceof NodeSelection) {
    const selected = found(selection.node, selection.from, []);
    if (selected) return selected;
  }
  const end = isBlockSelected ? $from.depth + 1 : $from.depth;
  for (let depth = $from.depth; depth > 0; depth--) {
    const path: number[] = [];
    for (let level = depth; level < end; level++) path.push($from.index(level));
    const selected = found($from.node(depth), $from.before(depth), path);
    if (selected) return selected;
  }
  return undefined;
}
