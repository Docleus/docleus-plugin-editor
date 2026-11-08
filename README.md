<p align="center">
  <a href="https://docleus.io"><img src="./.github/assets/docleus.svg" width="88" alt="Docleus logo" /></a>
</p>

<h1 align="center">Page Editor</h1>

<p align="center">
  <strong>A writing surface built to extend.</strong><br />
  Tiptap and ProseMirror editing with blocks supplied by plugins.
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" /></a>
  <img alt="Public preview in preparation" src="https://img.shields.io/badge/preview-0.0.6-cfcfcf?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square" />
  <a href="https://docleus.io"><img alt="Online documentation" src="https://img.shields.io/badge/docs-docleus.io-111111?style=flat-square" /></a>
</p>

<p align="center">
  <a href="https://docleus.io">Documentation</a> &middot;
  <a href="#editor-api">Editor API</a> &middot;
  <a href="https://github.com/Docleus/docleus">Run Docleus</a> &middot;
  <a href="https://github.com/Docleus/.github/blob/main/CONTRIBUTING.md">Contribute</a>
</p>

---

The page editor for Docleus: a Tiptap/ProseMirror shell with a toolbar, a slash menu, and a block settings panel. Block types come from block plugins; the editor itself knows only core's minimal schema (document, paragraph, text, inline marks, links) and passthrough placeholders.

Status: editing and saving, alone or together through a collaboration provider
such as `docleus-plugin-collab`.

## Entries

- `editor`: the plugin. It needs the host's `ui` service, provides `ctx.editor`, and fills the `page.editor` slot. There is no server entry.

## Editor API

Block plugins inject `editor` and register through it. Every registration returns a function that undoes it, and the editor rebuilds its schema when registrations change.

- `registerBlock`, `registerInline`: a block or inline type with its content model, attrs, an optional React view, a settings panel, Markdown-like input shortcuts, and key bindings.
- `registerMark`: a Tiptap mark for an inline mark type.
- `registerToolbarItem`, `registerSlashItem`: commands that act through `EditorHandle` (`setBlock`, `wrapIn`, `insertBlock`, `insertTree`, `updateBlock`, `toggleMark`, ...).
- `registerExtension`: a raw Tiptap extension, for anything the high-level API does not cover.
- `registerCollaboration`: a provider that may offer a shared editing session for a page (see below).

Blocks and inline nodes whose type has no registration show as read-only placeholders that keep the whole node, so content of a disabled plugin survives editing and saving. Pasted HTML becomes a placeholder only when it carries a valid node; anything else is pasted as its ordinary content.

## Collaboration

When a page opens, and again when its branch or the set of providers changes, the editor asks the registered collaboration providers in order with the page (`orgId`, `spaceId`, `branch`, `entryId`) and a plain-data description of its schema. The first session returned wins. Until it has synced, an editor already on screen stays read-only; a page opened fresh shows "Connecting…".

With a session, the editor binds Tiptap's `Collaboration` extension to the session's `Y.Doc` fragment instead of loading the stored body, shows the other users' carets with `CollaborationCaret`, and leaves undo history to Yjs (no `UndoRedo`). Remote changes do not mark the page dirty, and Save calls `session.save()` instead of saving the body. Without a provider, or when one fails (logged as a warning), the page is edited alone as before.

Remote caret updates preserve a local text selection that the browser has moved but has not yet reported through `selectionchange`, so simultaneous cursor movement does not redirect typing to an old position.

The session's document must be a `Y.Doc` from the `yjs` module this plugin exposes, so the provider and the editor share one Yjs.

## Shared modules

The manifest exposes `@tiptap/core`, `@tiptap/react`, the `@tiptap/pm/*` modules and `yjs` through the host import map. Plugins that write node views or raw extensions mark them as externals and get the editor's copy. React and `@docleus/sdk` come from the host.

## Testing

Unit tests run with `pnpm test`. The Playwright tests in `tests/e2e` build core, this plugin, and docleus-plugin-blocks-commonmark, then start `docleus serve --dev` on port 4319 with a temporary data directory:

```bash
pnpm exec playwright install chromium
pnpm e2e
```

## Development

Use Node.js 24 and pnpm 11.21.0. Keep this repository next to `docleus-core`
with its original directory name; the `link:` development dependencies need
that layout. Install core before this repository:

```sh
pnpm --dir ../docleus-core install --frozen-lockfile
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

`pnpm check` runs typecheck, lint, formatting, dependency boundaries, licenses,
and unit/in-process integration tests. Browser and external-service tests,
where provided, are separate and need the sibling repositories listed in
their setup files. The SDK is a host-provided peer dependency; packages remain
private and are not installed from npm. All extension points are experimental
before 1.0.

## Community

[Contributing](https://github.com/Docleus/.github/blob/main/CONTRIBUTING.md) &middot;
[Code of conduct](https://github.com/Docleus/.github/blob/main/CODE_OF_CONDUCT.md) &middot;
[Security](https://github.com/Docleus/.github/blob/main/SECURITY.md) &middot;
[Support](https://github.com/Docleus/.github/blob/main/SUPPORT.md)

## License

[MIT](LICENSE)

## Compatibility

Version `0.0.6` supports Docleus core and SDK `0.0.1`, `0.0.2`, `0.0.3`, `0.0.4`, `0.0.5` and `0.0.6` through
the matching `>=0.0.1 <0.0.7` manifest and SDK peer ranges.
