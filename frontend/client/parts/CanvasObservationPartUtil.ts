import { buildCanvasObservation } from '../../shared/format/buildCanvasObservation'
import { CanvasObservationPart } from '../../shared/schema/PromptPartDefinitions'
import { AgentRequest } from '../../shared/types/AgentRequest'
import { AgentHelpers } from '../AgentHelpers'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

export const CanvasObservationPartUtil = registerPromptPartUtil(
	class CanvasObservationPartUtil extends PromptPartUtil<CanvasObservationPart> {
		static override type = 'canvasObservation' as const

		override getPart(request: AgentRequest, helpers: AgentHelpers): CanvasObservationPart {
			const promptOrigin = {
				x: -helpers.offset.x,
				y: -helpers.offset.y,
			}
			const observation = buildCanvasObservation(this.editor, {
				agentViewportBounds: request.bounds,
				userViewportBounds: this.editor.getViewportPageBounds(),
				promptOrigin,
				contextItems: request.contextItems,
			})

			if (this.agent.debug.getDebugFlags().logMessages) {
				console.log('[DEBUG] CanvasObservation:', observation)
			}

			return {
				type: 'canvasObservation',
				observation,
			}
		}
	}
)
