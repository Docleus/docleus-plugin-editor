import type { EditorHandle, EditorSlashItem } from "@docleus/sdk";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useImperativeHandle, useState, type Ref } from "react";
import { filterSlashItems, slashQueryOf, type SlashQuery } from "./slash.ts";

export interface SlashMenuControl {
  /** Handles menu keys while the menu is open; returns whether it did. */
  onKeyDown(event: KeyboardEvent): boolean;
}

interface MenuState {
  readonly query: SlashQuery;
  readonly items: EditorSlashItem[];
  readonly left: number;
  readonly top: number;
}

export function SlashMenu(props: {
  readonly ref: Ref<SlashMenuControl>;
  readonly editor: Editor;
  readonly handle: EditorHandle;
  readonly items: readonly EditorSlashItem[];
}) {
  const { editor, handle, items } = props;
  const [dismissedAt, setDismissedAt] = useState<number | undefined>();
  const [active, setActive] = useState(0);

  const menu = useEditorState({
    editor,
    selector: ({ editor: current }): MenuState | undefined => {
      if (!current.isEditable || !current.isFocused) return undefined;
      const query = slashQueryOf(current.state);
      if (!query) return undefined;
      const matches = filterSlashItems(items, query.query);
      if (matches.length === 0) return undefined;
      const coords = current.view.coordsAtPos(query.from);
      const box = current.view.dom.getBoundingClientRect();
      return {
        query,
        items: matches,
        left: coords.left - box.left,
        top: coords.bottom - box.top,
      };
    },
    equalityFn: (a, b) =>
      a?.query.from === b?.query.from &&
      a?.query.query === b?.query.query &&
      a?.items.length === b?.items.length &&
      a?.left === b?.left &&
      a?.top === b?.top,
  });
  const isOpen = menu !== undefined && menu.query.from !== dismissedAt;
  const selected = isOpen ? Math.min(active, menu.items.length - 1) : 0;

  const run = (item: EditorSlashItem | undefined) => {
    if (!menu || !item) return;
    editor
      .chain()
      .focus()
      .deleteRange({ from: menu.query.from, to: menu.query.to })
      .run();
    setActive(0);
    item.run(handle);
  };

  useImperativeHandle(props.ref, () => ({
    onKeyDown(event) {
      if (!isOpen) return false;
      const count = menu.items.length;
      switch (event.key) {
        case "ArrowDown":
          setActive((selected + 1) % count);
          return true;
        case "ArrowUp":
          setActive((selected - 1 + count) % count);
          return true;
        case "Enter":
        case "Tab":
          run(menu.items[selected]);
          return true;
        case "Escape":
          setDismissedAt(menu.query.from);
          return true;
        default:
          return false;
      }
    },
  }));

  if (!isOpen) return null;
  return (
    <ul
      className="docleus-slash-menu"
      role="listbox"
      aria-label="Insert block"
      style={{ left: menu.left, top: menu.top }}
    >
      {menu.items.map((item, i) => (
        <li
          key={item.id}
          role="option"
          aria-selected={i === selected}
          className={i === selected ? "is-active" : undefined}
          data-item={item.id}
          onMouseDown={(event) => {
            event.preventDefault();
            run(item);
          }}
          onMouseEnter={() => setActive(i)}
        >
          {item.label}
        </li>
      ))}
    </ul>
  );
}
