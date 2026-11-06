import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { yCursorPluginKey } from "@tiptap/y-tiptap";

/** Keeps a pending native text selection when remote carets redraw the view. */
export function collaborationSelectionPlugin(): Plugin {
  let view: EditorView | undefined;
  return new Plugin({
    key: new PluginKey("docleusCollaborationSelection"),
    view(editorView) {
      view = editorView;
      return {
        destroy: () => {
          view = undefined;
        },
      };
    },
    appendTransaction(transactions, _previous, state) {
      if (
        !view?.hasFocus() ||
        view.composing ||
        !(state.selection instanceof TextSelection) ||
        transactions.some((tr) => tr.docChanged || tr.selectionSet) ||
        !transactions.some((tr) => tr.getMeta(yCursorPluginKey))
      )
        return null;

      // Awareness can arrive after a native click but before selectionchange.
      const dom = view.dom.ownerDocument.getSelection();
      if (
        !dom?.anchorNode ||
        !dom.focusNode ||
        !view.dom.contains(dom.anchorNode) ||
        !view.dom.contains(dom.focusNode)
      )
        return null;
      const anchor = view.posAtDOM(dom.anchorNode, dom.anchorOffset);
      const head = view.posAtDOM(dom.focusNode, dom.focusOffset);
      if (
        !state.doc.resolve(anchor).parent.inlineContent ||
        !state.doc.resolve(head).parent.inlineContent
      )
        return null;
      const selection = TextSelection.create(state.doc, anchor, head);
      return selection.eq(state.selection)
        ? null
        : state.tr.setSelection(selection).setMeta("addToHistory", false);
    },
  });
}
