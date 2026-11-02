import {
  BLOCK_ID_ATTR,
  BLOCK_VERSION_ATTR,
  type BlockViewProps,
  type EditorBlockDefinition,
  type EditorInlineDefinition,
  type EditorTag,
  type UiComponent,
} from "@docleus/sdk";
import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import type { ComponentType, JSX } from "react";

/** Plugin components are typed without React in the SDK. */
export function asComponent<Props>(
  component: UiComponent<Props>,
): ComponentType<Props> {
  return component as unknown as ComponentType<Props>;
}

export function blockAttrs(
  attrs: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const { [BLOCK_ID_ATTR]: _id, [BLOCK_VERSION_ATTR]: _v, ...rest } = attrs;
  return rest;
}

/** The tag of a node with these attrs. */
export function tagOf(
  tag: EditorTag | undefined,
  fallback: string,
): (attrs: Readonly<Record<string, unknown>>) => string {
  return (attrs) =>
    typeof tag === "function" ? tag(attrs) : (tag ?? fallback);
}

/**
 * Tiptap fixes the outer element when it creates the view, so a change of
 * tag makes ProseMirror recreate the view.
 */
function taggedView(
  Adapter: ComponentType<ReactNodeViewProps>,
  tagFor: (attrs: Readonly<Record<string, unknown>>) => string,
): NodeViewRenderer {
  return (props) => {
    const as = tagFor(props.node.attrs);
    return ReactNodeViewRenderer(Adapter, {
      as,
      update: ({ newNode, updateProps }) => {
        if (tagFor(newNode.attrs) !== as) return false;
        updateProps();
        return true;
      },
    })(props);
  };
}

function Content(props: { readonly as?: string }) {
  return (
    <NodeViewContent<keyof JSX.IntrinsicElements>
      as={(props.as ?? "div") as keyof JSX.IntrinsicElements}
    />
  );
}

const NO_CONTENT = () => null;

export function blockView(
  definition: EditorBlockDefinition,
  hasContent: boolean,
): NodeViewRenderer {
  const View = asComponent<BlockViewProps>(
    definition.view as UiComponent<BlockViewProps>,
  );
  const Adapter = (props: ReactNodeViewProps) => (
    <NodeViewWrapper data-type={props.node.type.name}>
      <View
        attrs={blockAttrs(props.node.attrs)}
        updateAttrs={props.updateAttributes}
        isSelected={props.selected}
        isEditable={props.editor.isEditable}
        Content={hasContent ? Content : NO_CONTENT}
      />
    </NodeViewWrapper>
  );
  return taggedView(Adapter, tagOf(definition.tag, "div"));
}

export function inlineView(
  definition: EditorInlineDefinition,
): NodeViewRenderer {
  const View = asComponent<Omit<BlockViewProps, "Content">>(
    definition.view as UiComponent<Omit<BlockViewProps, "Content">>,
  );
  // False positive: the rule does not see that `<View>` captures `View`.
  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const Adapter = (props: ReactNodeViewProps) => (
    <NodeViewWrapper as="span" data-type={props.node.type.name}>
      <View
        attrs={props.node.attrs}
        updateAttrs={props.updateAttributes}
        isSelected={props.selected}
        isEditable={props.editor.isEditable}
      />
    </NodeViewWrapper>
  );
  return taggedView(Adapter, tagOf(definition.tag, "span"));
}

/** The type of the block or inline node a passthrough node holds. */
export function passthroughType(node: PmNode): string {
  const held = (node.attrs.block ?? node.attrs.inline) as {
    type?: unknown;
  } | null;
  return typeof held?.type === "string" ? held.type : "unknown";
}

/**
 * A placeholder for content no enabled plugin can show. The node keeps the
 * content verbatim, so saving does not lose it.
 */
export function passthroughView(kind: "block" | "inline"): NodeViewRenderer {
  return ({ node }) => {
    const dom = document.createElement(kind === "block" ? "div" : "span");
    dom.className = `docleus-passthrough docleus-passthrough-${kind}`;
    dom.contentEditable = "false";
    dom.setAttribute("role", "note");
    const render = (current: PmNode) => {
      const type = passthroughType(current);
      dom.dataset.blockType = type;
      dom.textContent =
        kind === "block"
          ? `Unsupported block: ${type}. Enable its plugin to edit it.`
          : type;
      dom.title = `Unsupported ${kind === "block" ? "block" : "inline content"}: ${type}`;
    };
    render(node);
    return {
      dom,
      update(updated) {
        if (updated.type !== node.type) return false;
        render(updated);
        return true;
      },
    };
  };
}
