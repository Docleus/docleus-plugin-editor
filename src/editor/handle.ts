import { editorNodeName, type EditorHandle } from "@docleus/sdk";
import type { Editor, JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { editorJsonOf } from "./tree.ts";

type Attrs = Readonly<Record<string, unknown>>;

function hasType(editor: Editor, name: string): boolean {
  return (
    editor.schema.nodes[name] !== undefined ||
    editor.schema.marks[name] !== undefined
  );
}

/** Replaces an empty paragraph at the selection, or inserts after the top-level block. */
function insertAfterSelection(editor: Editor, json: JSONContent): boolean {
  const { $to } = editor.state.selection;
  const isEmptyParagraph =
    $to.parent.type.name === "paragraph" && $to.parent.content.size === 0;
  if (isEmptyParagraph && $to.depth > 0) {
    const from = $to.before();
    return editor
      .chain()
      .focus()
      .insertContentAt({ from, to: from + $to.parent.nodeSize }, json)
      .run();
  }
  const at = $to.depth > 0 ? $to.after(1) : $to.pos;
  return editor.chain().focus().insertContentAt(at, json).run();
}

/** The position of the innermost selected node named `name`. */
function selectedPosOf(editor: Editor, name: string): number | undefined {
  const { selection } = editor.state;
  if (selection instanceof NodeSelection && selection.node.type.name === name) {
    return selection.from;
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === name) return $from.before(depth);
  }
  return undefined;
}

/** The `EditorHandle` of a Tiptap editor. */
export function createEditorHandle(editor: Editor): EditorHandle {
  return {
    isActive(type, attrs) {
      const name = editorNodeName(type);
      return hasType(editor, name) && editor.isActive(name, attrs ?? {});
    },
    toggleMark(type, attrs) {
      const name = editorNodeName(type);
      if (!editor.schema.marks[name]) return false;
      return editor
        .chain()
        .focus()
        .toggleMark(name, { ...attrs })
        .run();
    },
    setBlock(type, attrs) {
      const name = editorNodeName(type);
      if (!editor.schema.nodes[name]) return false;
      return editor
        .chain()
        .focus()
        .setNode(name, { ...attrs })
        .run();
    },
    wrapIn(type, attrs) {
      const name = editorNodeName(type);
      if (!editor.schema.nodes[name]) return false;
      return editor
        .chain()
        .focus()
        .wrapIn(name, { ...attrs })
        .run();
    },
    insertBlock(type, attrs?: Attrs, text?: string) {
      const nodeType = editor.schema.nodes[editorNodeName(type)];
      if (!nodeType) return false;
      const node = text
        ? nodeType.createChecked({ ...attrs }, editor.schema.text(text))
        : nodeType.createAndFill({ ...attrs });
      if (!node) return false;
      return insertAfterSelection(editor, node.toJSON() as JSONContent);
    },
    insertTree(block) {
      return insertAfterSelection(editor, editorJsonOf(editor.schema, block));
    },
    updateBlock(type, patch) {
      const pos = selectedPosOf(editor, editorNodeName(type));
      const node = pos === undefined ? null : editor.state.doc.nodeAt(pos);
      if (pos === undefined || !node) return false;
      return editor
        .chain()
        .command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch });
          return true;
        })
        .run();
    },
    insertInline(type, attrs) {
      const name = editorNodeName(type);
      if (!editor.schema.nodes[name]) return false;
      return editor
        .chain()
        .focus()
        .insertContent({ type: name, attrs: { ...attrs } })
        .run();
    },
    focus() {
      editor.commands.focus();
    },
    unstable_tiptap: editor,
  };
}
