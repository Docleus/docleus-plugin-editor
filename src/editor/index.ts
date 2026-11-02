import { definePlugin } from "@docleus/sdk";
import { CORE_SLASH_ITEMS, CORE_TOOLBAR_ITEMS } from "./core-items.ts";
import { createPageEditor } from "./page-editor.tsx";
import { createEditorRegistry } from "./registry.ts";
import { EDITOR_CSS } from "./styles.ts";

export {
  createEditorRegistry,
  type EditorRegistry,
  type EditorSnapshot,
} from "./registry.ts";

export const PLUGIN_NAME = "@docleus/plugin-editor";

/**
 * Provides the `editor` service and the page editor in the `page.editor`
 * slot. Block plugins register their types through `ctx.editor`.
 */
export const plugin = definePlugin({
  name: PLUGIN_NAME,
  inject: ["ui"],
  provides: ["editor"],
  apply(ctx) {
    const logger = ctx.logger("editor");
    const registry = createEditorRegistry(ctx);
    ctx.provide("editor", registry);
    for (const item of CORE_TOOLBAR_ITEMS) registry.registerToolbarItem(item);
    for (const item of CORE_SLASH_ITEMS) registry.registerSlashItem(item);
    ctx.ui.registerSlot("page.editor", {
      id: PLUGIN_NAME,
      component: createPageEditor(registry, (error) =>
        logger.warn("editor: %s", error),
      ),
    });
    ctx.effect(() => {
      const style = document.createElement("style");
      style.dataset.plugin = PLUGIN_NAME;
      style.textContent = EDITOR_CSS;
      document.head.append(style);
      return () => style.remove();
    }, "editor styles");
  },
});
