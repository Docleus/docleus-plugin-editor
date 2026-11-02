import type {
  EditorCollaborationProvider,
  EditorCollaborationSession,
  EditorCollaborationTarget,
} from "@docleus/sdk";
import * as Y from "yjs";
import type { EditorCollaboration } from "./schema.ts";

/** A session the editor can bind to, with the parts it needs typed. */
export interface OpenSession {
  readonly session: EditorCollaborationSession;
  readonly binding: EditorCollaboration;
}

/**
 * Asks `providers` in order for a session on `target` and waits until it
 * has the server's state. Returns `undefined` when none offers one, or the
 * one that did fails to sync, so the page opens in single-user mode.
 * `onError` hears about providers that failed.
 */
export async function openCollaboration(
  providers: readonly EditorCollaborationProvider[],
  target: EditorCollaborationTarget,
  onError: (error: unknown) => void,
): Promise<OpenSession | undefined> {
  for (const provider of providers) {
    let session: EditorCollaborationSession | undefined;
    try {
      session = await provider(target);
      if (!session) continue;
      // The document must come from the same `yjs` as the editor's bindings.
      if (!(session.document instanceof Y.Doc)) {
        throw new TypeError(
          "the collaboration session's document is not a Y.Doc of the host's yjs",
        );
      }
      await session.synced;
      return {
        session,
        binding: {
          document: session.document,
          field: session.fragment,
          provider: session.provider,
          user: session.user,
        },
      };
    } catch (error) {
      session?.dispose();
      onError(error);
      return undefined;
    }
  }
  return undefined;
}
