import {
  BLOCK_ID_ATTR,
  type EditorHandle,
  type EditorSlashItem,
} from "@docleus/sdk";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";

export interface BlockMenuControl {
  /** Opens the menu for the block under a right-click; returns whether it did. */
  open(event: MouseEvent): boolean;
}

interface Open {
  readonly pos: number;
  readonly left: number;
  readonly top: number;
  readonly isTurnInto: boolean;
}

/** The top-level block at `pos`: its start and node. */
function topBlockAt(editor: Editor, pos: number) {
  const $pos = editor.state.doc.resolve(pos);
  if ($pos.depth === 0) {
    const node = editor.state.doc.nodeAt(pos);
    return node ? { from: pos, node } : undefined;
  }
  const from = $pos.before(1);
  const node = editor.state.doc.nodeAt(from);
  return node ? { from, node } : undefined;
}

/**
 * The block menu: right-click a block for Turn into, Duplicate, Move up,
 * Move down and Delete. Blocks have no visible handle; this menu and the
 * slash menu are how they are changed (docs/decisions/0013 in core).
 */
export function BlockMenu(props: {
  readonly ref: Ref<BlockMenuControl>;
  readonly editor: Editor;
  readonly handle: EditorHandle;
  readonly items: readonly EditorSlashItem[];
}) {
  const { editor } = props;
  const [open, setOpen] = useState<Open | undefined>();
  const menu = useRef<HTMLDivElement>(null);

  useImperativeHandle(props.ref, () => ({
    open(event) {
      if (!editor.isEditable) return false;
      const found = editor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });
      if (!found) return false;
      // Keep the native menu over selected text, for copy and paste.
      const { from, to, empty } = editor.state.selection;
      if (!empty && found.pos >= from && found.pos <= to) return false;
      event.preventDefault();
      const block = topBlockAt(editor, found.pos);
      if (!block) return false;
      const box = editor.view.dom.getBoundingClientRect();
      editor
        .chain()
        .setTextSelection(Math.min(found.pos, editor.state.doc.content.size))
        .run();
      setOpen({
        pos: block.from,
        left: event.clientX - box.left,
        top: event.clientY - box.top,
        isTurnInto: false,
      });
      return true;
    },
  }));

  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelector<HTMLElement>("button")?.focus();
    const onDown = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(undefined);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(undefined);
        editor.commands.focus();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const buttons = [
          ...(menu.current?.querySelectorAll<HTMLElement>("button") ?? []),
        ];
        const index = buttons.indexOf(document.activeElement as HTMLElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        buttons[(index + step + buttons.length) % buttons.length]?.focus();
        event.preventDefault();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, editor]);

  if (!open) return null;
  const block = editor.state.doc.nodeAt(open.pos);
  if (!block) return null;
  const close = () => {
    setOpen(undefined);
    editor.commands.focus();
  };
  const select = () => {
    const inside = Math.min(open.pos + 1, editor.state.doc.content.size);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.near(editor.state.doc.resolve(inside)),
      ),
    );
  };
  const duplicate = () => {
    const copy = block.toJSON() as Record<string, unknown>;
    editor
      .chain()
      .insertContentAt(open.pos + block.nodeSize, stripIds(copy))
      .run();
    close();
  };
  const move = (step: -1 | 1) => {
    const { doc } = editor.state;
    const $pos = doc.resolve(open.pos);
    const index = $pos.index(0);
    const neighbour = doc.maybeChild(index + step);
    if (!neighbour) return close();
    const tr = editor.state.tr.delete(open.pos, open.pos + block.nodeSize);
    const target =
      step === 1
        ? open.pos + neighbour.nodeSize
        : open.pos - neighbour.nodeSize;
    tr.insert(target, block);
    tr.setSelection(TextSelection.near(tr.doc.resolve(target + 1)));
    editor.view.dispatch(tr.scrollIntoView());
    close();
  };
  const remove = () => {
    editor
      .chain()
      .deleteRange({ from: open.pos, to: open.pos + block.nodeSize })
      .run();
    close();
  };

  return (
    <div
      ref={menu}
      className="docleus-block-menu"
      role="menu"
      aria-label={open.isTurnInto ? "Turn into" : "Block actions"}
      style={{ left: open.left, top: open.top }}
    >
      {open.isTurnInto ? (
        props.items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            onClick={() => {
              select();
              item.run(props.handle);
              close();
            }}
          >
            {item.label}
          </button>
        ))
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            onClick={() => setOpen({ ...open, isTurnInto: true })}
          >
            Turn into<span className="k">›</span>
          </button>
          <button type="button" role="menuitem" onClick={duplicate}>
            Duplicate
          </button>
          <button type="button" role="menuitem" onClick={() => move(-1)}>
            Move up
          </button>
          <button type="button" role="menuitem" onClick={() => move(1)}>
            Move down
          </button>
          <hr />
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            onClick={remove}
          >
            Delete
          </button>
        </>
      )}
    </div>
  );
}

/** A block's JSON without ids, so the editor gives the copy fresh ones. */
function stripIds(json: Record<string, unknown>): Record<string, unknown> {
  const attrs = json.attrs as Record<string, unknown> | undefined;
  const content = json.content as Record<string, unknown>[] | undefined;
  return {
    ...json,
    ...(attrs && { attrs: { ...attrs, [BLOCK_ID_ATTR]: null } }),
    ...(content && { content: content.map(stripIds) }),
  };
}
