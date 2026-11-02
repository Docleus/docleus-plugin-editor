import {
  BLOCK_ID_ATTR,
  BLOCK_VERSION_ATTR,
  PASSTHROUGH_BLOCK,
  type BlockNode,
} from "@docleus/sdk";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { parsePassthroughBlock } from "./passthrough.ts";

const ID_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const ID_LENGTH = 10;

export function createBlockId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  let id = "";
  for (const byte of bytes) id += ID_ALPHABET[byte & 63];
  return id;
}

/**
 * Whether the transaction applies changes from the shared document, which
 * are another user's: not this user's to save or to give ids to.
 */
export function isRemote(transaction: Transaction): boolean {
  const meta: unknown = transaction.getMeta(ySyncPluginKey);
  return (
    typeof meta === "object" &&
    meta !== null &&
    "isChangeOrigin" in meta &&
    meta.isChangeOrigin === true
  );
}

function collectIds(block: BlockNode, into: Set<string>): void {
  into.add(block.id);
  for (const child of block.content ?? []) collectIds(child, into);
}

function withFreshIds(block: BlockNode): BlockNode {
  return {
    ...block,
    id: createBlockId(),
    ...(block.content && { content: block.content.map(withFreshIds) }),
  };
}

/**
 * Gives every block node a unique id and a schema version. New nodes (split,
 * pasted, created by commands) arrive without them; copies arrive with a
 * duplicate id. `versions` maps editor node names to the version new blocks
 * of that type get. Remote changes are skipped: their author's editor already
 * gave them ids, and fixing them here too would make both sides race to
 * replace each other's ids.
 */
export function blockIdPlugin(versions: ReadonlyMap<string, number>): Plugin {
  return new Plugin({
    key: new PluginKey("docleusBlockIds"),
    appendTransaction(transactions, _old, state) {
      if (!transactions.some((tr) => tr.docChanged && !isRemote(tr))) {
        return null;
      }
      const seen = new Set<string>();
      const tr = state.tr;
      const fix = (node: PmNode, pos: number) => {
        const version = versions.get(node.type.name);
        if (version === undefined) return;
        const attrs = { ...node.attrs };
        let isChanged = false;
        const id = attrs[BLOCK_ID_ATTR];
        if (typeof id !== "string" || id === "" || seen.has(id)) {
          attrs[BLOCK_ID_ATTR] = createBlockId();
          isChanged = true;
        }
        seen.add(String(attrs[BLOCK_ID_ATTR]));
        if (attrs[BLOCK_VERSION_ATTR] === null) {
          attrs[BLOCK_VERSION_ATTR] = version;
          isChanged = true;
        }
        if (node.type.name === PASSTHROUGH_BLOCK) {
          const block = parsePassthroughBlock(attrs.block);
          if (block) {
            const inner = new Set<string>();
            for (const child of block.content ?? []) collectIds(child, inner);
            const kept = [...inner].some((childId) => seen.has(childId))
              ? { ...block, content: block.content?.map(withFreshIds) }
              : block;
            if (kept !== block) {
              attrs.block = kept;
              isChanged = true;
            }
            for (const child of kept.content ?? []) collectIds(child, seen);
          }
        }
        if (isChanged) tr.setNodeMarkup(pos, undefined, attrs);
      };
      state.doc.descendants((node, pos) => {
        fix(node, pos);
        return !node.isTextblock;
      });
      return tr.steps.length > 0 ? tr : null;
    },
  });
}
