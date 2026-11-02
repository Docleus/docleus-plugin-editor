import type { EditorSlashItem } from "@docleus/sdk";
import type { EditorState } from "@tiptap/pm/state";

export interface SlashQuery {
  readonly query: string;
  /** The `/query` text, removed before an item runs. */
  readonly from: number;
  readonly to: number;
}

const TRIGGER = /(?:^|\s)\/([\w-]*)$/;

/** The `/query` the cursor sits right after, if any. */
export function slashQueryOf(state: EditorState): SlashQuery | undefined {
  const { selection } = state;
  if (!selection.empty) return undefined;
  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) {
    return undefined;
  }
  const before = $from.parent.textBetween(
    0,
    $from.parentOffset,
    undefined,
    "￼",
  );
  const match = TRIGGER.exec(before);
  if (!match) return undefined;
  const query = match[1] ?? "";
  return { query, from: $from.pos - query.length - 1, to: $from.pos };
}

/** Items whose label or keywords start with a word of `query`. */
export function filterSlashItems(
  items: readonly EditorSlashItem[],
  query: string,
): EditorSlashItem[] {
  const needle = query.toLowerCase();
  if (needle === "") return [...items];
  return items.filter((item) =>
    [item.label, ...(item.keywords ?? [])].some((word) =>
      word
        .toLowerCase()
        .split(/\s+/)
        .some((part) => part.startsWith(needle)),
    ),
  );
}
