import type {
  BlockSettingsProps,
  EditorHandle,
  UiComponent,
} from "@docleus/sdk";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { selectedBlockOf } from "./selected-block.ts";
import { selectionAt } from "./selection.ts";
import { blockOf, editorJsonOf } from "./tree.ts";
import { asComponent, blockAttrs } from "./views.tsx";

/** The settings panel of the selected block, when its type has one. */
export function SettingsPanel(props: {
  readonly editor: Editor;
  readonly handle: EditorHandle;
  readonly panels: ReadonlyMap<string, UiComponent<BlockSettingsProps>>;
}) {
  const { editor, handle, panels } = props;
  const selected = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current.isEditable ? selectedBlockOf(current.state, panels) : undefined,
    equalityFn: (a, b) =>
      a?.pos === b?.pos &&
      a?.node === b?.node &&
      a?.settings === b?.settings &&
      a?.offset === b?.offset &&
      a?.path.join() === b?.path.join(),
  });
  if (!selected) return null;
  const Panel = asComponent(selected.settings);
  const { pos, node, path, offset } = selected;
  return (
    <aside className="docleus-block-settings" aria-label="Block settings">
      <Panel
        type={selected.type}
        attrs={blockAttrs(selected.node.attrs)}
        editor={handle}
        block={node.isInline ? undefined : blockOf(node)}
        path={path}
        updateAttrs={(patch) => {
          const current = editor.state.doc.nodeAt(pos);
          if (!current) return;
          editor
            .chain()
            .command(({ tr }) => {
              tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...patch });
              return true;
            })
            .run();
        }}
        replaceBlock={(block, target = path) => {
          const current = editor.state.doc.nodeAt(pos);
          if (!current || current.isInline) return;
          editor
            .chain()
            .insertContentAt(
              { from: pos, to: pos + current.nodeSize },
              editorJsonOf(editor.schema, block),
            )
            .command(({ tr }) => {
              const selection = selectionAt(tr.doc, pos, target, offset);
              if (selection) tr.setSelection(selection);
              return true;
            })
            .run();
          // The panel's buttons take focus; give it back so typing continues.
          editor.view.focus();
        }}
      />
    </aside>
  );
}
