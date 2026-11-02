import { Context } from "@docleus/sdk";
import { describe, expect, it } from "vitest";
import { createEditorRegistry } from "./registry.ts";

const run = () => {};

const setup = () => {
  const root = new Context();
  const registry = createEditorRegistry(root);
  root.provide("editor", registry);
  return { root, registry };
};

describe("createEditorRegistry", () => {
  it("removes registrations when their plugin unloads", async () => {
    const { root, registry } = setup();
    let changes = 0;
    registry.subscribe(() => changes++);
    const fiber = await root.plugin({
      inject: ["editor"],
      apply(ctx: Context) {
        ctx.editor.registerBlock({
          type: "acme.callout",
          version: 1,
          content: "inline",
        });
        ctx.editor.registerSlashItem({
          id: "acme.callout",
          label: "Callout",
          run: () => {},
        });
      },
    });
    expect(registry.snapshot().blocks.map((block) => block.type)).toEqual([
      "acme.callout",
    ]);
    expect(changes).toBe(2);

    await fiber.dispose();
    expect(registry.snapshot().blocks).toEqual([]);
    expect(registry.snapshot().slash).toEqual([]);
    expect(changes).toBe(4);
  });

  it("keeps one snapshot per version", () => {
    const { registry } = setup();
    const first = registry.snapshot();
    expect(registry.snapshot()).toBe(first);
    registry.registerToolbarItem({ id: "a", label: "A", run: () => {} });
    const second = registry.snapshot();
    expect(second).not.toBe(first);
    expect(second.version).toBeGreaterThan(first.version);
  });

  it("sorts toolbar and slash items by order", () => {
    const { registry } = setup();
    registry.registerToolbarItem({ id: "b", label: "B", order: 2, run });
    registry.registerToolbarItem({ id: "a", label: "A", order: 1, run });
    registry.registerSlashItem({ id: "y", label: "Y", run });
    registry.registerSlashItem({ id: "x", label: "X", order: -1, run });
    const snapshot = registry.snapshot();
    expect(snapshot.toolbar.map((item) => item.id)).toEqual(["a", "b"]);
    expect(snapshot.slash.map((item) => item.id)).toEqual(["x", "y"]);
  });

  it("rejects core types", () => {
    const { registry } = setup();
    expect(() =>
      registry.registerBlock({
        type: "paragraph",
        version: 1,
        content: "inline",
      }),
    ).toThrow(expect.objectContaining({ code: "editor/core-type" }));
  });

  it("rejects a type registered twice, across kinds", () => {
    const { registry } = setup();
    registry.registerBlock({ type: "acme.x", version: 1, content: "atom" });
    expect(() => registry.registerInline({ type: "acme.x" })).toThrow(
      expect.objectContaining({ code: "editor/already-registered" }),
    );
  });

  it("rejects duplicate item ids", () => {
    const { registry } = setup();
    const item = { id: "a", label: "A", run: () => {} };
    registry.registerToolbarItem(item);
    expect(() => registry.registerToolbarItem(item)).toThrow(
      expect.objectContaining({ code: "editor/already-registered" }),
    );
  });

  it("lists collaboration providers, keeping the list while they stay", async () => {
    const { root, registry } = setup();
    const fiber = await root.plugin({
      inject: ["editor"],
      apply(ctx: Context) {
        ctx.editor.registerCollaboration(async () => undefined);
      },
    });
    const { collaborations } = registry.snapshot();
    expect(collaborations).toHaveLength(1);
    const target = { orgId: "o", spaceId: "s", branch: "main", entryId: "e" };
    expect(await collaborations[0]?.(target)).toBeUndefined();

    registry.registerToolbarItem({ id: "a", label: "A", run });
    expect(registry.snapshot().collaborations).toBe(collaborations);

    await fiber.dispose();
    expect(registry.snapshot().collaborations).toEqual([]);
  });
});
