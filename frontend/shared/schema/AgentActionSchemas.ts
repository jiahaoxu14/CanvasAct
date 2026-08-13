import z from 'zod'
import { FocusedColor } from '../format/FocusedColor'
import { FocusedFillSchema } from '../format/FocusedFill'
import { FocusedShapeSchema, FocusedTextAnchorSchema } from '../format/FocusedShape'
import { SimpleShapeIdSchema, TodoIdSchema } from '../types/ids-schema'
import { TargetSelectorSchema } from './TargetSelectorSchemas'

/**
 * `_systemPromptCategory` is used for system prompt generation
 * but is stripped from the JSON schema sent to the model.
 *
 * See `SystemPromptCategory.ts` for available values.
 */

const ActionRegionSchema = z.object({
	x: z.number(),
	y: z.number(),
	w: z.number(),
	h: z.number(),
	coordinateSpace: z.enum(['prompt', 'page']).optional(),
})

// Add Detail Action
export const AddDetailAction = z
	.object({
		_type: z.literal('add-detail'),
		intent: z.string(),
	})
	.meta({
		title: 'Add Detail',
		description: 'The AI plans further work so that it can add detail to its work.',
	})

export type AddDetailAction = z.infer<typeof AddDetailAction>

// Align Action
export const AlignAction = z
	.object({
		_type: z.literal('align'),
		alignment: z.enum(['top', 'bottom', 'left', 'right', 'center-horizontal', 'center-vertical']),
		intent: z.string(),
		shapeIds: z.array(SimpleShapeIdSchema).optional(),
		targetSelector: TargetSelectorSchema.optional(),
	})
	.meta({
		title: 'Align',
		description:
			'The AI aligns shapes on one axis without changing their spacing on the other axis. Pair align with stack when a row or column also needs an exact non-overlapping gap. Prefer targetSelector for selected/context/semantic targets; use shapeIds only when ids are explicit and unambiguous.',
		_systemPromptCategory: 'edit',
	})

export type AlignAction = z.infer<typeof AlignAction>

// Bring to Front Action
export const BringToFrontAction = z
	.object({
		_type: z.literal('bringToFront'),
		intent: z.string(),
		shapeIds: z.array(SimpleShapeIdSchema).optional(),
		targetSelector: TargetSelectorSchema.optional(),
	})
	.meta({
		title: 'Bring to Front',
		description:
			'The AI brings one or more shapes to the front so that they appear in front of everything else.',
		_systemPromptCategory: 'edit',
	})

export type BringToFrontAction = z.infer<typeof BringToFrontAction>

// Clear Action
export const ClearAction = z
	.object({
		_type: z.literal('clear'),
	})
	.meta({
		title: 'Clear',
		description: 'The agent deletes all shapes on the canvas.',
	})

export type ClearAction = z.infer<typeof ClearAction>

// Count Shapes Action
export const CountShapesAction = z
	.object({
		_type: z.literal('count'),
		expression: z.string(),
	})
	.meta({
		title: 'Count',
		description:
			'The AI requests to count the number of shapes in the canvas. The answer will be provided to the AI in a follow-up request.',
	})

export type CountShapesAction = z.infer<typeof CountShapesAction>

// Country Info Action
export const CountryInfoAction = z
	.object({
		_type: z.literal('countryInfo'),
		code: z.string(),
	})
	.meta({
		title: 'Country info',
		description:
			'The AI gets information about a country by providing its country code, eg: "de" for Germany.',
	})

export type CountryInfoAction = z.infer<typeof CountryInfoAction>

// Create Action
export const CreateAction = z
	.object({
		_type: z.literal('create'),
		intent: z.string(),
		shape: FocusedShapeSchema,
	})
	.meta({ title: 'Create', description: 'The AI creates a new shape.' })

export type CreateAction = z.infer<typeof CreateAction>

// Delete Action
export const DeleteAction = z
	.object({
		_type: z.literal('delete'),
		intent: z.string(),
		shapeId: SimpleShapeIdSchema,
	})
	.meta({ title: 'Delete', description: 'The AI deletes a shape.', _systemPromptCategory: 'edit' })

export type DeleteAction = z.infer<typeof DeleteAction>

// Distribute Action
export const DistributeAction = z
	.object({
		_type: z.literal('distribute'),
		direction: z.enum(['horizontal', 'vertical']),
		intent: z.string(),
		shapeIds: z.array(SimpleShapeIdSchema).optional(),
		targetSelector: TargetSelectorSchema.optional(),
	})
	.meta({
		title: 'Distribute',
		description: 'The AI distributes shapes horizontally or vertically.',
		_systemPromptCategory: 'edit',
	})

export type DistributeAction = z.infer<typeof DistributeAction>

// Label Action
export const LabelAction = z
	.object({
		_type: z.literal('label'),
		intent: z.string(),
		shapeId: SimpleShapeIdSchema,
		text: z.string(),
	})
	.meta({
		title: 'Label',
		description: "The AI changes a shape's text.",
		_systemPromptCategory: 'edit',
	})

export type LabelAction = z.infer<typeof LabelAction>

// Arrange Action
export const ArrangeAction = z
	.object({
		_type: z.literal('arrange'),
		intent: z.string(),
		layout: z.enum(['row', 'column', 'grid', 'flow', 'radial', 'stack']),
		shapeIds: z.array(SimpleShapeIdSchema).optional(),
		targetSelector: TargetSelectorSchema.optional(),
		region: ActionRegionSchema.optional(),
		gap: z.number().optional(),
		columns: z.number().int().positive().optional(),
		direction: z.enum(['horizontal', 'vertical']).optional(),
	})
	.meta({
		title: 'Arrange',
		description:
			'The AI arranges multiple shapes into a row, column, grid, flow, radial layout, or stack. Prefer this over many move actions for common layout tasks.',
		_systemPromptCategory: 'edit',
	})

export type ArrangeAction = z.infer<typeof ArrangeAction>

// Fit Text Action
export const FitTextAction = z
	.object({
		_type: z.literal('fitText'),
		intent: z.string(),
		shapeIds: z.array(SimpleShapeIdSchema).optional(),
		targetSelector: TargetSelectorSchema.optional(),
		containerShapeIds: z.array(SimpleShapeIdSchema).optional(),
		containerSelector: TargetSelectorSchema.optional(),
		strategy: z
			.enum(['widen-container', 'wrap-text', 'shrink-text', 'shorten-label', 'move-label'])
			.optional(),
		maxWidth: z.number().optional(),
		maxCharacters: z.number().int().positive().optional(),
	})
	.meta({
		title: 'Fit Text',
		description:
			'The AI repairs overflowing or badly placed text by widening containers, wrapping text, shrinking text, shortening labels, or moving labels into containers.',
		_systemPromptCategory: 'edit',
	})

export type FitTextAction = z.infer<typeof FitTextAction>

// Connect Action
export const ConnectAction = z
	.object({
		_type: z.literal('connect'),
		intent: z.string(),
		sourceShapeIds: z.array(SimpleShapeIdSchema).optional(),
		targetShapeIds: z.array(SimpleShapeIdSchema).optional(),
		sourceSelector: TargetSelectorSchema.optional(),
		targetSelector: TargetSelectorSchema.optional(),
		relationLabel: z.string().optional(),
		avoidDuplicates: z.boolean().optional(),
		createdShapeIds: z.array(SimpleShapeIdSchema).optional(),
	})
	.meta({
		title: 'Connect',
		description:
			'The AI creates bound arrows between resolved source and target shapes. It avoids duplicate arrows by default.',
		_systemPromptCategory: 'edit',
	})

export type ConnectAction = z.infer<typeof ConnectAction>

// Cleanup Layout Action
export const CleanupLayoutAction = z
	.object({
		_type: z.literal('cleanupLayout'),
		intent: z.string(),
		shapeIds: z.array(SimpleShapeIdSchema).optional(),
		targetSelector: TargetSelectorSchema.optional(),
		strategy: z.enum(['separate-overlaps', 'grid', 'horizontal', 'vertical']).optional(),
		gap: z.number().optional(),
		avoidMovingLocked: z.boolean().optional(),
	})
	.meta({
		title: 'Cleanup Layout',
		description:
			'The AI repairs layout issues such as overlapping or cramped shapes without manually moving each shape.',
		_systemPromptCategory: 'edit',
	})

export type CleanupLayoutAction = z.infer<typeof CleanupLayoutAction>

// Repair Dashboard Action
export const RepairDashboardAction = z
	.object({
		_type: z.literal('repairDashboard'),
		intent: z.string(),
		sections: z
			.array(
				z.object({
					containerShapeId: SimpleShapeIdSchema,
					shapeIds: z.array(SimpleShapeIdSchema).min(1),
					layout: z.enum(['row', 'column']),
					gap: z.number().nonnegative().optional(),
					padding: z.number().nonnegative().optional(),
					headerHeight: z.number().nonnegative().optional(),
					alignX: z.enum(['start', 'center', 'end']).optional(),
					alignY: z.enum(['start', 'center', 'end']).optional(),
				})
			)
			.min(1),
		textShapeIds: z.array(SimpleShapeIdSchema).optional(),
		preservedArrowIds: z.array(SimpleShapeIdSchema).optional(),
	})
	.meta({
		title: 'Repair Dashboard',
		description:
			'The AI repairs a dashboard through section plans. In one deterministic action, the app fits movable content, lays each group out inside its fixed container, avoids overlap, preserves existing bound relationships, and verifies containment, text fit, spacing, and arrow bindings.',
		_systemPromptCategory: 'edit',
	})

export type RepairDashboardAction = z.infer<typeof RepairDashboardAction>

// Organize Board Action
export const OrganizeBoardAction = z
	.object({
		_type: z.literal('organizeBoard'),
		intent: z.string(),
		groups: z
			.array(
				z.object({
					containerShapeId: SimpleShapeIdSchema,
					shapeIds: z.array(SimpleShapeIdSchema).min(1),
					layout: z.enum(['row', 'column']),
					gap: z.number().nonnegative().optional(),
					padding: z.number().nonnegative().optional(),
					headerHeight: z.number().nonnegative().optional(),
					alignX: z.enum(['start', 'center', 'end']).optional(),
					alignY: z.enum(['start', 'center', 'end']).optional(),
				})
			)
			.min(1),
		textShapeIds: z.array(SimpleShapeIdSchema).optional(),
		preservedArrowIds: z.array(SimpleShapeIdSchema).optional(),
		expectedConnections: z
			.array(
				z.object({
					arrowId: SimpleShapeIdSchema,
					sourceId: SimpleShapeIdSchema,
					targetId: SimpleShapeIdSchema,
				})
			)
			.optional()
			.describe(
				'Runtime-derived relationship endpoints. Omit this field; the app overwrites it from the pre-action canvas.'
			),
	})
	.meta({
		title: 'Organize Board',
		description:
			'The AI supplies relation-aware groups and their exact reading order. In one deterministic operation, the app fits and lays out movable objects inside fixed containers, preserves named bound relationships, leaves non-target content untouched, and verifies the completed board.',
		_systemPromptCategory: 'edit',
	})

export type OrganizeBoardAction = z.infer<typeof OrganizeBoardAction>

// Build Flow Action
export const BuildFlowAction = z
	.object({
		_type: z.literal('buildFlow'),
		intent: z.string(),
		shapeIds: z.array(SimpleShapeIdSchema).min(2),
		containerShapeId: SimpleShapeIdSchema.optional(),
		direction: z.enum(['horizontal', 'vertical']),
		gap: z.number().nonnegative().optional(),
		region: ActionRegionSchema.optional(),
		createArrows: z.boolean().optional(),
		repairExistingConnectors: z.boolean().optional(),
		createdShapeIds: z.array(SimpleShapeIdSchema).optional(),
		flowArrowIds: z.array(SimpleShapeIdSchema).optional(),
	})
	.meta({
		title: 'Build Flow',
		description:
			'The AI turns an ordered list of shapes into one deterministic horizontal or vertical flow. The array order is the required reading order. In one action, the app spaces the shapes inside the active workspace, keeps exactly one canonical bound arrow between adjacent steps, and removes stale, duplicate, contradictory, or noncanonical connectors among those steps. Do not pair this with separate move, delete, or connect actions.',
		_systemPromptCategory: 'edit',
	})

export type BuildFlowAction = z.infer<typeof BuildFlowAction>

// Annotate Group Action
export const AnnotateGroupAction = z
	.object({
		_type: z.literal('annotateGroup'),
		intent: z.string(),
		text: z.string(),
		shapeIds: z.array(SimpleShapeIdSchema).optional(),
		targetSelector: TargetSelectorSchema.optional(),
		placement: z.enum(['top', 'bottom', 'left', 'right', 'center']).optional(),
		annotationType: z.enum(['text', 'note']).optional(),
		createdShapeIds: z.array(SimpleShapeIdSchema).optional(),
	})
	.meta({
		title: 'Annotate Group',
		description:
			'The AI creates a heading or note annotation for a resolved group of shapes.',
		_systemPromptCategory: 'edit',
	})

export type AnnotateGroupAction = z.infer<typeof AnnotateGroupAction>

// Message Action
export const MessageAction = z
	.object({
		_type: z.literal('message'),
		text: z.string(),
	})
	.meta({ title: 'Message', description: 'The AI sends a message to the user.' })

export type MessageAction = z.infer<typeof MessageAction>

// Move Action
export const MoveAction = z
	.object({
		_type: z.literal('move'),
		intent: z.string(),
		anchor: FocusedTextAnchorSchema,
		shapeId: SimpleShapeIdSchema.optional(),
		targetSelector: TargetSelectorSchema.optional(),
		x: z.number(),
		y: z.number(),
	})
	.meta({
		title: 'Move',
		description:
			'The agent moves one shape to a new position. Prefer targetSelector with expect:"one" when the user refers to a selected, contextual, or text-matched target; use shapeId only when the id is unambiguous.',
		_systemPromptCategory: 'edit',
	})

export type MoveAction = z.infer<typeof MoveAction>

// Pen Action
export const PenAction = z
	.object({
		_type: z.literal('pen'),
		shapeId: SimpleShapeIdSchema,
		color: FocusedColor,
		closed: z.boolean(),
		fill: FocusedFillSchema,
		intent: z.string(),
		points: z.array(
			z.object({
				x: z.number(),
				y: z.number(),
			})
		),
		style: z.enum(['smooth', 'straight']),
	})
	.meta({
		title: 'Pen',
		description:
			'The AI draws a freeform line with a pen. This is useful for drawing custom paths that are not available with the other available shapes. The "smooth" style will automatically smooth the line between points. The "straight" style will render a straight line between points. The "closed" property will determine if the drawn line gets automatically closed to form a complete shape or not. Remember that the pen will be *down* until the action is over. If you want to lift up the pen, start a new pen action.',
	})

export type PenAction = z.infer<typeof PenAction>

// Place Action
export const PlaceAction = z
	.object({
		_type: z.literal('place'),
		align: z.enum(['start', 'center', 'end']).optional(),
		alignOffset: z.number().optional(),
		intent: z.string(),
		referenceShapeId: SimpleShapeIdSchema.optional(),
		referenceSelector: TargetSelectorSchema.optional(),
		side: z.enum(['top', 'bottom', 'left', 'right', 'inside']),
		sideOffset: z.number().optional(),
		shapeId: SimpleShapeIdSchema.optional(),
		targetSelector: TargetSelectorSchema.optional(),
		insideAlignX: z.enum(['start', 'center', 'end']).optional(),
		insideAlignY: z.enum(['start', 'center', 'end']).optional(),
		padding: z.number().nonnegative().optional(),
	})
	.meta({
		title: 'Place',
		description:
			'The AI places exactly one resolved shape relative to another shape. Use side:"inside" for deterministic placement within a container; use targetSelector and referenceSelector for semantic targets.',
		_systemPromptCategory: 'edit',
	})

export type PlaceAction = z.infer<typeof PlaceAction>

// Resize Action
export const ResizeAction = z
	.object({
		_type: z.literal('resize'),
		intent: z.string(),
		originX: z.number(),
		originY: z.number(),
		scaleX: z.number(),
		scaleY: z.number(),
		shapeIds: z.array(SimpleShapeIdSchema).optional(),
		targetSelector: TargetSelectorSchema.optional(),
	})
	.meta({
		title: 'Resize',
		description:
			'The AI resizes one or more shapes, with the resize operation being performed relative to an origin point.',
		_systemPromptCategory: 'edit',
	})

export type ResizeAction = z.infer<typeof ResizeAction>

// Review Action
export const ReviewAction = z
	.object({
		_type: z.literal('review'),
		intent: z.string(),
		x: z.number(),
		y: z.number(),
		w: z.number(),
		h: z.number(),
	})
	.meta({
		title: 'Review',
		description:
			'The AI schedules further work or a review so that it can look at the results of its work so far and take further action, such as reviewing what it has done or taking further steps that would benefit from seeing the results of its work so far.',
	})

export type ReviewAction = z.infer<typeof ReviewAction>

// Rotate Action
export const RotateAction = z
	.object({
		_type: z.literal('rotate'),
		centerY: z.number(),
		degrees: z.number(),
		intent: z.string(),
		originX: z.number(),
		originY: z.number(),
		shapeIds: z.array(SimpleShapeIdSchema).optional(),
		targetSelector: TargetSelectorSchema.optional(),
	})
	.meta({
		title: 'Rotate',
		description: 'The AI rotates one or more shapes around an origin point.',
		_systemPromptCategory: 'edit',
	})

export type RotateAction = z.infer<typeof RotateAction>

// Send to Back Action
export const SendToBackAction = z
	.object({
		_type: z.literal('sendToBack'),
		intent: z.string(),
		shapeIds: z.array(SimpleShapeIdSchema).optional(),
		targetSelector: TargetSelectorSchema.optional(),
	})
	.meta({
		title: 'Send to Back',
		description:
			'The AI sends one or more shapes to the back so that they appear behind everything else.',
		_systemPromptCategory: 'edit',
	})

export type SendToBackAction = z.infer<typeof SendToBackAction>

// Set My View Action
export const SetMyViewAction = z
	.object({
		_type: z.literal('setMyView'),
		intent: z.string(),
		x: z.number(),
		y: z.number(),
		w: z.number(),
		h: z.number(),
	})
	.meta({
		title: 'Set My View',
		description:
			'The AI changes the bounds of its own viewport to navigate to other areas of the canvas if needed.',
	})

export type SetMyViewAction = z.infer<typeof SetMyViewAction>

// Stack Action
export const StackAction = z
	.object({
		_type: z.literal('stack'),
		direction: z.enum(['vertical', 'horizontal']),
		gap: z.number(),
		intent: z.string(),
		shapeIds: z.array(SimpleShapeIdSchema).optional(),
		targetSelector: TargetSelectorSchema.optional(),
	})
	.meta({
		title: 'Stack',
		description:
			"The AI stacks shapes horizontally or vertically. Note that this doesn't align shapes, it only stacks them along one axis.",
		_systemPromptCategory: 'edit',
	})

export type StackAction = z.infer<typeof StackAction>

// Think Action
export const ThinkAction = z
	.object({
		_type: z.literal('think'),
		text: z.string(),
	})
	.meta({ title: 'Think', description: 'The AI describes its intent or reasoning.' })

export type ThinkAction = z.infer<typeof ThinkAction>

// Todo List Action
export const UpsertPersonalTodoItemAction = z
	.object({
		_type: z.literal('update-todo-list'),
		id: TodoIdSchema,
		status: z.enum(['todo', 'in-progress', 'done']),
		text: z.string().optional(),
	})
	.meta({
		title: 'Update Todo List',
		description: 'The AI updates a current todo list item or creates a new one',
	})

export type UpsertPersonalTodoItemAction = z.infer<typeof UpsertPersonalTodoItemAction>

// Update Action
export const UpdateAction = z
	.object({
		_type: z.literal('update'),
		intent: z.string(),
		update: FocusedShapeSchema,
	})
	.meta({
		title: 'Update',
		description: 'The AI updates an existing shape.',
		_systemPromptCategory: 'edit',
	})

export type UpdateAction = z.infer<typeof UpdateAction>
// Unknown Action (catch-all for unrecognized actions)
export const UnknownAction = z
	.object({
		_type: z.literal('unknown'),
	})
	.meta({
		title: 'Unknown',
		description: 'An action with an unknown or unrecognized type.',
	})

export type UnknownAction = z.infer<typeof UnknownAction>
