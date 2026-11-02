import type {
  EditorHandle,
  EditorSlashItem,
  EditorToolbarItem,
} from "@docleus/sdk";
import type { Editor } from "@tiptap/core";

const markItem = (
  type: string,
  label: string,
  order: number,
): EditorToolbarItem => ({
  id: `core.${type}`,
  label,
  group: "core.marks",
  order,
  isActive: (editor) => editor.isActive(type),
  run: (editor) => editor.toggleMark(type),
});

function toggleLink(handle: EditorHandle): void {
  const editor = handle.unstable_tiptap as Editor;
  if (editor.isActive("link")) {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  const href = window.prompt("Link URL")?.trim();
  if (!href) return;
  editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
}

/** Toolbar items for the core marks, which every editor has. */
export const CORE_TOOLBAR_ITEMS: readonly EditorToolbarItem[] = [
  markItem("bold", "Bold", -50),
  markItem("italic", "Italic", -40),
  markItem("strike", "Strikethrough", -30),
  markItem("code", "Code", -20),
  {
    id: "core.link",
    label: "Link",
    group: "core.marks",
    order: -10,
    isActive: (editor) => editor.isActive("link"),
    run: toggleLink,
  },
];

export const CORE_SLASH_ITEMS: readonly EditorSlashItem[] = [
  {
    id: "core.paragraph",
    label: "Text",
    keywords: ["paragraph", "plain"],
    order: -100,
    run: (editor) => editor.setBlock("paragraph"),
  },
];
