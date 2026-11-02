import {
  editorNodeName,
  type EditorBlockDefinition,
  type EditorShortcut,
} from "@docleus/sdk";
import {
  Extension,
  InputRule,
  textblockTypeInputRule,
  wrappingInputRule,
  type AnyExtension,
  type ExtendedRegExpMatchArray,
} from "@tiptap/core";
import type { NodeType } from "@tiptap/pm/model";

type Attrs = Readonly<Record<string, unknown>>;
type RuleProps = Parameters<InputRule["handler"]>[0];

interface Candidate {
  readonly rule: InputRule;
  readonly match: RegExpExecArray;
}

/** A shortcut of one block, ready to match. */
interface Shortcut {
  readonly pattern: RegExp;
  readonly rank: string;
  readonly ruleFor: (type: NodeType) => InputRule;
  readonly type: string;
}

/**
 * The number of matched characters outside capture groups: the text a
 * pattern spells out literally rather than accepts as a variable part.
 */
export function specificity(match: RegExpExecArray): number {
  const [start = 0, end = start] = match.indices?.[0] ?? [];
  const covered = new Set<number>();
  for (const range of (match.indices ?? []).slice(1)) {
    if (range === undefined) continue;
    for (let i = range[0]; i < range[1]; i += 1) covered.add(i);
  }
  return end - start - covered.size;
}

function attributesOf(shortcut: EditorShortcut) {
  return (match: readonly string[]): Attrs => ({ ...shortcut.attrs?.(match) });
}

/**
 * Inserts the atom before the textblock and removes the typed shortcut.
 * Tiptap's `nodeInputRule` replaces only the first capture group, which is
 * meant for inline nodes.
 */
function atomRule(config: {
  find: RegExp;
  type: NodeType;
  getAttributes: (match: readonly string[]) => Attrs;
}): InputRule {
  return new InputRule({
    find: config.find,
    handler: ({ state, range, match }) => {
      const $from = state.doc.resolve(range.from);
      const at = $from.before();
      if (
        !$from
          .node(-1)
          .canReplaceWith($from.index(-1), $from.index(-1), config.type)
      ) {
        return null;
      }
      state.tr
        .delete(range.from, range.to)
        .insert(at, config.type.create(config.getAttributes(match)))
        .scrollIntoView();
      return undefined;
    },
  });
}

/**
 * Wraps the textblock in the container, or, when the textblock already starts
 * a container of that type, merges the attrs into it instead of nesting.
 */
function containerRule(config: {
  find: RegExp;
  type: NodeType;
  getAttributes: (match: readonly string[]) => Attrs;
}): InputRule {
  const wrap = wrappingInputRule(config);
  return new InputRule({
    find: config.find,
    handler: (props) => {
      const { state, range, match } = props;
      const $from = state.doc.resolve(range.from);
      const depth = $from.depth - 1;
      const container = depth > 0 ? $from.node(depth) : undefined;
      if (container?.type !== config.type || $from.index(depth) !== 0) {
        return wrap.handler(props);
      }
      const tr = state.tr.delete(range.from, range.to);
      tr.setNodeMarkup($from.before(depth), undefined, {
        ...container.attrs,
        ...config.getAttributes(match),
      });
      return undefined;
    },
  });
}

function shortcutsOf(definition: EditorBlockDefinition): Shortcut[] {
  return (definition.shortcuts ?? []).map((shortcut, i) => {
    const flags = shortcut.pattern.flags.replace("g", "").replace("y", "");
    const pattern = new RegExp(
      shortcut.pattern.source,
      flags.includes("d") ? flags : `${flags}d`,
    );
    const getAttributes = attributesOf(shortcut);
    return {
      pattern,
      rank: `${definition.type}\u0000${String(i).padStart(4, "0")}`,
      type: editorNodeName(definition.type),
      ruleFor: (type) => {
        const config = { find: pattern, type, getAttributes };
        if (definition.content === "inline") {
          return textblockTypeInputRule(config);
        }
        if (definition.content === "blocks") return containerRule(config);
        return atomRule(config);
      },
    };
  });
}

/**
 * All block shortcuts as one input rule, so that the outcome does not depend
 * on the order plugins registered their blocks: of the shortcuts that match,
 * the most specific one (see {@link specificity}) applies first, ties going
 * to the block type that sorts first. When a shortcut cannot apply, such as
 * a container that cannot wrap the textblock there, the next one is tried.
 */
export function blockShortcuts(
  definitions: readonly EditorBlockDefinition[],
): AnyExtension {
  const shortcuts = definitions
    .flatMap(shortcutsOf)
    .toSorted((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
  return Extension.create({
    name: "docleusBlockShortcuts",
    addInputRules() {
      const { schema } = this.editor;
      const rules = shortcuts.flatMap((shortcut) => {
        const type = schema.nodes[shortcut.type];
        return type ? [{ shortcut, rule: shortcut.ruleFor(type) }] : [];
      });
      if (rules.length === 0) return [];
      const candidatesOf = (text: string): Candidate[] =>
        rules
          .flatMap(({ shortcut, rule }) => {
            const match = shortcut.pattern.exec(text);
            return match ? [{ rule, match }] : [];
          })
          // A stable sort keeps the rank order between equal specificities.
          .toSorted((a, b) => specificity(b.match) - specificity(a.match));
      return [
        new InputRule({
          find: (text) => {
            const candidates = candidatesOf(text);
            const best = candidates[0];
            if (!best) return null;
            return {
              index: best.match.index,
              text: best.match[0],
              data: { candidates },
            };
          },
          handler: (props) => applyFirst(props),
        }),
      ];
    },
  });
}

function applyFirst(props: RuleProps): void | null {
  const { match, range, state } = props;
  const data = (match as ExtendedRegExpMatchArray).data as
    { candidates?: readonly Candidate[] } | undefined;
  for (const candidate of data?.candidates ?? []) {
    const steps = state.tr.steps.length;
    const from = range.from + match[0].length - candidate.match[0].length;
    const result = candidate.rule.handler({
      ...props,
      range: { from, to: range.to },
      match: candidate.match,
    });
    if (result !== null && state.tr.steps.length > steps) return undefined;
  }
  return null;
}
