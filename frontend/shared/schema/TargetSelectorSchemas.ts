import z from 'zod'
import { SimpleShapeIdSchema } from '../types/ids-schema'

const TargetSelectorBase = {
	description: z.string().optional(),
	expect: z
		.enum(['one', 'many'])
		.optional()
		.meta({
			description:
				'Use "one" when exactly one shape should be resolved. If multiple candidates match, local resolution fails safely instead of editing the wrong shape.',
		}),
	max: z.number().int().positive().optional(),
	includeLocked: z.boolean().optional(),
	includeHidden: z.boolean().optional(),
}

const RegionSchema = z.object({
	x: z.number(),
	y: z.number(),
	w: z.number(),
	h: z.number(),
	coordinateSpace: z.enum(['prompt', 'page']).optional(),
})

const PointSchema = z.object({
	x: z.number(),
	y: z.number(),
	coordinateSpace: z.enum(['prompt', 'page']).optional(),
})

const TextMatchModeSchema = z.enum(['contains', 'exact', 'regex'])

export const SelectedShapesTargetSelectorSchema = z
	.object({
		_type: z.literal('selected'),
		...TargetSelectorBase,
	})
	.meta({
		title: 'Selected Shapes Selector',
		description:
			'Resolve the shapes the user currently has selected. Prefer this for "this" or "these".',
	})

export const ContextShapesTargetSelectorSchema = z
	.object({
		_type: z.literal('context'),
		...TargetSelectorBase,
		source: z.enum(['agent', 'user', 'any']).optional(),
	})
	.meta({
		title: 'Context Shapes Selector',
		description: 'Resolve shapes explicitly supplied as request context.',
	})

export const ExplicitIdsTargetSelectorSchema = z
	.object({
		_type: z.literal('ids'),
		...TargetSelectorBase,
		shapeIds: z.array(SimpleShapeIdSchema),
	})
	.meta({
		title: 'Explicit Ids Selector',
		description: 'Resolve explicit simple shape ids.',
	})

export const InsideRegionTargetSelectorSchema = z
	.object({
		_type: z.literal('inside-region'),
		...TargetSelectorBase,
		region: RegionSchema,
		shapeTypes: z.array(z.string()).optional(),
	})
	.meta({
		title: 'Inside Region Selector',
		description: 'Resolve shapes fully inside a page-space or prompt-space region.',
	})

export const IntersectingRegionTargetSelectorSchema = z
	.object({
		_type: z.literal('intersecting-region'),
		...TargetSelectorBase,
		region: RegionSchema,
		shapeTypes: z.array(z.string()).optional(),
	})
	.meta({
		title: 'Intersecting Region Selector',
		description: 'Resolve shapes that intersect a page-space or prompt-space region.',
	})

export const TextTargetSelectorSchema = z
	.object({
		_type: z.literal('text'),
		...TargetSelectorBase,
		text: z.string(),
		match: TextMatchModeSchema.optional(),
		caseSensitive: z.boolean().optional(),
		searchNotes: z.boolean().optional(),
		shapeTypes: z.array(z.string()).optional(),
	})
	.meta({
		title: 'Text Selector',
		description:
			'Resolve shapes whose visible text, and optionally note, matches the query. When the user names a target by text and exactly one shape should be edited, use expect:"one" so duplicate labels fail safely instead of editing one arbitrary match.',
	})

export const TypeTargetSelectorSchema = z
	.object({
		_type: z.literal('type'),
		...TargetSelectorBase,
		shapeTypes: z.array(z.string()).min(1),
	})
	.meta({
		title: 'Type Selector',
		description: 'Resolve shapes by focused type or underlying tldraw subtype.',
	})

export const ConnectedToTargetSelectorSchema = z
	.object({
		_type: z.literal('connected-to'),
		...TargetSelectorBase,
		shapeId: SimpleShapeIdSchema,
		includeArrows: z.boolean().optional(),
		includeSourceAndTarget: z.boolean().optional(),
	})
	.meta({
		title: 'Connected Selector',
		description: 'Resolve shapes and optionally arrows connected to a shape by arrow bindings.',
	})

export const TileTargetSelectorSchema = z
	.object({
		_type: z.literal('tile'),
		...TargetSelectorBase,
		tileId: z.string().optional(),
		detailLevel: z.enum(['viewport', 'nearby', 'far']).optional(),
		direction: z.string().optional(),
		shapeTypes: z.array(z.string()).optional(),
	})
	.meta({
		title: 'Tile Selector',
		description: 'Resolve shapes summarized in a CanvasObservation spatial tile.',
	})

export const NearestTargetSelectorSchema = z
	.object({
		_type: z.literal('nearest'),
		...TargetSelectorBase,
		point: PointSchema,
		shapeTypes: z.array(z.string()).optional(),
	})
	.meta({
		title: 'Nearest Selector',
		description: 'Resolve the nearest shape to a point.',
	})

export const LabelsOfSelectedTargetSelectorSchema = z
	.object({
		_type: z.literal('labels-of-selected'),
		...TargetSelectorBase,
	})
	.meta({
		title: 'Labels Of Selected Selector',
		description: 'Resolve text/note label candidates related to the selected shapes.',
	})

export const ArrowsConnectedToSelectedTargetSelectorSchema = z
	.object({
		_type: z.literal('arrows-connected-to-selected'),
		...TargetSelectorBase,
	})
	.meta({
		title: 'Arrows Connected To Selected Selector',
		description: 'Resolve arrow shapes connected to currently selected shapes.',
	})

export const TargetSelectorSchema = z
	.union([
		SelectedShapesTargetSelectorSchema,
		ContextShapesTargetSelectorSchema,
		ExplicitIdsTargetSelectorSchema,
		InsideRegionTargetSelectorSchema,
		IntersectingRegionTargetSelectorSchema,
		TextTargetSelectorSchema,
		TypeTargetSelectorSchema,
		ConnectedToTargetSelectorSchema,
		TileTargetSelectorSchema,
		NearestTargetSelectorSchema,
		LabelsOfSelectedTargetSelectorSchema,
		ArrowsConnectedToSelectedTargetSelectorSchema,
	])
	.meta({
		title: 'Target Selector',
		description:
			'A deterministic selector for resolving target shapes locally from selection, context, ids, geometry, text, type, relations, tiles, or proximity. Prefer selectors over hard-coded ids when user language could match multiple objects; set expect:"one" when ambiguity should stop the edit.',
	})

export type TargetSelector = z.infer<typeof TargetSelectorSchema>
