import { ConnectAction } from '../../shared/schema/AgentActionSchemas'
import { ActionContract } from '../../shared/types/ActionContract'
import { SimpleShapeId } from '../../shared/types/ids-schema'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { connectShapes, getConnectionPairs } from './resolveSemanticActions'
import {
	resolveTargets,
	scheduleTargetResolutionFailure,
} from './resolveTargets'

export const ConnectActionUtil = registerActionUtil(
	class ConnectActionUtil extends AgentActionUtil<ConnectAction> {
		static override type = 'connect' as const

		override getInfo(action: Streaming<ConnectAction>) {
			return {
				icon: 'cursor' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<ConnectAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const sourceShapeIds = this.resolveEndpoint(
				'source',
				action.sourceSelector,
				action.sourceShapeIds,
				helpers
			)
			const targetShapeIds = this.resolveEndpoint(
				'target',
				action.targetSelector,
				action.targetShapeIds,
				helpers
			)
			if (!sourceShapeIds || !targetShapeIds) return null

			action.sourceShapeIds = sourceShapeIds
			action.targetShapeIds = targetShapeIds

			const pairs = getConnectionPairs(
				this.editor,
				sourceShapeIds,
				targetShapeIds,
				action.avoidDuplicates !== false
			)
			action.createdShapeIds = pairs.map((pair, index) =>
				helpers.ensureShapeIdIsUnique(
					action.createdShapeIds?.[index] ??
						(`arrow-${pair.sourceId}-${pair.targetId}` as SimpleShapeId)
				)
			)

			return action
		}

		override applyAction(action: Streaming<ConnectAction>) {
			if (!action.complete) return
			action.createdShapeIds = connectShapes(this.editor, action)
		}

		override getActionContract(action: Streaming<ConnectAction>): ActionContract | null {
			if (!action.complete) return null
			const createdShapeIds = action.createdShapeIds ?? []
			return {
				actionType: 'connect',
				intent: action.intent,
				modifiedShapeIds: [...(action.sourceShapeIds ?? []), ...(action.targetShapeIds ?? [])],
				createdShapeIds,
				postconditions: [
					{ type: 'created-shapes-exist', shapeIds: createdShapeIds },
					{ type: 'arrow-bindings', shapeIds: createdShapeIds },
					{ type: 'no-duplicate-arrows' },
				],
			}
		}

		resolveEndpoint(
			label: 'source' | 'target',
			selector: ConnectAction['sourceSelector'],
			shapeIds: SimpleShapeId[] | undefined,
			helpers: AgentHelpers
		): SimpleShapeId[] | null {
			if (selector) {
				const result = resolveTargets(this.agent, selector, { helpers })
				if (result.status === 'ok') return result.shapeIds
				scheduleTargetResolutionFailure(
					this.agent,
					'connect',
					result.reason ?? `The ${label} selector did not resolve any shapes.`
				)
				return null
			}

			const existingShapeIds = helpers.ensureShapeIdsExist(shapeIds ?? [])
			if (existingShapeIds.length === 0) {
				scheduleTargetResolutionFailure(
					this.agent,
					'connect',
					`Expected at least one ${label} shape.`
				)
				return null
			}
			return existingShapeIds
		}
	}
)
