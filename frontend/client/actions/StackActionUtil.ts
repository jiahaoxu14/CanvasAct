import { TLShapeId } from 'tldraw'
import { StackAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { getLayoutClusters } from './getLayoutClusters'
import { resolveTargetSelectorForAction, scheduleTargetResolutionFailure } from './resolveTargets'

export const StackActionUtil = registerActionUtil(
	class StackActionUtil extends AgentActionUtil<StackAction> {
		static override type = 'stack' as const

		override getInfo(action: Streaming<StackAction>) {
			return {
				icon: 'cursor' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<StackAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const shapeIds = resolveTargetSelectorForAction({
				agent: this.agent,
				helpers,
				selector: action.targetSelector,
				shapeIds: action.shapeIds,
				actionType: 'stack',
				min: 2,
			})
			if (!shapeIds) return null
			action.gap = Math.max(0, action.gap)
			const clusters = getLayoutClusters(this.editor, shapeIds, 'stack')
			const minimum = action.gap === 0 ? 3 : 2
			if (clusters.length < minimum) {
				scheduleTargetResolutionFailure(this.agent, 'stack', `The resolved targets contain fewer than ${minimum} layout clusters.`)
				return null
			}
			action.shapeIds = shapeIds

			return action
		}

		override applyAction(action: Streaming<StackAction>) {
			if (!action.complete || !action.shapeIds) return

			this.editor.stackShapes(
				action.shapeIds.map((id) => `shape:${id}` as TLShapeId),
				action.direction,
				Math.max(action.gap, 0)
			)
		}
	}
)
