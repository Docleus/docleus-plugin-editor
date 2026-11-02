import {
  BLOCK_ID_ATTR,
  Context,
  fromEditorDocument,
  toEditorDocument,
  type BlockNode,
  type EditorBlockDefinition,
} from "@docleus/sdk";
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { createEditorRegistry, type EditorSnapshot } from "./registry.ts";
import { buildExtensions } from "./schema.ts";
import { schemaInfo } from "./tree.ts";

const HEADING: EditorBlockDefinition = {
  type: "acme.heading",
  version: 2,
  content: "inline",
  attrs: { depth: 1 },
  tag: (attrs) => `h${String(attrs.depth)}`,
  shortcuts: [
    {
      pattern: /^(#{1,6})\s$/,
      attrs: (match) => ({ depth: match[1]?.length }),
    },
  ],
};

const QUOTE: EditorBlockDefinition = {
  type: "acme.quote",
  version: 1,
  content: "blocks",
  tag: "blockquote",
};

function snapshotWith(
  ...blocks: readonly EditorBlockDefinition[]
): EditorSnapshot {
  const registry = createEditorRegistry(new Context());
  for (const block of blocks) registry.registerBlock(block);
  return registry.snapshot();
}

const editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function open(snapshot: EditorSnapshot, body: BlockNode): Editor {
  const extensions = buildExtensions(snapshot);
  const content = toEditorDocument(
    body,
    schemaInfo(getSchema(extensions)),
  ) as JSONContent;
  const editor = new Editor({ extensions, content });
  editors.push(editor);
  return editor;
}

const block = (
  id: string,
  type: string,
  rest: Partial<BlockNode> = {},
): BlockNode => ({ id, type, v: 1, attrs: {}, ...rest });

const BODY: BlockNode = block("root", "doc", {
  content: [
    block("h", "acme.heading", {
      v: 2,
      attrs: { depth: 2 },
      inline: [{ type: "text", text: "Title" }],
    }),
    block("p", "paragraph", {
      inline: [
        { type: "text", text: "Hello " },
        { type: "text", text: "world", marks: [{ type: "bold" }] },
        { type: "acme.mention", attrs: { user: "u1" } },
      ],
    }),
    block("q", "acme.quote", {
      content: [
        block("q1", "paragraph", { inline: [{ type: "text", text: "Q" }] }),
      ],
    }),
    block("u", "acme.unknown", {
      v: 3,
      attrs: { deep: { list: [1, 2] } },
      content: [
        block("u1", "paragraph", { inline: [{ type: "text", text: "kept" }] }),
      ],
    }),
  ],
});

describe("buildExtensions", () => {
  it("round-trips registered, core and unknown content", () => {
    const editor = open(snapshotWith(HEADING, QUOTE), BODY);
    expect(fromEditorDocument(editor.getJSON())).toEqual(BODY);
  });

  it("keeps blocks of a removed plugin as passthrough nodes", () => {
    const editor = open(snapshotWith(QUOTE), BODY);
    const types: string[] = [];
    editor.state.doc.forEach((node) => types.push(node.type.name));
    expect(types).toEqual([
      "passthroughBlock",
      "paragraph",
      "acme_quote",
      "passthroughBlock",
    ]);
    editor.commands.insertContentAt(editor.state.doc.content.size, {
      type: "paragraph",
      content: [{ type: "text", text: "new" }],
    });
    const saved = fromEditorDocument(editor.getJSON());
    expect(saved.content?.slice(0, 4)).toEqual(BODY.content);
    expect(saved.content?.[4]).toMatchObject({
      type: "paragraph",
      v: 1,
      inline: [{ type: "text", text: "new" }],
    });
  });

  it("gives new and duplicated blocks fresh ids", () => {
    const editor = open(snapshotWith(HEADING, QUOTE), BODY);
    const paragraph = editor.state.doc.child(1).toJSON() as JSONContent;
    editor.commands.insertContentAt(editor.state.doc.content.size, [
      paragraph,
      { type: "acme_heading", attrs: { depth: 3 } },
    ]);
    const saved = fromEditorDocument(editor.getJSON());
    const ids = (saved.content ?? []).map((child) => child.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, 4)).toEqual(["h", "p", "q", "u"]);
    expect(saved.content?.[5]).toMatchObject({ type: "acme.heading", v: 2 });
  });

  it("pastes passthrough content back as passthrough nodes", () => {
    const editor = open(snapshotWith(), BODY);
    const html = editor.getHTML();
    editor.commands.setContent(html);
    const saved = fromEditorDocument(editor.getJSON());
    expect(saved.content?.[3]).toMatchObject({
      type: "acme.unknown",
      attrs: { deep: { list: [1, 2] } },
      content: [{ type: "paragraph", inline: [{ text: "kept" }] }],
    });
  });

  it.each([
    [
      "block",
      `<div data-passthrough-block='${JSON.stringify({ id: "a", type: "x", v: 1, attrs: {}, content: [null] })}'><p>inside</p></div>`,
    ],
    ["block", `<div data-passthrough-block='{"id":"a"}'><p>inside</p></div>`],
    ["block", `<div data-passthrough-block="not json"><p>inside</p></div>`],
    [
      "inline",
      `<p>a<span data-passthrough-inline='{"text":1}'>inside</span></p>`,
    ],
  ])("ignores a pasted passthrough %s with malformed data", (_kind, html) => {
    const editor = open(snapshotWith(), block("root", "doc"));
    editor.commands.insertContent(html);
    const names: string[] = [];
    editor.state.doc.descendants((node) => {
      names.push(node.type.name);
    });
    expect(names).not.toContain("passthroughBlock");
    expect(names).not.toContain("passthroughInline");
    expect(editor.state.doc.textContent).toContain("inside");
    expect(() => fromEditorDocument(editor.getJSON())).not.toThrow();
  });

  it("does not render block ids into HTML", () => {
    const editor = open(snapshotWith(HEADING, QUOTE), BODY);
    expect(editor.getHTML()).not.toContain(BLOCK_ID_ATTR);
    expect(editor.getHTML()).toContain("<h2");
  });

  it("runs block shortcuts", () => {
    const editor = open(
      snapshotWith(HEADING),
      block("root", "doc", { content: [block("p", "paragraph")] }),
    );
    editor.commands.focus("start");
    for (const char of "## ") {
      const { from, to } = editor.state.selection;
      const handled = editor.view.someProp("handleTextInput", (f) =>
        f(editor.view, from, to, char, () => editor.state.tr.insertText(char)),
      );
      if (!handled) editor.commands.insertContent(char);
    }
    expect(editor.state.doc.child(0).type.name).toBe("acme_heading");
    expect(editor.state.doc.child(0).attrs.depth).toBe(2);
  });

  it("runs a container shortcut on the container the cursor is already in", () => {
    const LIST: EditorBlockDefinition = {
      type: "acme.list",
      version: 1,
      content: "blocks",
      children: "acme_item+",
      attrs: { ordered: false },
      tag: "ul",
    };
    const ITEM: EditorBlockDefinition = {
      type: "acme.item",
      version: 1,
      content: "blocks",
      group: "acmeItem",
      attrs: { checked: null },
      tag: "li",
      shortcuts: [
        {
          pattern: /^\[([ x])\]\s$/,
          attrs: (match) => ({ checked: match[1] === "x" }),
        },
      ],
    };
    const editor = open(
      snapshotWith(LIST, ITEM),
      block("root", "doc", {
        content: [
          block("p", "paragraph"),
          block("l", "acme.list", {
            content: [
              block("i", "acme.item", { content: [block("ip", "paragraph")] }),
            ],
          }),
        ],
      }),
    );
    const type = (text: string) => {
      for (const char of text) {
        const { from, to } = editor.state.selection;
        const handled = editor.view.someProp("handleTextInput", (f) =>
          f(editor.view, from, to, char, () =>
            editor.state.tr.insertText(char),
          ),
        );
        if (!handled) editor.commands.insertContent(char);
      }
    };
    // In a paragraph, the item is wrapped in the list it needs.
    editor.commands.focus("start");
    type("[ ] ");
    const first = editor.state.doc.child(0);
    expect(first.type.name).toBe("acme_list");
    expect(first.child(0).attrs.checked).toBe(false);
    // In an item, the item itself changes instead of nesting a new one.
    editor.commands.setTextSelection(editor.state.doc.content.size - 3);
    type("[x] ");
    const second = editor.state.doc.child(1);
    expect(second.child(0).attrs.checked).toBe(true);
    expect(second.child(0).child(0).type.name).toBe("paragraph");
    expect(second.child(0).child(0).textContent).toBe("");
  });

  it("runs block keys only inside the block, and inline keys anywhere", () => {
    const calls: string[] = [];
    const snapshot = snapshotWith(
      {
        ...QUOTE,
        keys: {
          "Ctrl-q": () => {
            calls.push("quote");
            return true;
          },
        },
      },
      HEADING,
    );
    const registry = createEditorRegistry(new Context());
    registry.registerInline({
      type: "acme.break",
      tag: "br",
      keys: {
        "Shift-Enter": (handle) => handle.insertInline("acme.break"),
      },
    });
    const editor = open(
      { ...snapshot, inlines: registry.snapshot().inlines },
      block("root", "doc", {
        content: [
          block("p", "paragraph", { inline: [{ type: "text", text: "a" }] }),
          block("q", "acme.quote", {
            content: [
              block("q1", "paragraph", {
                inline: [{ type: "text", text: "b" }],
              }),
            ],
          }),
        ],
      }),
    );
    const press = (key: string, init: KeyboardEventInit = {}) =>
      editor.view.someProp("handleKeyDown", (f) =>
        f(editor.view, new KeyboardEvent("keydown", { key, ...init })),
      ) === true;

    editor.commands.setTextSelection(2);
    expect(press("q", { ctrlKey: true })).toBe(false);
    expect(press("Enter", { shiftKey: true })).toBe(true);
    expect(editor.state.doc.child(0).lastChild?.type.name).toBe("acme_break");

    editor.commands.setTextSelection(editor.state.doc.content.size - 2);
    expect(press("q", { ctrlKey: true })).toBe(true);
    expect(calls).toEqual(["quote"]);
  });

  it("rejects a raw extension that is not one", () => {
    const registry = createEditorRegistry(new Context());
    registry.registerExtension({ name: "nope" });
    expect(() => buildExtensions(registry.snapshot())).toThrow(
      expect.objectContaining({ code: "editor/invalid-extension" }),
    );
  });
});

const names = (extensions: readonly { name: string }[]) =>
  extensions.map((extension) => extension.name);

describe("buildExtensions with collaboration", () => {
  it("lets Yjs own undo history only when shared", () => {
    const document = new Y.Doc();
    const shared = buildExtensions(snapshotWith(), {
      collaboration: {
        document,
        field: "default",
        provider: { awareness: new Awareness(document) },
        user: { name: "Alice", color: "#3b82f6" },
      },
    });
    expect(names(shared)).toEqual(
      expect.arrayContaining(["collaboration", "collaborationCaret"]),
    );
    expect(names(shared)).not.toContain("undoRedo");
    expect(names(buildExtensions(snapshotWith()))).toContain("undoRedo");
    expect(names(buildExtensions(snapshotWith()))).not.toContain(
      "collaboration",
    );
  });

  it("binds the editor to the shared fragment", () => {
    const document = new Y.Doc();
    const fragment = document.getXmlFragment("body");
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.insert(0, [new Y.XmlText("Shared")]);
    fragment.insert(0, [paragraph]);
    const editor = new Editor({
      extensions: buildExtensions(snapshotWith(), {
        collaboration: {
          document,
          field: "body",
          provider: { awareness: new Awareness(document) },
          user: { name: "Alice", color: "#3b82f6" },
        },
      }),
    });
    editors.push(editor);
    expect(editor.getText()).toBe("Shared");

    editor.commands.insertContentAt(editor.state.doc.content.size - 1, "!");
    expect(fragment.toString()).toContain("Shared!");
  });
});

function typeInto(editor: Editor, text: string) {
  editor.commands.focus("start");
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp("handleTextInput", (f) =>
      f(editor.view, from, to, char, () => editor.state.tr.insertText(char)),
    );
    if (!handled) editor.commands.insertContent(char);
  }
}

describe("block shortcuts that match the same text", () => {
  const CODE: EditorBlockDefinition = {
    type: "acme.code",
    version: 1,
    content: "atom",
    attrs: { lang: null },
    shortcuts: [
      {
        pattern: /^```([\w-]+)?\s$/,
        attrs: (match) => ({ lang: match[1] ?? null }),
      },
    ],
  };
  const DIAGRAM: EditorBlockDefinition = {
    type: "acme.diagram",
    version: 1,
    content: "atom",
    shortcuts: [{ pattern: /^```mermaid\s$/ }],
  };

  const empty = block("root", "doc", { content: [block("p", "paragraph")] });

  it.each([
    ["code first", [CODE, DIAGRAM]],
    ["diagram first", [DIAGRAM, CODE]],
  ])("lets the most specific pattern win, %s", (_, blocks) => {
    const diagram = open(snapshotWith(...blocks), empty);
    typeInto(diagram, "```mermaid ");
    expect(diagram.state.doc.child(0).type.name).toBe("acme_diagram");
    expect(diagram.state.doc.child(1).textContent).toBe("");

    const code = open(snapshotWith(...blocks), empty);
    typeInto(code, "```ts ");
    expect(code.state.doc.child(0).type.name).toBe("acme_code");
    expect(code.state.doc.child(0).attrs.lang).toBe("ts");
    expect(code.state.doc.childCount).toBe(2);
    expect(code.state.doc.child(1).textContent).toBe("");
  });
});

describe("block ids with collaboration", () => {
  it("leaves remote changes to their author and fixes local ones", async () => {
    const document = new Y.Doc();
    const editor = new Editor({
      extensions: buildExtensions(snapshotWith(), {
        collaboration: {
          document,
          field: "body",
          provider: { awareness: new Awareness(document) },
          user: { name: "Alice", color: "#3b82f6" },
        },
      }),
    });
    editors.push(editor);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(document));
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.insert(0, [new Y.XmlText("From Bob")]);
    const fragment = remote.getXmlFragment("body");
    fragment.insert(fragment.length, [paragraph]);
    Y.applyUpdate(document, Y.encodeStateAsUpdate(remote), "remote");

    const last = editor.state.doc.lastChild;
    expect(last?.textContent).toBe("From Bob");
    expect(last?.attrs[BLOCK_ID_ATTR]).toBeNull();

    editor.commands.insertContentAt(editor.state.doc.content.size, {
      type: "paragraph",
      content: [{ type: "text", text: "From Alice" }],
    });
    const mine = editor.state.doc.lastChild;
    expect(mine?.textContent).toBe("From Alice");
    expect(mine?.attrs[BLOCK_ID_ATTR]).toEqual(expect.any(String));
  });
});
