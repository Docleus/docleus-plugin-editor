import {
  Context,
  editorNodeName,
  toEditorDocument,
  type BlockNode,
  type BlockViewProps,
  type EditorBlockDefinition,
  type UiComponent,
} from "@docleus/sdk";
import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createEditorRegistry } from "./registry.ts";
import { buildExtensions } from "./schema.ts";
import { schemaInfo } from "./tree.ts";
import { asComponent } from "./views.tsx";

const ITEM: EditorBlockDefinition = {
  type: "acme.item",
  version: 1,
  content: "inline",
  group: "acme.item",
  tag: "li",
};

const LIST: EditorBlockDefinition = {
  type: "acme.list",
  version: 1,
  content: "blocks",
  children: "acme_item+",
  attrs: { ordered: false },
  tag: (attrs) => (attrs.ordered === true ? "ol" : "ul"),
};

function ListView(props: BlockViewProps) {
  const Content = asComponent(props.Content);
  return <Content />;
}

const VIEW_LIST: EditorBlockDefinition = {
  ...LIST,
  view: ListView as unknown as UiComponent<BlockViewProps>,
};

const block = (
  id: string,
  type: string,
  rest: Partial<BlockNode> = {},
): BlockNode => ({ id, type, v: 1, attrs: {}, ...rest });

const BODY: BlockNode = block("root", "doc", {
  content: [
    block("l", "acme.list", {
      content: [
        block("i", "acme.item", { inline: [{ type: "text", text: "One" }] }),
      ],
    }),
  ],
});

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

const mounted: { editor: Editor; root: Root; host: HTMLElement }[] = [];
afterEach(() => {
  for (const { editor, root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    editor.destroy();
    host.remove();
  }
});

async function mount(list: EditorBlockDefinition): Promise<Editor> {
  const registry = createEditorRegistry(new Context());
  registry.registerBlock(ITEM);
  registry.registerBlock(list);
  const extensions = buildExtensions(registry.snapshot());
  const content = toEditorDocument(
    BODY,
    schemaInfo(getSchema(extensions)),
  ) as JSONContent;
  const editor = new Editor({ extensions, content });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<EditorContent editor={editor} />);
  });
  mounted.push({ editor, root, host });
  return editor;
}

function listElement(editor: Editor): Element | null {
  return editor.view.dom.querySelector(
    `[data-type="${editorNodeName("acme.list")}"]`,
  );
}

async function setOrdered(editor: Editor, ordered: boolean) {
  await act(async () => {
    editor
      .chain()
      .setTextSelection(3)
      .updateAttributes(editorNodeName("acme.list"), { ordered })
      .run();
  });
}

describe.each([
  ["without a view", LIST],
  ["with a view", VIEW_LIST],
])("a block whose tag is a function of attrs, %s", (_, list) => {
  it("renders the tag computed from its attrs", async () => {
    const editor = await mount(list);
    expect(listElement(editor)?.closest("ul, ol")?.tagName).toBe("UL");
  });

  it("changes its element when an attr change changes the tag", async () => {
    const editor = await mount(list);
    await setOrdered(editor, true);
    expect(listElement(editor)?.closest("ul, ol")?.tagName).toBe("OL");
    expect(editor.view.dom.querySelector("ul")).toBeNull();
    expect(editor.view.dom.textContent).toBe("One");
    await setOrdered(editor, false);
    expect(listElement(editor)?.closest("ul, ol")?.tagName).toBe("UL");
    expect(editor.view.dom.querySelector("ol")).toBeNull();
  });
});

function Badge() {
  return <span>badge</span>;
}

const badge = (editor: Editor) =>
  editor.view.dom
    .querySelector(`[data-type="${editorNodeName("acme.badge")}"]`)
    ?.closest("strong, em")?.tagName;

describe.each([
  ["without a view", undefined],
  [
    "with a view",
    Badge as unknown as UiComponent<Omit<BlockViewProps, "Content">>,
  ],
])("an inline node whose tag is a function of attrs, %s", (_, view) => {
  async function mountInline(): Promise<Editor> {
    const registry = createEditorRegistry(new Context());
    registry.registerInline({
      type: "acme.badge",
      attrs: { isStrong: false },
      tag: (attrs) => (attrs.isStrong === true ? "strong" : "em"),
      ...(view && { view }),
    });
    const extensions = buildExtensions(registry.snapshot());
    const body = block("root", "doc", {
      content: [
        block("p", "paragraph", {
          inline: [
            { type: "text", text: "a" },
            { type: "acme.badge", attrs: { isStrong: false } },
          ],
        }),
      ],
    });
    const content = toEditorDocument(
      body,
      schemaInfo(getSchema(extensions)),
    ) as JSONContent;
    const editor = new Editor({ extensions, content });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<EditorContent editor={editor} />);
    });
    mounted.push({ editor, root, host });
    return editor;
  }

  it("renders and changes the tag computed from its attrs", async () => {
    const editor = await mountInline();
    expect(badge(editor)).toBe("EM");
    await act(async () => {
      editor
        .chain()
        .setNodeSelection(2)
        .updateAttributes(editorNodeName("acme.badge"), { isStrong: true })
        .run();
    });
    expect(badge(editor)).toBe("STRONG");
    expect(editor.view.dom.querySelector("em")).toBeNull();
  });
});
