import {
  BLOCK_ID_ATTR,
  BLOCK_VERSION_ATTR,
  DocleusError,
  editorNodeName,
  PASSTHROUGH_BLOCK,
  PASSTHROUGH_INLINE,
  type EditorBlockDefinition,
  type EditorHandle,
  type EditorInlineDefinition,
  type EditorKeys,
} from "@docleus/sdk";
import {
  Extension,
  mergeAttributes,
  Node,
  type AnyExtension,
  type Attributes,
} from "@tiptap/core";
import { Bold } from "@tiptap/extension-bold";
import { Code } from "@tiptap/extension-code";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { Document } from "@tiptap/extension-document";
import { Italic } from "@tiptap/extension-italic";
import { Link } from "@tiptap/extension-link";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Strike } from "@tiptap/extension-strike";
import { Text } from "@tiptap/extension-text";
import {
  Dropcursor,
  Gapcursor,
  Placeholder,
  UndoRedo,
} from "@tiptap/extensions";
import type * as Y from "yjs";
import { createEditorHandle } from "./handle.ts";
import { blockIdPlugin } from "./ids.ts";
import {
  parsePassthroughBlock,
  parsePassthroughInline,
} from "./passthrough.ts";
import type { EditorSnapshot } from "./registry.ts";
import { blockShortcuts } from "./shortcuts.ts";
import { blockView, inlineView, passthroughView, tagOf } from "./views.tsx";

/** The schema version of core blocks, which never migrate. */
const CORE_VERSION = 1;

type Attrs = Readonly<Record<string, unknown>>;

/** Block attrs round-trip through the clipboard as JSON data attributes. */
function attributesOf(defaults: Attrs | undefined): Attributes {
  return Object.fromEntries(
    Object.entries(defaults ?? {}).map(([key, value]) => {
      const name = `data-attr-${key.toLowerCase()}`;
      return [
        key,
        {
          default: value,
          parseHTML: (element: HTMLElement) => {
            const stored = element.getAttribute(name);
            if (stored === null) return value;
            try {
              return JSON.parse(stored) as unknown;
            } catch {
              return value;
            }
          },
          renderHTML: (attrs: Record<string, unknown>) => ({
            [name]: JSON.stringify(attrs[key]),
          }),
        },
      ];
    }),
  );
}

function raw(extension: unknown, what: string): AnyExtension {
  const type = (extension as { type?: unknown } | null)?.type;
  if (type !== "extension" && type !== "node" && type !== "mark") {
    throw new DocleusError(
      "editor/invalid-extension",
      `${what} is not a Tiptap extension, node or mark`,
    );
  }
  return extension as AnyExtension;
}

/** Tiptap key handlers; `handleOf` returns no handle when the keys do not apply. */
function keyHandlers(
  keys: EditorKeys | undefined,
  handleOf: () => EditorHandle | undefined,
): Record<string, () => boolean> {
  return Object.fromEntries(
    Object.entries(keys ?? {}).map(([key, handler]) => [
      key,
      () => {
        const handle = handleOf();
        return handle ? handler(handle) : false;
      },
    ]),
  );
}

function blockNode(definition: EditorBlockDefinition): AnyExtension {
  const name = editorNodeName(definition.type);
  if (definition.node !== undefined) {
    return raw(definition.node, `the node of block "${definition.type}"`);
  }
  const { content } = definition;
  const tagFor = tagOf(definition.tag, "div");
  return Node.create({
    name,
    group: definition.group ?? "block",
    ...(content === "inline" && {
      content: definition.isCode ? "text*" : "inline*",
    }),
    ...(content === "blocks" && { content: definition.children ?? "block+" }),
    atom: content === "atom",
    code: definition.isCode === true,
    ...(definition.isCode && { marks: "", whitespace: "pre" as const }),
    defining: definition.isDefining === true,
    isolating: definition.isIsolating === true,
    addAttributes: () => attributesOf(definition.attrs),
    parseHTML: () => [{ tag: `[data-type="${name}"]`, priority: 60 }],
    renderHTML: ({ node, HTMLAttributes }) => {
      const attributes = mergeAttributes(HTMLAttributes, { "data-type": name });
      return content === "atom"
        ? [tagFor(node.attrs), attributes]
        : [tagFor(node.attrs), attributes, 0];
    },
    addKeyboardShortcuts() {
      const listKeys: Record<string, () => boolean> = definition.isListItem
        ? {
            Enter: () => this.editor.commands.splitListItem(name),
            Tab: () => this.editor.commands.sinkListItem(name),
            "Shift-Tab": () => this.editor.commands.liftListItem(name),
          }
        : {};
      const own = keyHandlers(definition.keys, () =>
        this.editor.isActive(name)
          ? createEditorHandle(this.editor)
          : undefined,
      );
      const merged = { ...listKeys };
      for (const [key, handler] of Object.entries(own)) {
        const fallback = listKeys[key];
        merged[key] = () => handler() || (fallback?.() ?? false);
      }
      return merged;
    },
    ...(definition.view && {
      addNodeView: () => blockView(definition, content !== "atom"),
    }),
  });
}

function inlineNode(definition: EditorInlineDefinition): AnyExtension {
  const name = editorNodeName(definition.type);
  if (definition.node !== undefined) {
    return raw(definition.node, `the node of inline "${definition.type}"`);
  }
  const tagFor = tagOf(definition.tag, "span");
  return Node.create({
    name,
    group: "inline",
    inline: true,
    atom: true,
    addAttributes: () => attributesOf(definition.attrs),
    parseHTML: () => [{ tag: `[data-type="${name}"]`, priority: 60 }],
    renderHTML: ({ node, HTMLAttributes }) => [
      tagFor(node.attrs),
      mergeAttributes(HTMLAttributes, { "data-type": name }),
    ],
    addKeyboardShortcuts() {
      return keyHandlers(definition.keys, () =>
        createEditorHandle(this.editor),
      );
    },
    ...(definition.view && { addNodeView: () => inlineView(definition) }),
  });
}

function readJson(element: HTMLElement, name: string): unknown {
  const value = element.getAttribute(name);
  if (value === null) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * A passthrough node's data, kept as JSON in the DOM. Pasted HTML can carry
 * anything there, so an element whose data is not a valid node does not
 * become a passthrough node; its children are parsed as ordinary content.
 */
function passthroughData(
  attribute: string,
  name: string,
  parse: (value: unknown) => unknown,
) {
  return {
    attribute: {
      default: null,
      parseHTML: (element: HTMLElement) =>
        parse(readJson(element, name)) ?? null,
      renderHTML: (attrs: Record<string, unknown>) => ({
        [name]: JSON.stringify(attrs[attribute]),
      }),
    },
    getAttrs: (element: HTMLElement) =>
      parse(readJson(element, name)) === undefined ? false : null,
  };
}

const passthroughBlock = passthroughData(
  "block",
  "data-passthrough-block",
  parsePassthroughBlock,
);

const PassthroughBlock = Node.create({
  name: PASSTHROUGH_BLOCK,
  group: "block",
  atom: true,
  addAttributes: () => ({ block: passthroughBlock.attribute }),
  parseHTML: () => [
    {
      tag: "div[data-passthrough-block]",
      getAttrs: passthroughBlock.getAttrs,
    },
  ],
  renderHTML: ({ HTMLAttributes }) => ["div", HTMLAttributes],
  addNodeView: () => passthroughView("block"),
});

const passthroughInline = passthroughData(
  "inline",
  "data-passthrough-inline",
  parsePassthroughInline,
);

const PassthroughInline = Node.create({
  name: PASSTHROUGH_INLINE,
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({ inline: passthroughInline.attribute }),
  parseHTML: () => [
    {
      tag: "span[data-passthrough-inline]",
      getAttrs: passthroughInline.getAttrs,
    },
  ],
  renderHTML: ({ HTMLAttributes }) => ["span", HTMLAttributes],
  addNodeView: () => passthroughView("inline"),
});

/**
 * Block ids and versions never reach the DOM: a pasted copy gets fresh ones
 * from the block id plugin instead of duplicating its source.
 */
function blockAttributes(
  types: readonly string[],
  versions: ReadonlyMap<string, number>,
): AnyExtension {
  return Extension.create({
    name: "docleusBlockAttributes",
    addGlobalAttributes: () => [
      {
        types: [...types],
        attributes: {
          [BLOCK_ID_ATTR]: {
            default: null,
            rendered: false,
            keepOnSplit: false,
          },
          [BLOCK_VERSION_ATTR]: {
            default: null,
            rendered: false,
            keepOnSplit: false,
          },
        },
      },
    ],
    addProseMirrorPlugins: () => [blockIdPlugin(versions)],
  });
}

/** A shared document the editor binds to instead of its own content. */
export interface EditorCollaboration {
  readonly document: Y.Doc;
  readonly field: string;
  /** A provider with an `awareness`, such as Hocuspocus's. */
  readonly provider: unknown;
  readonly user: { readonly name: string; readonly color: string };
}

export interface EditorSchemaOptions {
  readonly placeholder?: string;
  /** Binds the editor to a shared document; Yjs then owns undo history. */
  readonly collaboration?: EditorCollaboration;
}

/** The Tiptap extensions of the editor: the core schema plus everything registered. */
export function buildExtensions(
  snapshot: EditorSnapshot,
  options: EditorSchemaOptions = {},
): AnyExtension[] {
  const versions = new Map<string, number>([
    ["doc", CORE_VERSION],
    ["paragraph", CORE_VERSION],
    [PASSTHROUGH_BLOCK, CORE_VERSION],
  ]);
  for (const definition of snapshot.blocks) {
    versions.set(editorNodeName(definition.type), definition.version);
  }
  return [
    // Mark order is the schema's, so it follows the core mark nesting order.
    Document,
    Paragraph,
    Text,
    Link.configure({
      openOnClick: false,
      autolink: false,
      HTMLAttributes: { target: null, rel: null, class: null },
    }),
    Strike,
    Bold,
    Italic,
    // Markdown allows code inside other marks, so code excludes none.
    Code.extend({ excludes: "" }),
    PassthroughBlock,
    PassthroughInline,
    ...snapshot.blocks.map(blockNode),
    blockShortcuts(snapshot.blocks),
    ...snapshot.inlines.map(inlineNode),
    ...snapshot.marks.map((definition) =>
      raw(definition.mark, `the mark "${definition.type}"`),
    ),
    blockAttributes([...versions.keys()], versions),
    ...(options.collaboration
      ? [
          Collaboration.configure({
            document: options.collaboration.document,
            field: options.collaboration.field,
          }),
          CollaborationCaret.configure({
            provider: options.collaboration.provider,
            user: options.collaboration.user,
          }),
        ]
      : [UndoRedo]),
    Dropcursor,
    Gapcursor,
    ...(options.placeholder
      ? [Placeholder.configure({ placeholder: options.placeholder })]
      : []),
    ...snapshot.extensions.map((extension, i) =>
      raw(extension, `extension #${i}`),
    ),
  ];
}
