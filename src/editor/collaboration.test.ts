import type {
  EditorCollaborationProvider,
  EditorCollaborationSession,
} from "@docleus/sdk";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { openCollaboration } from "./collaboration.ts";

const TARGET = { orgId: "o", spaceId: "s", branch: "cr/1", entryId: "e" };

function sessionWith(
  overrides: Partial<EditorCollaborationSession> = {},
): EditorCollaborationSession & { readonly disposed: () => number } {
  let disposals = 0;
  return {
    document: new Y.Doc(),
    fragment: "default",
    provider: {},
    user: { name: "Alice", color: "#3b82f6" },
    synced: Promise.resolve(),
    save: async () => {},
    dispose: () => {
      disposals += 1;
    },
    disposed: () => disposals,
    ...overrides,
  };
}

describe("openCollaboration", () => {
  it("takes the first session offered, once it has synced", async () => {
    const session = sessionWith();
    const asked: string[] = [];
    const providers: EditorCollaborationProvider[] = [
      async (target) => {
        asked.push(`first:${target.branch}`);
        return undefined;
      },
      async () => {
        asked.push("second");
        return session;
      },
      async () => {
        asked.push("third");
        return sessionWith();
      },
    ];
    const opened = await openCollaboration(providers, TARGET, () => {});
    expect(asked).toEqual(["first:cr/1", "second"]);
    expect(opened?.session).toBe(session);
    expect(opened?.binding).toEqual({
      document: session.document,
      field: "default",
      provider: session.provider,
      user: session.user,
    });
  });

  it("returns nothing when no provider offers a session", async () => {
    expect(await openCollaboration([], TARGET, () => {})).toBeUndefined();
    expect(
      await openCollaboration([async () => undefined], TARGET, () => {}),
    ).toBeUndefined();
  });

  it("falls back to single-user mode when a session fails to sync", async () => {
    const failure = new Error("refused");
    const session = sessionWith({ synced: Promise.reject(failure) });
    const errors: unknown[] = [];
    const opened = await openCollaboration(
      [async () => session],
      TARGET,
      (error) => errors.push(error),
    );
    expect(opened).toBeUndefined();
    expect(errors).toEqual([failure]);
    expect(session.disposed()).toBe(1);
  });

  it("refuses a document from another copy of yjs", async () => {
    const session = sessionWith({ document: { getXmlFragment: () => ({}) } });
    const errors: unknown[] = [];
    expect(
      await openCollaboration([async () => session], TARGET, (error) =>
        errors.push(error),
      ),
    ).toBeUndefined();
    expect(errors).toEqual([expect.any(TypeError)]);
    expect(session.disposed()).toBe(1);
  });

  it("reports a provider that throws", async () => {
    const errors: unknown[] = [];
    const providers: EditorCollaborationProvider[] = [
      async () => {
        throw new Error("offline");
      },
    ];
    expect(
      await openCollaboration(providers, TARGET, (error) => errors.push(error)),
    ).toBeUndefined();
    expect(errors).toEqual([new Error("offline")]);
  });
});
