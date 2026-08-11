import { TLShapeId } from 'tldraw'
import type {
	AlignAction,
	BringToFrontAction,
	DistributeAction,
	MoveAction,
	ResizeAction,
	RotateAction,
	SendToBackAction,
	StackAction,
} from '../../../shared/schema/AgentActionSchemas'
import { LEGACY_AGENT_MODE } from '../../../shared/agentVariants'
import type { SimpleShapeId } from '../../../shared/types/ids-schema'
import type { Streaming } from '../../../shared/types/Streaming'
import type { AgentHelpers } from '../../AgentHelpers'
import { AlignActionUtil } from '../AlignActionUtil'
import { BringToFrontActionUtil } from '../BringToFrontActionUtil'
import { DistributeActionUtil } from '../DistributeActionUtil'
import { MoveActionUtil } from '../MoveActionUtil'
import { registerActionUtil } from '../AgentActionUtil'
import { ResizeActionUtil } from '../ResizeActionUtil'
import { RotateActionUtil } from '../RotateActionUtil'
import { SendToBackActionUtil } from '../SendToBackActionUtil'
import { StackActionUtil } from '../StackActionUtil'

const originalMode = { forModes: [LEGACY_AGENT_MODE] }

registerActionUtil(
	class OriginalAlignActionUtil extends AlignActionUtil {
		static override type = 'align' as const
		override sanitizeAction(action: Streaming<AlignAction>, helpers: AgentHelpers) {
			action.shapeIds = helpers.ensureShapeIdsExist(action.shapeIds ?? [])
			return action
		}
	},
	originalMode
)

registerActionUtil(
	class OriginalBringToFrontActionUtil extends BringToFrontActionUtil {
		static override type = 'bringToFront' as const
		override sanitizeAction(action: Streaming<BringToFrontAction>, helpers: AgentHelpers) {
			action.shapeIds = helpers.ensureShapeIdsExist(action.shapeIds ?? [])
			return action
		}

		override applyAction(action: Streaming<BringToFrontAction>) {
			if (!action.shapeIds) return
			this.editor.bringToFront(action.shapeIds.map((shapeId) => `shape:${shapeId}` as TLShapeId))
		}
	},
	originalMode
)

registerActionUtil(
	class OriginalDistributeActionUtil extends DistributeActionUtil {
		static override type = 'distribute' as const
		override sanitizeAction(action: Streaming<DistributeAction>, helpers: AgentHelpers) {
			action.shapeIds = helpers.ensureShapeIdsExist(action.shapeIds ?? [])
			return action
		}
	},
	originalMode
)

registerActionUtil(
	class OriginalMoveActionUtil extends MoveActionUtil {
		static override type = 'move' as const
		override sanitizeAction(action: Streaming<MoveAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const shapeId = helpers.ensureShapeIdExists(action.shapeId as SimpleShapeId)
			if (!shapeId) return null
			action.shapeId = shapeId

			const floatX = helpers.ensureValueIsNumber(action.x)
			const floatY = helpers.ensureValueIsNumber(action.y)
			if (floatX === null || floatY === null) return null
			action.x = floatX
			action.y = floatY
			return action
		}
	},
	originalMode
)

registerActionUtil(
	class OriginalResizeActionUtil extends ResizeActionUtil {
		static override type = 'resize' as const
		override sanitizeAction(action: Streaming<ResizeAction>, helpers: AgentHelpers) {
			const shapeIds = helpers.ensureShapeIdsExist(action.shapeIds ?? [])
			if (shapeIds.length === 0) return null
			action.shapeIds = shapeIds
			return action
		}
	},
	originalMode
)

registerActionUtil(
	class OriginalRotateActionUtil extends RotateActionUtil {
		static override type = 'rotate' as const
		override sanitizeAction(action: Streaming<RotateAction>, helpers: AgentHelpers) {
			action.shapeIds = helpers.ensureShapeIdsExist(action.shapeIds ?? [])
			return action
		}
	},
	originalMode
)

registerActionUtil(
	class OriginalSendToBackActionUtil extends SendToBackActionUtil {
		static override type = 'sendToBack' as const
		override sanitizeAction(action: Streaming<SendToBackAction>, helpers: AgentHelpers) {
			action.shapeIds = helpers.ensureShapeIdsExist(action.shapeIds ?? [])
			return action
		}

		override applyAction(action: Streaming<SendToBackAction>) {
			if (!action.shapeIds) return
			this.editor.sendToBack(action.shapeIds.map((shapeId) => `shape:${shapeId}` as TLShapeId))
		}
	},
	originalMode
)

registerActionUtil(
	class OriginalStackActionUtil extends StackActionUtil {
		static override type = 'stack' as const
		override sanitizeAction(action: Streaming<StackAction>, helpers: AgentHelpers) {
			if (!action.complete) return action
			action.shapeIds = helpers.ensureShapeIdsExist(action.shapeIds ?? [])
			return action
		}
	},
	originalMode
)
