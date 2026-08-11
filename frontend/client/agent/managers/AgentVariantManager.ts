import { Atom, atom } from 'tldraw'
import { AgentVariant, DEFAULT_AGENT_VARIANT } from '../../../shared/agentVariants'
import type { TldrawAgent } from '../TldrawAgent'
import { BaseAgentManager } from './BaseAgentManager'

/** Stores which agent implementation should handle the next request. */
export class AgentVariantManager extends BaseAgentManager {
	private $variant: Atom<AgentVariant>

	constructor(agent: TldrawAgent) {
		super(agent)
		this.$variant = atom<AgentVariant>('agentVariant', DEFAULT_AGENT_VARIANT)
	}

	getVariant(): AgentVariant {
		return this.$variant.get()
	}

	setVariant(variant: AgentVariant): void {
		this.$variant.set(variant)
	}

	reset(): void {
		this.$variant.set(DEFAULT_AGENT_VARIANT)
	}
}
