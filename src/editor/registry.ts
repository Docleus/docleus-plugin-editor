import {
  DocleusError,
  editorNodeName,
  trackCaller,
  type Context,
  type EditorBlockDefinition,
  type EditorCollaborationProvider,
  type EditorInlineDefinition,
  type EditorMarkDefinition,
  type EditorService,
  type EditorSlashItem,
  type EditorToolbarItem,
} from "@docleus/sdk";

/** Types core owns; plugins cannot register them. */
const CORE_TYPES = new Set([
  "doc",
  "paragraph",
  "text",
  "raw",
  "link",
  "strike",
  "bold",
  "italic",
  "code",
]);

/** Everything registered, as one immutable value per version. */
export interface EditorSnapshot {
  readonly version: number;
  readonly blocks: readonly EditorBlockDefinition[];
  readonly inlines: readonly EditorInlineDefinition[];
  readonly marks: readonly EditorMarkDefinition[];
  readonly toolbar: readonly EditorToolbarItem[];
  readonly slash: readonly EditorSlashItem[];
  readonly extensions: readonly unknown[];
  /** In registration order; the same array until a provider comes or goes. */
  readonly collaborations: readonly EditorCollaborationProvider[];
}

export interface EditorRegistry extends EditorService {
  snapshot(): EditorSnapshot;
  subscribe(onChange: () => void): () => void;
}

const byOrder = <T extends { readonly order?: number }>(a: T, b: T) =>
  (a.order ?? 0) - (b.order ?? 0);

const uniqueIn =
  (registry: Map<string, unknown>, key: string, what: string) => () => {
    if (registry.has(key)) {
      throw new DocleusError(
        "editor/already-registered",
        `${what} "${key}" is already registered`,
      );
    }
  };

/** The `editor` service: registrations, undone when the registering plugin unloads. */
export function createEditorRegistry(ctx: Context): EditorRegistry {
  const blocks = new Map<string, EditorBlockDefinition>();
  const inlines = new Map<string, EditorInlineDefinition>();
  const marks = new Map<string, EditorMarkDefinition>();
  const toolbar = new Map<string, EditorToolbarItem>();
  const slash = new Map<string, EditorSlashItem>();
  const extensions = new Set<unknown>();
  let collaborations: readonly EditorCollaborationProvider[] = [];
  const listeners = new Set<() => void>();
  let current: EditorSnapshot | undefined;
  let version = 0;

  const changed = () => {
    version++;
    current = undefined;
    for (const listener of listeners) listener();
  };

  /** Block, inline and mark types share the editor's node and mark names. */
  function assertFreeType(type: string): void {
    const name = editorNodeName(type);
    if (CORE_TYPES.has(type)) {
      throw new DocleusError(
        "editor/core-type",
        `"${type}" belongs to the core schema`,
      );
    }
    for (const registry of [blocks, inlines, marks]) {
      if (registry.has(name)) {
        throw new DocleusError(
          "editor/already-registered",
          `type "${type}" is already registered`,
        );
      }
    }
  }

  function add<T>(
    caller: Context,
    registry: Map<string, T>,
    key: string,
    value: T,
    what: string,
    check: () => void,
  ): () => void {
    return caller.effect(
      () => {
        check();
        registry.set(key, value);
        changed();
        return () => {
          registry.delete(key);
          changed();
        };
      },
      `ctx.editor.${what}(${JSON.stringify(key)})`,
    );
  }

  return trackCaller<EditorRegistry>(ctx, {
    registerBlock(definition) {
      return add(
        this.ctx,
        blocks,
        editorNodeName(definition.type),
        definition,
        "registerBlock",
        () => assertFreeType(definition.type),
      );
    },
    registerInline(definition) {
      return add(
        this.ctx,
        inlines,
        editorNodeName(definition.type),
        definition,
        "registerInline",
        () => assertFreeType(definition.type),
      );
    },
    registerMark(definition) {
      return add(
        this.ctx,
        marks,
        editorNodeName(definition.type),
        definition,
        "registerMark",
        () => assertFreeType(definition.type),
      );
    },
    registerToolbarItem(item) {
      return add(
        this.ctx,
        toolbar,
        item.id,
        item,
        "registerToolbarItem",
        uniqueIn(toolbar, item.id, "toolbar item"),
      );
    },
    registerSlashItem(item) {
      return add(
        this.ctx,
        slash,
        item.id,
        item,
        "registerSlashItem",
        uniqueIn(slash, item.id, "slash item"),
      );
    },
    registerExtension(extension) {
      return this.ctx.effect(() => {
        extensions.add(extension);
        changed();
        return () => {
          extensions.delete(extension);
          changed();
        };
      }, "ctx.editor.registerExtension()");
    },
    registerCollaboration(provider) {
      // A wrapper, so registering one provider twice gives two entries.
      const entry: EditorCollaborationProvider = (target) => provider(target);
      return this.ctx.effect(() => {
        collaborations = [...collaborations, entry];
        changed();
        return () => {
          collaborations = collaborations.filter((other) => other !== entry);
          changed();
        };
      }, "ctx.editor.registerCollaboration()");
    },
    snapshot() {
      current ??= {
        version,
        blocks: [...blocks.values()],
        inlines: [...inlines.values()],
        marks: [...marks.values()],
        toolbar: [...toolbar.values()].toSorted(byOrder),
        slash: [...slash.values()].toSorted(byOrder),
        extensions: [...extensions],
        collaborations,
      };
      return current;
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  });
}
