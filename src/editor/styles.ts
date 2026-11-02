/**
 * The editor's styles; injected while the plugin is loaded. They read the
 * host's design tokens (`--ink`, `--hair`, `--t-ui`, ...), with plain
 * fallbacks so the editor still renders in a host without them.
 */
export const EDITOR_CSS = `
.docleus-editor { position: relative; }
.docleus-toolbar {
  position: absolute; z-index: 5; display: flex; gap: 2px; align-items: center;
  padding: 3px; transform: translate(-50%, calc(-100% - 8px));
  background: var(--ink, #111); border-radius: var(--r, 3px);
  box-shadow: 0 10px 30px -12px rgb(0 0 0 / 0.45);
  font: var(--t-ui, 400 13px/18px system-ui, sans-serif);
  animation: docleus-unfold var(--d-menu, 240ms) var(--ease-press, ease-out) both;
  transform-origin: 50% 100%;
}
.docleus-toolbar-group { display: flex; gap: 2px; align-items: center; }
.docleus-toolbar-group + .docleus-toolbar-group::before {
  content: ""; width: 1px; height: 16px; margin: 0 3px; background: rgb(255 255 255 / 0.25);
}
.docleus-toolbar button {
  min-width: 26px; height: 26px; padding: 0 6px; border: 0; border-radius: 2px;
  background: transparent; color: var(--paper, #fff); box-shadow: none;
  font: 600 13px/26px var(--f-ui, system-ui, sans-serif); cursor: pointer;
  transition: transform var(--d-press, 272ms) var(--ease-press, ease-out), background-color 120ms;
}
.docleus-toolbar button:active { transform: translateY(1px) scale(0.94); transition-duration: 120ms; }
.docleus-toolbar button.is-active { background: var(--paper, #fff); color: var(--ink, #111); }
.docleus-toolbar [data-item="core.italic"] { font-style: italic; }
.docleus-toolbar [data-item="core.strike"] { text-decoration: line-through; }
.docleus-toolbar [data-item="core.code"] { font-family: var(--f-mono, ui-monospace, monospace); font-size: 12px; }
.docleus-toolbar button:focus-visible { outline: 2px solid var(--paper, #fff); outline-offset: -2px; }
.docleus-save-state {
  display: inline-flex; align-items: center; gap: 6px; margin-bottom: 8px;
  color: var(--ink-2, #555); white-space: nowrap; font: var(--t-ui, 13px/18px system-ui);
}
.docleus-save-error { color: var(--ink, #111); font-weight: 600; }
.docleus-block-menu {
  position: absolute; z-index: 6; min-width: 200px; padding: 4px;
  background: var(--paper, #fff); border: 1px solid var(--ink, #111); border-radius: var(--r, 3px);
  box-shadow: var(--lift, 0 6px 20px rgb(0 0 0 / 0.12));
  font: var(--t-ui, 13px/18px system-ui, sans-serif);
  transform-origin: 0 0;
  animation: docleus-unfold var(--d-menu, 240ms) var(--ease-press, ease-out) both;
}
.docleus-block-menu button {
  position: relative; display: flex; align-items: center; width: 100%; height: 30px;
  padding: 0 8px; border: 0; border-radius: 2px; background: none; color: var(--ink, #111);
  font: inherit; text-align: left; cursor: pointer;
}
.docleus-block-menu button:hover, .docleus-block-menu button:focus-visible {
  outline: none; text-decoration: underline; text-underline-offset: 3px;
}
.docleus-block-menu button.is-danger { color: var(--del-fg, #a3201b); }
.docleus-block-menu .k { position: absolute; right: 8px; color: var(--pencil, #777); }
.docleus-block-menu hr { margin: 4px 0; border: 0; border-top: 1px solid var(--hair, #e6e6e3); }
.docleus-editor-connecting { padding: 8px 0; color: var(--ink-2, #555); font: var(--t-ui, 13px/18px system-ui); }
.docleus-editor-body { position: relative; }
.collaboration-carets__caret {
  position: relative; margin: 0 -1px; border-left: 1px solid; border-right: 1px solid;
  word-break: normal; pointer-events: none;
}
.collaboration-carets__label {
  position: absolute; top: -1.4em; left: -1px; padding: 1px 4px;
  border-radius: 2px 2px 2px 0; color: #111; font: 600 11px/14px var(--f-ui, system-ui, sans-serif);
  white-space: nowrap; user-select: none;
}
.docleus-editor-content {
  min-height: 12rem; padding: 0 0 8px; outline: none;
}
.docleus-editor:not(.is-editable) .docleus-editor-content { min-height: 0; }
.docleus-editor-content {
  font: var(--t-read, 17px/28px Georgia, serif); color: var(--ink, #111);
}
.docleus-editor-content > * + * { margin-top: 14px; }
.docleus-editor-content h1, .docleus-editor-content h2 { margin-top: 42px; font: var(--t-h2, 600 22px/30px Georgia, serif); }
.docleus-editor-content h3, .docleus-editor-content h4 { margin-top: 28px; font: 600 18px/26px var(--f-title, Georgia, serif); }
.docleus-editor-content ul, .docleus-editor-content ol { padding-left: 24px; }
.docleus-editor-content code {
  padding: 1px 4px; border-radius: 2px; background: var(--sel, #ededeb);
  font: 0.82em/1 var(--f-mono, ui-monospace, monospace);
}
.docleus-editor-content a { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
.docleus-editor-content ::selection { background: var(--sel-text, #dcdcd8); }
.docleus-editor.is-editable .docleus-editor-content p.is-editor-empty:first-child::before {
  content: attr(data-placeholder); color: var(--ink-3, #999); float: left; height: 0;
  pointer-events: none;
}
.docleus-editor-content .ProseMirror-selectednode { outline: 1px solid var(--ink, #111); outline-offset: 2px; }
.docleus-passthrough {
  display: block; margin: 8px 0; padding: 8px 12px;
  border: 1px dashed var(--ink-2, #555); border-radius: var(--r, 3px);
  background: var(--rail, #f5f5f4); color: var(--ink-2, #555);
  font: var(--t-mono, 12.5px/18px ui-monospace, monospace); user-select: none;
}
.docleus-passthrough-inline {
  display: inline; margin: 0 2px; padding: 0 4px;
}
.docleus-slash-menu {
  position: absolute; z-index: 4; min-width: 240px; max-height: 288px;
  margin: 6px 0 0; padding: 4px; overflow: auto; list-style: none;
  background: var(--paper, #fff); border: 1px solid var(--ink, #111); border-radius: var(--r, 3px);
  box-shadow: var(--lift, 0 6px 20px rgb(0 0 0 / 0.12));
  font: var(--t-ui, 13px/18px system-ui, sans-serif);
  transform-origin: 0 0;
  animation: docleus-unfold var(--d-menu, 240ms) var(--ease-press, ease-out) both;
}
@keyframes docleus-unfold {
  from { opacity: 0; transform: scale(0.96); clip-path: inset(0 0 100% 0); }
  to { clip-path: inset(-20px -20px -40px -20px); }
}
.docleus-slash-menu li {
  display: flex; align-items: center; height: 32px; padding: 0 8px; border-radius: 2px;
  cursor: pointer; transition: background-color 120ms;
}
.docleus-slash-menu li.is-active { background: var(--sel, #ededeb); font-weight: 600; }
.docleus-block-settings {
  margin-top: 16px; padding: 12px; border: 1px solid var(--hair-2, #cfcfcc);
  border-radius: var(--r, 3px); background: var(--rail, #f5f5f4);
  font: var(--t-ui, 13px/18px system-ui, sans-serif);
  animation: docleus-rise var(--d-settle, 400ms) var(--ease-settle, ease-out) both;
}
@keyframes docleus-rise { from { opacity: 0; translate: 0 6px; } }
@media (prefers-reduced-motion: reduce) {
  .docleus-toolbar, .docleus-slash-menu, .docleus-block-menu, .docleus-block-settings { animation: none; }
}
`;
