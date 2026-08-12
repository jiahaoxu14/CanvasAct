import { Box, type TLShapeId } from 'tldraw'
import { BuildFlowAction } from '../../shared/schema/AgentActionSchemas'
import { ActionContract } from '../../shared/types/ActionContract'
import type { SimpleShapeId } from '../../shared/types/ids-schema'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { buildFlow, getFlowArrowIds } from './resolveSemanticActions'
import { scheduleTargetResolutionFailure } from './resolveTargets'

export const BuildFlowActionUtil = registerActionUtil(
	class BuildFlowActionUtil extends AgentActionUtil<BuildFlowAction> {
		static override type = 'buildFlow' as const

		override getInfo(action: Streaming<BuildFlowAction>) {
			return {
				icon: 'cursor' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<BuildFlowAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const shapeIds = helpers.ensureShapeIdsExist(action.shapeIds)
			if (shapeIds.length < 2) {
				scheduleTargetResolutionFailure(
					this.agent,
					'buildFlow',
					'An ordered flow requires at least two existing step shapes.'
				)
				return null
			}
			if (new Set(shapeIds).size !== shapeIds.length) {
				scheduleTargetResolutionFailure(
					this.agent,
					'buildFlow',
					'The ordered step list contains duplicate shape ids.'
				)
				return null
			}
			action.shapeIds = shapeIds
			action.gap = Math.min(30, Math.max(0, action.gap ?? 30))
			constrainFlowToActiveViewport(this, action)
			action.createArrows = action.createArrows !== false
			action.repairExistingConnectors = action.repairExistingConnectors !== false
			action.createdShapeIds = shapeIds.slice(0, -1).map((sourceId, index) => {
				const targetId = shapeIds[index + 1]
				return helpers.ensureShapeIdIsUnique(
					action.createdShapeIds?.[index] ??
						(`flow-${sourceId}-${targetId}` as SimpleShapeId)
				)
			})

			return action
		}

		override applyAction(action: Streaming<BuildFlowAction>, helpers: AgentHelpers) {
			if (!action.complete) return
			const result = buildFlow(this.editor, action.shapeIds, action, helpers)
			action.createdShapeIds = result.createdShapeIds
			action.flowArrowIds = result.flowArrowIds
		}

		override getActionContract(action: Streaming<BuildFlowAction>): ActionContract | null {
			if (!action.complete) return null
			const gap = Math.min(30, Math.max(0, action.gap ?? 30))
			const flowArrowIds = getFlowArrowIds(this.editor, action.shapeIds)
			const createdShapeIds = (action.createdShapeIds ?? []).filter((id) =>
				this.editor.getShape(`shape:${id}` as TLShapeId)
			)
			return {
				actionType: 'buildFlow',
				intent: action.intent,
				modifiedShapeIds: [...action.shapeIds, ...flowArrowIds],
				createdShapeIds,
				postconditions: [
					{ type: 'no-overlap', shapeIds: action.shapeIds },
					{
						type: 'ordered-layout',
						shapeIds: action.shapeIds,
						direction: action.direction,
						gap,
						tolerance: 2,
					},
					{ type: 'objects-visible', shapeIds: action.shapeIds },
					...(action.createArrows !== false
						? ([
								{ type: 'arrow-bindings', shapeIds: flowArrowIds },
								{ type: 'connection-sequence', shapeIds: action.shapeIds },
								{ type: 'no-duplicate-arrows' },
							] satisfies ActionContract['postconditions'])
						: []),
				],
			}
		}
	}
)

function constrainFlowToActiveViewport(
	util: AgentActionUtil<BuildFlowAction>,
	action: Streaming<BuildFlowAction>
) {
	const request = util.agent.requests.getActiveRequest()
	if (!request || !action.shapeIds || action.shapeIds.length < 2) return

	const viewport = Box.From(request.bounds)
	const inset = 24
	const available = new Box(
		viewport.minX + inset,
		viewport.minY + inset,
		Math.max(0, viewport.width - inset * 2),
		Math.max(0, viewport.height - inset * 2)
	)
	const bounds = action.shapeIds
		.map((id) => util.editor.getShapePageBounds(`shape:${id}` as TLShapeId))
		.filter((box): box is Box => box !== undefined)
	if (bounds.length !== action.shapeIds.length) return

	const common = Box.Common(bounds)
	const primarySize = bounds.reduce(
		(total, box) => total + (action.direction === 'horizontal' ? box.width : box.height),
		0
	)
	const availablePrimary =
		action.direction === 'horizontal' ? available.width : available.height
	const maxGap = Math.max(
		0,
		(availablePrimary - primarySize) / Math.max(1, action.shapeIds.length - 1)
	)
	action.gap = Math.min(action.gap ?? 40, maxGap)

	if (action.direction === 'horizontal') {
		action.region = {
			x: available.minX,
			y: Math.min(Math.max(common.minY, available.minY), available.maxY - common.height),
			w: available.width,
			h: common.height,
			coordinateSpace: 'page',
		}
	} else {
		action.region = {
			x: Math.min(Math.max(common.minX, available.minX), available.maxX - common.width),
			y: available.minY,
			w: common.width,
			h: available.height,
			coordinateSpace: 'page',
		}
	}
}
