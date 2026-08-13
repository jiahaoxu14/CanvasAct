export const AGENT_VARIANT_DEFINITIONS = {
	canvasact: {
		id: 'canvasact',
		label: 'CanvasAct',
		description: 'Structured canvas observation with the original tldraw action and review loop.',
		workingMode: 'working',
	},
	'original-tldraw': {
		id: 'original-tldraw',
		label: 'Original tldraw',
		description: 'Original agent-kit shape context and primitive action loop.',
		workingMode: 'working-legacy',
	},
} as const

export type AgentVariant = keyof typeof AGENT_VARIANT_DEFINITIONS

export const DEFAULT_AGENT_VARIANT: AgentVariant = 'canvasact'
export const CANVASACT_AGENT_MODE = AGENT_VARIANT_DEFINITIONS.canvasact.workingMode
export const LEGACY_AGENT_MODE = AGENT_VARIANT_DEFINITIONS['original-tldraw'].workingMode

export function isAgentVariant(value: unknown): value is AgentVariant {
	return (
		typeof value === 'string' &&
		Object.prototype.hasOwnProperty.call(AGENT_VARIANT_DEFINITIONS, value)
	)
}

export function isLegacyAgentMode(mode: string): boolean {
	return mode === LEGACY_AGENT_MODE
}

export function getWorkingModeForAgentVariant(variant: AgentVariant) {
	return AGENT_VARIANT_DEFINITIONS[variant].workingMode
}
