import { TLShapeId } from 'tldraw'
import { AlignAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { getLayoutClusters } from './getLayoutClusters'
import { resolveTargetSelectorForAction, scheduleTargetResolutionFailure } from './resolveTargets'

export const AlignActionUtil = registerActionUtil(
	class AlignActionUtil extends AgentActionUtil<AlignAction> {
		static override type = 'align' as const

		override getInfo(action: Streaming<AlignAction>) {
			return {
				icon: 'cursor' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<AlignAction>, helpers: AgentHelpers) {
			if (!action.complete) return action
			const shapeIds = resolveTargetSelectorForAction({
				agent: this.agent,
				helpers,
				selector: action.targetSelector,
				shapeIds: action.shapeIds,
				actionType: 'align',
				min: 2,
			})
			if (!shapeIds) return null
			if (getLayoutClusters(this.editor, shapeIds, 'align').length < 2) {
				scheduleTargetResolutionFailure(this.agent, 'align', 'The resolved targets contain fewer than two layout clusters.')
				return null
			}
			action.shapeIds = shapeIds
			return action
		}

		override applyAction(action: Streaming<AlignAction>) {
			if (!action.complete || !action.shapeIds) return

			this.editor.alignShapes(
				action.shapeIds.map((id) => `shape:${id}` as TLShapeId),
				action.alignment
			)
		}
	}
)
