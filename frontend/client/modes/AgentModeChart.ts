import type { AgentRequest } from '../../shared/types/AgentRequest'
import { getWorkingModeForAgentVariant } from '../../shared/agentVariants'
import type { TldrawAgent } from '../agent/TldrawAgent'
import type { AgentModeDefinition, AgentModeType } from './AgentModeDefinitions'

/**
 * Lifecycle hooks for an agent mode.
 * Each mode can optionally implement these hooks to respond to state changes.
 */
export interface AgentModeNode {
	onEnter?(agent: TldrawAgent, fromMode: AgentModeType): void
	onExit?(agent: TldrawAgent, toMode: AgentModeType): void
	onPromptStart?(agent: TldrawAgent, request: AgentRequest): void
	onPromptEnd?(agent: TldrawAgent, request: AgentRequest): void | Promise<void>
	onPromptCancel?(agent: TldrawAgent, request: AgentRequest): void
}

/**
 * Lifecycle implementations for each agent mode.
 *
 * This chart maps mode types to their lifecycle hooks.
 * Modes can implement any subset of hooks (all are optional).
 * Not all modes need an entry - modes without entries simply have no lifecycle behavior.
 *
 * To add lifecycle behavior for a new mode:
 * 1. Add the mode to AGENT_MODE_DEFINITIONS in AgentModeDefinitions.ts
 * 2. Add an entry here with the lifecycle hooks you need
 */
const sharedWorkingHooks = {
	onEnter(agent, fromMode) {
		// Reset state when entering a working mode.
		agent.todos.reset()
		agent.context.clear()

		if (fromMode === 'idling') {
			agent.lints.clearCreatedShapes()
		}
	},

	onExit(agent, _toMode) {
		agent.lints.unlockCreatedShapes()
	},

	onPromptStart(agent, request) {
		if (request.source === 'user') {
			agent.todos.flush()
			agent.lints.clearCreatedShapes()
		}
	},
	onPromptCancel(agent, _request) {
		agent.mode.setMode('idling')
	},

} satisfies Pick<AgentModeNode, 'onEnter' | 'onExit' | 'onPromptStart' | 'onPromptCancel'>

const legacyWorkingModeNode: AgentModeNode = {
	...sharedWorkingHooks,
	onPromptEnd(agent, _request) {
		const todoList = agent.todos.getTodos()
		const incompleteTodos = todoList.filter((item) => item.status !== 'done')

		if (incompleteTodos.length > 0) {
			agent.schedule(
				"Continue until all your todo items are marked as done. If you've completed the work, mark them as done, otherwise keep going."
		)
			return
		}

		if (agent.lints.hasUnsurfacedLints(agent.lints.getCreatedShapes())) {
			agent.schedule({
				agentMessages: [
					'The automated linter has detected potential visual problems in the canvas. Decide if they need to be addressed.',
				],
			})
			return
		}

		agent.mode.setMode('idling')
	},

}

const _AGENT_MODE_CHART: Record<AgentModeDefinition['type'], AgentModeNode> = {
	idling: {
		onPromptStart(agent) {
			agent.mode.setMode(getWorkingModeForAgentVariant(agent.variant.getVariant()))
		},
		onEnter(agent, _fromMode) {
			agent.todos.reset()
			agent.userAction.clearHistory()
		},
	},
	// CanvasObs deliberately reuses the original tldraw lifecycle. Its only
	// runtime difference is the additional structured CanvasObservation part.
	working: legacyWorkingModeNode,
	'working-legacy': legacyWorkingModeNode,
}

/**
 * Get the lifecycle node for a mode, if one exists.
 * This function helps TypeScript resolve types correctly with circular imports.
 */
export function getModeNode(mode: AgentModeType): AgentModeNode {
	return _AGENT_MODE_CHART[mode]
}
