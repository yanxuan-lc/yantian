/** Shared result plumbing: typed outcomes, failure facts and model documents. */
import type { ModelDocumentInput, ModelFormatContext, ToolBusinessResult } from '@eum-agent/plugin'
import { z } from 'zod'
import { ChartInputError } from './errors.ts'

/** Saved failure fact of a call whose input could not be charted. */
export const ToolFailureSchema = z
  .object({ failed: z.literal(true), message: z.string().max(1000) })
  .strict()
/** Saved failure fact. */
export type ToolFailure = z.infer<typeof ToolFailureSchema>

/** Business data of a chart tool: the chart itself, or the input failure. */
export function outcomeSchema<S extends z.ZodType>(chart: S) {
  return z.union([chart, ToolFailureSchema])
}

/** Largest text placed inline in a model document; longer text goes into a derived body. */
const INLINE_TEXT_BYTES = 4 * 1024

/** Converts a rejected input into a failure result; rethrows anything else. */
export function failureResult(error: unknown): ToolBusinessResult<ToolFailure> {
  if (!(error instanceof ChartInputError)) throw error
  return {
    data: { failed: true, message: error.message.slice(0, 1000) },
    execution: { state: 'not-started' },
    isError: true,
    error: { code: 'invalid_chart_input', retryable: true },
  }
}

/** Whether saved data is a failure fact. */
export function isFailure(data: unknown): data is ToolFailure {
  return typeof data === 'object' && data !== null && 'failed' in data
}

/**
 * Builds the model document for `text`: one literal when it fits, otherwise one derived
 * UTF-8 body written under the call's reservation and referenced by a text range.
 */
export async function textDocument(
  text: string,
  ctx: ModelFormatContext,
): Promise<ModelDocumentInput> {
  const bytes = new TextEncoder().encode(text)
  if (bytes.byteLength <= INLINE_TEXT_BYTES) {
    return { formatVersion: 1, rendererVersion: 1, nodes: [{ id: 'text', kind: 'literal', text }] }
  }
  const writer = await ctx.openBody('utf8-text', ctx.signal)
  try {
    const chunk = 64 * 1024
    for (let offset = 0; offset < bytes.byteLength; offset += chunk) {
      await writer.write(offset, bytes.subarray(offset, offset + chunk), ctx.signal)
    }
    const { body } = await writer.seal(ctx.signal)
    return {
      formatVersion: 1,
      rendererVersion: 1,
      nodes: [{ id: 'text', kind: 'text-range', body, startByte: 0, endByte: body.byteLength }],
    }
  } catch (error) {
    await writer.abort()
    throw error
  }
}
