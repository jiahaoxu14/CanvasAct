import z from 'zod'
import { SimpleShapeIdSchema } from '../types/ids-schema'

export const ActionPostconditionSchema = z.union([
	z.object({
		type: z.literal('created-shapes-exist'),
		shapeIds: z.array(SimpleShapeIdSchema),
	}),
	z.object({
		type: z.literal('no-overlap'),
		shapeIds: z.array(SimpleShapeIdSchema),
		allowedOverlap: z.number().optional(),
	}),
	z.object({
		type: z.literal('text-fits'),
		shapeIds: z.array(SimpleShapeIdSchema),
	}),
	z.object({
		type: z.literal('arrow-bindings'),
		shapeIds: z.array(SimpleShapeIdSchema),
	}),
	z.object({
		type: z.literal('labels-inside-containers'),
		pairs: z.array(
			z.object({
				labelId: SimpleShapeIdSchema,
				containerId: SimpleShapeIdSchema,
			})
		),
	}),
	z.object({
		type: z.literal('no-duplicate-arrows'),
	}),
	z.object({
		type: z.literal('objects-visible'),
		shapeIds: z.array(SimpleShapeIdSchema),
	}),
])

export function buildActionChunkSchema<T extends z.ZodType>(actionSchema: T) {
	return z
		.object({
			chunkId: z.string().optional(),
			intent: z.string(),
			actions: z.array(actionSchema).min(1),
			postconditions: z.array(ActionPostconditionSchema).optional(),
		})
		.meta({
			title: 'Action Chunk',
			description:
				'A short-horizon group of actions with one intent. The app applies actions as they stream and verifies the chunk after its final action.',
		})
}
