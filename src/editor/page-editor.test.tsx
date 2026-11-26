import { Context, type PageEditorProps, type SaveState } from "@docleus/sdk";
import type { Editor, JSONContent } from "@tiptap/core";
import { act, createElement, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createPageEditor } from "./page-editor.tsx";
import { createEditorRegistry } from "./registry.ts";

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
});

function deferred() {
  let resolve = () => {};
  let reject = (_error: Error) => {};
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function mount(save: PageEditorProps["save"]) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const errors = vi.fn();
  const states: SaveState[] = [];
  const PageEditor = createPageEditor(
    createEditorRegistry(new Context()),
    errors,
  ) as unknown as ComponentType<PageEditorProps>;
  await act(async () => {
    root.render(
      createElement(PageEditor, {
        orgId: "org",
        spaceId: "space",
        branch: "main",
        entryId: "page",
        body: { id: "root", type: "doc", v: 1, attrs: {}, content: [] },
        save,
        onSaveState: (state) => states.push(state),
      }),
    );
  });
  const element = host.querySelector<HTMLElement & { editor: Editor }>(
    ".tiptap",
  );
  if (!element) throw new Error("editor did not mount");
  let isMounted = true;
  const unmount = () => {
    if (!isMounted) return;
    act(() => root.unmount());
    isMounted = false;
    host.remove();
  };
  cleanups.push(unmount);
  return { host, editor: element.editor, states, errors, unmount };
}

async function type(editor: Editor, text: string) {
  await act(async () => {
    editor.commands.insertContent(text);
  });
}

async function saveNow(host: HTMLElement) {
  await act(async () => {
    host.querySelector(".docleus-editor")?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "s",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

function text(document: unknown) {
  const body = document as JSONContent;
  return (
    body.content
      ?.flatMap((block) => block.content?.map((node) => node.text ?? "") ?? [])
      .join("") ?? ""
  );
}

describe("page autosave", () => {
  it.each([false, true])(
    "drains edits during a save (unmount: %s)",
    async (isLeaving) => {
      const first = deferred();
      const second = deferred();
      const documents: string[] = [];
      const save = vi.fn(async (document: unknown) => {
        documents.push(text(document));
        await (documents.length === 1 ? first.promise : second.promise);
      });
      const mounted = await mount(save);
      await type(mounted.editor, "A");
      await saveNow(mounted.host);
      expect(documents).toEqual(["A"]);
      await type(mounted.editor, "B");
      if (isLeaving) mounted.unmount();
      expect(documents).toEqual(["A"]);
      await act(async () => {
        first.resolve();
      });
      expect(documents).toEqual(["A", "AB"]);
      if (!isLeaving) expect(mounted.states.at(-1)?.kind).not.toBe("saved");
      await act(async () => {
        second.resolve();
      });
      if (!isLeaving) expect(mounted.states.at(-1)?.kind).toBe("saved");
      expect(mounted.errors).not.toHaveBeenCalled();
    },
  );

  it("reports an in-flight save that fails after unmount", async () => {
    const write = deferred();
    const mounted = await mount(() => write.promise);
    await type(mounted.editor, "A");
    await saveNow(mounted.host);
    mounted.unmount();
    const failure = new Error("write failed");
    await act(async () => {
      write.reject(failure);
    });
    expect(mounted.errors).toHaveBeenCalledExactlyOnceWith(failure);
  });
});
