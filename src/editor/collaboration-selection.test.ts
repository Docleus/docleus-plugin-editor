import { Context } from "@docleus/sdk";
import { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { yCursorPluginKey } from "@tiptap/y-tiptap";
import { afterEach, describe, expect, it } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { createEditorRegistry } from "./registry.ts";
import { buildExtensions } from "./schema.ts";

const cleanup: (() => void)[] = [];

afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose();
});

function open() {
  const document = new Y.Doc();
  const awareness = new Awareness(document);
  const fragment = document.getXmlFragment("body");
  for (const text of ["First", "Second"]) {
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.insert(0, [new Y.XmlText(text)]);
    fragment.push([paragraph]);
  }
  cleanup.push(
    () => document.destroy(),
    () => awareness.destroy(),
  );
  const element = window.document.createElement("div");
  window.document.body.append(element);
  cleanup.push(() => element.remove());
  const editor = new Editor({
    element,
    extensions: buildExtensions(
      createEditorRegistry(new Context()).snapshot(),
      {
        collaboration: {
          document,
          field: "body",
          provider: { awareness },
          user: { name: "Bob", color: "#3b82f6" },
        },
      },
    ),
  });
  cleanup.push(() => editor.destroy());
  editor.view.focus();
  return editor;
}

function pendingSelection(editor: Editor, anchor: number, head = anchor) {
  const text = editor.view.dom.querySelectorAll("p")[1]?.firstChild;
  if (!text) throw new Error("expected the second paragraph");
  // Happy DOM dispatches this synchronously; browsers queue selectionchange.
  const defer = (event: Event) => event.stopImmediatePropagation();
  window.document.addEventListener("selectionchange", defer, true);
  try {
    window.getSelection()?.setBaseAndExtent(text, anchor, text, head);
  } finally {
    window.document.removeEventListener("selectionchange", defer, true);
  }
  expect(editor.state.selection.$from.parent.textContent).toBe("First");
}

describe("collaboration selection", () => {
  it("keeps a new DOM caret when awareness arrives before selectionchange", () => {
    const editor = open();
    pendingSelection(editor, 6);
    editor.view.dispatch(
      editor.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true }),
    );
    editor.commands.insertContent(" from Bob");
    expect(editor.state.doc.child(0).textContent).toBe("First");
    expect(editor.state.doc.child(1).textContent).toBe("Second from Bob");
  });

  it("keeps the direction of a pending text range", () => {
    const editor = open();
    pendingSelection(editor, 6, 2);
    editor.view.dispatch(
      editor.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true }),
    );
    expect(editor.state.selection.anchor).toBe(14);
    expect(editor.state.selection.head).toBe(10);
    editor.commands.insertContent("!");
    expect(editor.state.doc.child(1).textContent).toBe("Se!");
  });

  it("leaves an explicit selection transaction in control", () => {
    const editor = open();
    pendingSelection(editor, 6);
    editor.view.dispatch(
      editor.state.tr
        .setSelection(TextSelection.create(editor.state.doc, 3))
        .setMeta(yCursorPluginKey, { awarenessUpdated: true }),
    );
    expect(editor.state.selection.from).toBe(3);
  });

  it("does not use a selection outside the editor", () => {
    const editor = open();
    const other = window.document.createElement("p");
    other.textContent = "Outside";
    window.document.body.append(other);
    cleanup.push(() => other.remove());
    window.getSelection()?.collapse(other.firstChild, 3);
    editor.view.dispatch(
      editor.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true }),
    );
    expect(editor.state.selection.from).toBe(1);
  });

  it("does not replace a node selection with its DOM representation", () => {
    const editor = open();
    editor.commands.setNodeSelection(0);
    editor.view.dispatch(
      editor.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true }),
    );
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.from).toBe(0);
  });

  it("does not read a pending selection during composition", () => {
    const editor = open();
    pendingSelection(editor, 6);
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
    expect(editor.view.composing).toBe(true);
    const selection = editor.state.selection;
    editor.view.dispatch(
      editor.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true }),
    );
    expect(editor.state.selection.eq(selection)).toBe(true);
    editor.view.dom.dispatchEvent(new CompositionEvent("compositionend"));
  });

  it("does not read DOM positions against a changed document", () => {
    const editor = open();
    pendingSelection(editor, 6);
    editor.view.dispatch(
      editor.state.tr
        .delete(7, 15)
        .setMeta(yCursorPluginKey, { awarenessUpdated: true }),
    );
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.selection.from).toBe(1);
  });
});
