import { RepairDashboardAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { repairDashboardLayout } from './resolveSemanticActions'
import { scheduleTargetResolutionFailure } from './resolveTargets'

export const RepairDashboardActionUtil = registerActionUtil(
	class RepairDashboardActionUtil extends AgentActionUtil<RepairDashboardAction> {
		static override type = 'repairDashboard' as const

		override getInfo(action: Streaming<RepairDashboardAction>) {
			return { icon: 'cursor' as const, description: action.intent ?? '' }
		}

		override sanitizeAction(
			action: Streaming<RepairDashboardAction>,
			helpers: AgentHelpers
		) {
			if (!action.complete) return action

			const seenMovableIds = new Set<string>()
			for (const section of action.sections) {
				const [containerShapeId] = helpers.ensureShapeIdsExist([section.containerShapeId])
				const shapeIds = helpers.ensureShapeIdsExist(section.shapeIds)
				if (!containerShapeId || shapeIds.length !== section.shapeIds.length) {
					scheduleTargetResolutionFailure(
						this.agent,
						'repairDashboard',
						'Every dashboard section must reference one existing container and existing movable objects.'
					)
					return null
				}
				if (shapeIds.some((id) => seenMovableIds.has(id))) {
					scheduleTargetResolutionFailure(
						this.agent,
						'repairDashboard',
						'A movable dashboard object may appear in only one section plan.'
					)
					return null
				}
				shapeIds.forEach((id) => seenMovableIds.add(id))
				section.containerShapeId = containerShapeId
				section.shapeIds = shapeIds
				section.gap = Math.min(48, Math.max(0, section.gap ?? 16))
				section.padding = Math.min(48, Math.max(0, section.padding ?? 16))
				section.headerHeight = Math.min(80, Math.max(0, section.headerHeight ?? 32))
			}

			action.textShapeIds = helpers.ensureShapeIdsExist(action.textShapeIds ?? [])
			action.preservedArrowIds = helpers.ensureShapeIdsExist(action.preservedArrowIds ?? [])
			return action
		}

		override applyAction(action: Streaming<RepairDashboardAction>) {
			if (!action.complete) return
			repairDashboardLayout(this.editor, action)
		}
	}
)
