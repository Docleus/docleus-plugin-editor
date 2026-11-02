import { z, type BlockNode, type InlineNode } from "@docleus/sdk";

const attrsSchema = z.record(z.string(), z.unknown());

const markSchema = z.object({
  type: z.string().min(1),
  attrs: attrsSchema.optional(),
});

const inlineNodeSchema: z.ZodType<InlineNode> = z.lazy(() =>
  z.object({
    type: z.string().min(1),
    text: z.string().optional(),
    marks: z.array(markSchema).optional(),
    attrs: attrsSchema.optional(),
    content: z.array(inlineNodeSchema).optional(),
  }),
);

const blockNodeSchema: z.ZodType<BlockNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.string().min(1),
    v: z.number().int().min(1),
    attrs: attrsSchema,
    content: z.array(blockNodeSchema).optional(),
    inline: z.array(inlineNodeSchema).optional(),
  }),
);

/**
 * The block a passthrough block node holds, or `undefined` when the data is
 * not a block. Pasted HTML and shared documents bring this data from outside.
 */
export function parsePassthroughBlock(value: unknown): BlockNode | undefined {
  return blockNodeSchema.safeParse(value).data;
}

/** The inline node a passthrough inline node holds; see {@link parsePassthroughBlock}. */
export function parsePassthroughInline(value: unknown): InlineNode | undefined {
  return inlineNodeSchema.safeParse(value).data;
}
