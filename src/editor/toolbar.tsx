import type { EditorHandle, EditorToolbarItem } from "@docleus/sdk";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";

function groupsOf(items: readonly EditorToolbarItem[]): EditorToolbarItem[][] {
  const groups = new Map<string, EditorToolbarItem[]>();
  for (const item of items) {
    const key = item.group ?? "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()];
}

interface Place {
  readonly left: number;
  readonly top: number;
}

/**
 * The toolbar items over a text selection, like a letterform proof mark:
 * it appears when text is selected and goes away with the selection.
 */
export function SelectionToolbar(props: {
  readonly editor: Editor;
  readonly handle: EditorHandle;
  readonly items: readonly EditorToolbarItem[];
}) {
  const { editor } = props;
  const place = useEditorState({
    editor,
    selector: ({ editor: current }): Place | undefined => {
      const { selection } = current.state;
      if (!current.isEditable || !current.isFocused || selection.empty) {
        return undefined;
      }
      if (!selection.$from.parent.isTextblock) return undefined;
      if (selection.$from.parent.type.spec.code) return undefined;
      const start = current.view.coordsAtPos(selection.from);
      const end = current.view.coordsAtPos(selection.to);
      const box = current.view.dom.getBoundingClientRect();
      return {
        left:
          (Math.min(start.left, end.left) + Math.max(start.right, end.right)) /
            2 -
          box.left,
        top: Math.min(start.top, end.top) - box.top,
      };
    },
    equalityFn: (a, b) => a?.left === b?.left && a?.top === b?.top,
  });
  // Re-render on every transaction so active marks stay current.
  useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber,
  });
  if (!place || props.items.length === 0) return null;
  return (
    <div
      className="docleus-toolbar"
      role="toolbar"
      aria-label="Formatting"
      style={{ left: place.left, top: place.top }}
      // Keep the editor selection while clicking.
      onMouseDown={(event) => event.preventDefault()}
    >
      {groupsOf(props.items).map((group, i) => (
        <div className="docleus-toolbar-group" key={group[0]?.id ?? i}>
          {group.map((item) => {
            const isActive = item.isActive?.(props.handle) ?? false;
            return (
              <button
                key={item.id}
                type="button"
                className={isActive ? "is-active" : undefined}
                aria-pressed={item.isActive ? isActive : undefined}
                aria-label={item.label}
                title={item.label}
                data-item={item.id}
                onClick={() => item.run(props.handle)}
              >
                {SHORT_LABELS[item.id] ?? item.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Letterforms for the core marks; other items show their label. */
const SHORT_LABELS: Readonly<Record<string, string>> = {
  "core.bold": "B",
  "core.italic": "I",
  "core.strike": "S",
  "core.code": "‹›",
};
