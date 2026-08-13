import z from 'zod'
import { ActionMeta, AgentAction, getActionSchemaForMode } from '../types/AgentAction'

/**
 * Internal meta keys that should be stripped from the JSON schema.
 * These are added via .meta() in action schemas but shouldn't be sent to the model.
 */
const INTERNAL_META_KEYS: Set<string> = new Set([
	'_systemPromptCategory',
] satisfies (keyof ActionMeta)[])

/**
 * Recursively strips internal meta fields from a JSON schema.
 * Only removes explicitly listed internal keys, preserving all other fields.
 */
export function stripInternalMeta(obj: object): object {
	if (Array.isArray(obj)) {
		return obj.map(stripInternalMeta)
	}
	if (obj && typeof obj === 'object') {
		return Object.fromEntries(
			Object.entries(obj)
				.filter(([key]) => !INTERNAL_META_KEYS.has(key))
				.map(([key, value]) => [key, stripInternalMeta(value)])
		)
	}
	return obj
}

export function buildResponseSchema(actionTypes: AgentAction['_type'][], mode: string) {
	const schema = buildResponseZodSchema(actionTypes, mode)

	return stripInternalMeta(z.toJSONSchema(schema, { reused: 'ref' }))
}

/**
 * Build the runtime response schema for an agent mode.
 *
 * Keep this as the single source of truth for both the JSON schema shown to the
 * model. CanvasAct intentionally uses the same top-level action response as
 * the original tldraw agent; its method difference is observation only.
 */
export function buildResponseZodSchema(actionTypes: AgentAction['_type'][], mode: string) {
	const actionSchemas = actionTypes
		.map((type) => getActionSchemaForMode(type, mode))
		.filter((schema) => schema !== undefined)

	if (actionSchemas.length === 0) {
		throw new Error('No action schemas found for the provided action types')
	}

	return z.object({ actions: z.array(z.union(actionSchemas)) })
}
