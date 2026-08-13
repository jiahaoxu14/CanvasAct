import { AnnotateGroupAction } from '../../shared/schema/AgentActionSchemas'
import { SimpleShapeId } from '../../shared/types/ids-schema'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { annotateGroup } from './resolveSemanticActions'
import { resolveTargetSelectorForAction } from './resolveTargets'

export const AnnotateGroupActionUtil = registerActionUtil(
	class AnnotateGroupActionUtil extends AgentActionUtil<AnnotateGroupAction> {
		static override type = 'annotateGroup' as const

		override getInfo(action: Streaming<AnnotateGroupAction>) {
			return {
				icon: 'pencil' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<AnnotateGroupAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const shapeIds = resolveTargetSelectorForAction({
				agent: this.agent,
				helpers,
				selector: action.targetSelector,
				shapeIds: action.shapeIds,
				actionType: 'annotateGroup',
				min: 1,
			})
			if (!shapeIds) return null
			action.shapeIds = shapeIds
			action.createdShapeIds = [
				helpers.ensureShapeIdIsUnique(
					action.createdShapeIds?.[0] ?? (`annotation-${shapeIds[0]}` as SimpleShapeId)
				),
			]

			return action
		}

		override applyAction(action: Streaming<AnnotateGroupAction>) {
			if (!action.complete || !action.shapeIds) return
			action.createdShapeIds = annotateGroup(this.editor, action.shapeIds, action)
		}
	}
)
