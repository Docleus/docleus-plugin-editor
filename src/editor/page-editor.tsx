import {
  editorNodeName,
  fromEditorDocument,
  toEditorDocument,
  type BlockNode,
  type BlockSettingsProps,
  type EditorHandle,
  type PageEditorProps,
  type SaveState,
  type UiComponent,
} from "@docleus/sdk";
import { getSchema, type Editor, type JSONContent } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { openCollaboration, type OpenSession } from "./collaboration.ts";
import { createEditorHandle } from "./handle.ts";
import { createBlockId, isRemote } from "./ids.ts";
import type { EditorRegistry, EditorSnapshot } from "./registry.ts";
import { buildExtensions } from "./schema.ts";
import { initialSelection } from "./selection.ts";
import { describeSchema, schemaInfo } from "./tree.ts";
import { SettingsPanel } from "./settings-panel.tsx";
import { SlashMenu, type SlashMenuControl } from "./slash-menu.tsx";
import { BlockMenu, type BlockMenuControl } from "./block-menu.tsx";
import { SelectionToolbar } from "./toolbar.tsx";

/** How long typing pauses before the editor saves on its own. */
const AUTOSAVE_MS = 800;

/** ProseMirror needs at least one block in a document. */
function withBlock(body: BlockNode): BlockNode {
  return (body.content?.length ?? 0) > 0
    ? body
    : {
        ...body,
        content: [{ id: createBlockId(), type: "paragraph", v: 1, attrs: {} }],
      };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Whether the page is edited alone or in a shared session. While a session
 * is being opened, an editor already shown stays, read-only.
 */
type Sharing =
  | { readonly kind: "single" }
  | { readonly kind: "connecting"; readonly isSingleShown: boolean }
  | {
      readonly kind: "shared";
      readonly id: number;
      readonly open: OpenSession;
    };

const SINGLE: Sharing = { kind: "single" };

function connecting(current: Sharing): Sharing {
  const isSingleShown =
    current.kind === "single" ||
    (current.kind === "connecting" && current.isSingleShown);
  return { kind: "connecting", isSingleShown };
}

const SAVE_LABELS = {
  saved: "Saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  error: "Save failed",
} as const;

interface EditorBodyProps {
  readonly page: PageEditorProps;
  readonly snapshot: EditorSnapshot;
  readonly shared: OpenSession | undefined;
  readonly isReadOnly: boolean;
  /** Hears about saves that failed after the editor was gone. */
  readonly onError: (error: unknown) => void;
  /** The editor shown last, whose document a rebuilt editor starts from. */
  readonly editorRef: RefObject<Editor | null>;
}

function EditorBody({
  page,
  snapshot,
  shared,
  isReadOnly,
  onError,
  editorRef,
}: EditorBodyProps) {
  const extensions = useMemo(
    () =>
      buildExtensions(snapshot, {
        placeholder:
          "Type, or use Markdown: # heading, - list, > quote. / for more",
        collaboration: shared?.binding,
      }),
    [snapshot, shared],
  );
  const content = useMemo(() => {
    // A shared editor shows the shared document, never a stored body.
    if (shared) return undefined;
    const previous = editorRef.current;
    const body =
      previous && !previous.isDestroyed
        ? fromEditorDocument(previous.getJSON())
        : page.body;
    // Tiptap does not mutate its initial content.
    return toEditorDocument(
      withBlock(body),
      schemaInfo(getSchema(extensions)),
    ) as JSONContent;
    // The body prop only seeds the first editor; later ones keep the edits.
  }, [extensions]);
  const [save, setSaveLocal] = useState<SaveState>({ kind: "saved" });
  const { onSaveState } = page;
  // Nothing is reported until the first change, so the host shows no save
  // state for a page that was only opened.
  const hasChanged = useRef(false);
  const setSave = useCallback(
    (state: SaveState) => {
      setSaveLocal(state);
      isDirty.current = state.kind === "dirty";
      if (state.kind !== "saved" || hasChanged.current) onSaveState?.(state);
    },
    [onSaveState],
  );
  const slash = useRef<SlashMenuControl | null>(null);
  const blockMenu = useRef<BlockMenuControl | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flushRef = useRef<() => void>(() => undefined);
  // Read by the autosave timer and blur, which outlive the render they saw.
  const isDirty = useRef(false);

  const editor = useEditor(
    {
      extensions,
      ...(content && { content }),
      editable: !isReadOnly,
      immediatelyRender: true,
      editorProps: {
        attributes: {
          class: "docleus-editor-content",
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": "Page body",
        },
        handleKeyDown: (_view, event) =>
          slash.current?.onKeyDown(event) ?? false,
        handleDOMEvents: {
          contextmenu: (_view, event) =>
            blockMenu.current?.open(event) ?? false,
          blur: () => {
            flushRef.current();
            return false;
          },
        },
      },
      onMount: ({ editor: mounted }) => {
        const { state } = mounted;
        if (!state.selection.eq(Selection.atStart(state.doc))) return;
        mounted.view.dispatch(
          state.tr
            .setSelection(initialSelection(state.doc))
            .setMeta("addToHistory", false),
        );
      },
      onUpdate: ({ transaction }) => {
        if (transaction.docChanged && !isRemote(transaction)) {
          hasChanged.current = true;
          setSave({ kind: "dirty" });
          clearTimeout(timer.current);
          timer.current = setTimeout(() => flushRef.current(), AUTOSAVE_MS);
        }
      },
    },
    [extensions],
  );
  editorRef.current = editor;
  useEffect(() => {
    editor.setEditable(!isReadOnly, false);
  }, [editor, isReadOnly]);
  const handle = useMemo<EditorHandle>(
    () => createEditorHandle(editor),
    [editor],
  );

  const { save: saveDocument } = page;
  const saving = useRef<Promise<void> | undefined>(undefined);
  const isPending = useRef(false);
  const runSave = useCallback(async () => {
    clearTimeout(timer.current);
    // One save at a time; a change made during a save is saved after it.
    if (saving.current) {
      isPending.current = true;
      return saving.current;
    }
    setSave({ kind: "saving" });
    const run = (async () => {
      try {
        await (shared ? shared.session.save() : saveDocument(editor.getJSON()));
        setSave(isPending.current ? { kind: "dirty" } : { kind: "saved" });
      } catch (error) {
        setSave({ kind: "error", message: messageOf(error) });
      }
    })();
    saving.current = run;
    await run;
    saving.current = undefined;
    if (isPending.current) {
      isPending.current = false;
      await runSave();
    }
  }, [editor, saveDocument, shared, setSave]);
  flushRef.current = () => {
    if (isDirty.current && !isReadOnly) void runSave();
  };
  // Leaving the page saves what is left.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (!isDirty.current) return;
      const pending = shared
        ? shared.session.save()
        : saveDocument(editor.getJSON());
      // Nothing is left on screen to show a failure in.
      pending.catch(onError);
    },
    [editor, saveDocument, shared, onError],
  );

  const settings = useMemo(() => {
    const panels = new Map<string, UiComponent<BlockSettingsProps>>();
    for (const definition of [...snapshot.blocks, ...snapshot.inlines]) {
      if (definition.settings) {
        panels.set(editorNodeName(definition.type), definition.settings);
      }
    }
    return panels;
  }, [snapshot]);

  const isSaving = save.kind === "saving";
  useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber,
  });

  const isEditable = !isReadOnly;
  return (
    <div
      className={`docleus-editor${isEditable ? " is-editable" : ""}`}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "s") {
          event.preventDefault();
          if (!isSaving && isEditable) void runSave();
        }
      }}
    >
      {/* Shown only when the host does not show the save state itself. */}
      {isEditable && !onSaveState && hasChanged.current && (
        <span
          className={`docleus-save-state docleus-save-${save.kind}`}
          role="status"
          title={save.kind === "error" ? save.message : undefined}
        >
          {SAVE_LABELS[save.kind]}
          {save.kind === "error" && `: ${save.message}`}
        </span>
      )}
      <div className="docleus-editor-body">
        <EditorContent editor={editor} />
        {isEditable && (
          <>
            <SelectionToolbar
              editor={editor}
              handle={handle}
              items={snapshot.toolbar}
            />
            <SlashMenu
              ref={slash}
              editor={editor}
              handle={handle}
              items={snapshot.slash}
            />
            <BlockMenu
              ref={blockMenu}
              editor={editor}
              handle={handle}
              items={snapshot.slash}
            />
            <SettingsPanel editor={editor} handle={handle} panels={settings} />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The page editor for the `page.editor` slot. Its schema comes from the
 * registry; when registrations change, the editor is rebuilt around the
 * current document, so content of a plugin that left becomes passthrough
 * nodes and content of one that arrived becomes editable.
 *
 * When a collaboration provider offers a session for the page, the editor
 * binds to its shared document instead of the body and saves through it.
 * Providers are asked again whenever the page, the branch, or the set of
 * providers changes. `onError` hears about providers that failed; the page
 * then opens in single-user mode.
 */
export function createPageEditor(
  registry: EditorRegistry,
  onError: (error: unknown) => void,
): UiComponent<PageEditorProps> {
  return function PageEditor(props: PageEditorProps) {
    const snapshot = useSyncExternalStore(
      registry.subscribe,
      registry.snapshot,
    );
    const latest = useRef(snapshot);
    latest.current = snapshot;
    const editorRef = useRef<Editor | null>(null);
    const sessionCount = useRef(0);
    const { collaborations } = snapshot;
    const [sharing, setSharing] = useState<Sharing>(() =>
      collaborations.length === 0 || props.isEditable === false
        ? SINGLE
        : { kind: "connecting", isSingleShown: false },
    );

    const { orgId, spaceId, branch, entryId } = props;
    const isShared = collaborations.length > 0 && props.isEditable !== false;
    useEffect(() => {
      if (!isShared) {
        setSharing(SINGLE);
        return undefined;
      }
      setSharing(connecting);
      let isCancelled = false;
      let opened: OpenSession | undefined;
      const schema = describeSchema(getSchema(buildExtensions(latest.current)));
      openCollaboration(
        collaborations,
        { orgId, spaceId, branch, entryId, schema },
        onError,
      )
        .then((result) => {
          if (isCancelled) {
            result?.session.dispose();
            return;
          }
          opened = result;
          sessionCount.current += 1;
          setSharing(
            result
              ? { kind: "shared", id: sessionCount.current, open: result }
              : SINGLE,
          );
        })
        .catch(onError);
      return () => {
        isCancelled = true;
        opened?.session.dispose();
      };
    }, [orgId, spaceId, branch, entryId, collaborations, isShared]);

    if (sharing.kind === "connecting" && !sharing.isSingleShown) {
      return (
        <div className="docleus-editor docleus-editor-connecting" role="status">
          Connecting…
        </div>
      );
    }
    return (
      <EditorBody
        key={sharing.kind === "shared" ? `shared#${sharing.id}` : "single"}
        page={props}
        snapshot={snapshot}
        shared={sharing.kind === "shared" ? sharing.open : undefined}
        isReadOnly={sharing.kind === "connecting" || props.isEditable === false}
        onError={onError}
        editorRef={editorRef}
      />
    );
  };
}
