import z from 'zod'
import { FocusedTextAnchorSchema } from '../format/FocusedShape'
import { LEGACY_AGENT_MODE } from '../agentVariants'
import { SimpleShapeIdSchema } from '../types/ids-schema'
import { registerActionSchema } from './AgentActionSchemaRegistry'

const originalMode = { forModes: [LEGACY_AGENT_MODE] }

registerActionSchema(
	'align',
	z
		.object({
			_type: z.literal('align'),
			alignment: z.enum(['top', 'bottom', 'left', 'right', 'center-horizontal', 'center-vertical']),
			gap: z.number(),
			intent: z.string(),
			shapeIds: z.array(SimpleShapeIdSchema),
		})
		.meta({ title: 'Align', description: 'The AI aligns shapes to each other on an axis.' }),
	originalMode
)

registerActionSchema(
	'bringToFront',
	z
		.object({
			_type: z.literal('bringToFront'),
			intent: z.string(),
			shapeIds: z.array(SimpleShapeIdSchema),
		})
		.meta({
			title: 'Bring to Front',
			description: 'The AI brings one or more shapes to the front so that they appear in front of everything else.',
		}),
	originalMode
)

registerActionSchema(
	'distribute',
	z
		.object({
			_type: z.literal('distribute'),
			direction: z.enum(['horizontal', 'vertical']),
			intent: z.string(),
			shapeIds: z.array(SimpleShapeIdSchema),
		})
		.meta({ title: 'Distribute', description: 'The AI distributes shapes horizontally or vertically.' }),
	originalMode
)

registerActionSchema(
	'move',
	z
		.object({
			_type: z.literal('move'),
			intent: z.string(),
			anchor: FocusedTextAnchorSchema,
			shapeId: SimpleShapeIdSchema,
			x: z.number(),
			y: z.number(),
		})
		.meta({ title: 'Move', description: 'The agent moves a shape to a new position.' }),
	originalMode
)

registerActionSchema(
	'resize',
	z
		.object({
			_type: z.literal('resize'),
			intent: z.string(),
			originX: z.number(),
			originY: z.number(),
			scaleX: z.number(),
			scaleY: z.number(),
			shapeIds: z.array(SimpleShapeIdSchema),
		})
		.meta({
			title: 'Resize',
			description: 'The AI resizes one or more shapes, with the resize operation being performed relative to an origin point.',
		}),
	originalMode
)

registerActionSchema(
	'rotate',
	z
		.object({
			_type: z.literal('rotate'),
			centerY: z.number(),
			degrees: z.number(),
			intent: z.string(),
			originX: z.number(),
			originY: z.number(),
			shapeIds: z.array(SimpleShapeIdSchema),
		})
		.meta({ title: 'Rotate', description: 'The AI rotates one or more shapes around an origin point.' }),
	originalMode
)

registerActionSchema(
	'sendToBack',
	z
		.object({
			_type: z.literal('sendToBack'),
			intent: z.string(),
			shapeIds: z.array(SimpleShapeIdSchema),
		})
		.meta({
			title: 'Send to Back',
			description: 'The AI sends one or more shapes to the back so that they appear behind everything else.',
		}),
	originalMode
)

registerActionSchema(
	'stack',
	z
		.object({
			_type: z.literal('stack'),
			direction: z.enum(['vertical', 'horizontal']),
			gap: z.number(),
			intent: z.string(),
			shapeIds: z.array(SimpleShapeIdSchema),
		})
		.meta({
			title: 'Stack',
			description: "The AI stacks shapes horizontally or vertically. Note that this doesn't align shapes, it only stacks them along one axis.",
		}),
	originalMode
)
