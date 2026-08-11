import { useValue } from 'tldraw'
import { AGENT_VARIANT_DEFINITIONS } from '../../shared/agentVariants'
import { useAgent } from '../agent/TldrawAgentAppProvider'

const VARIANTS = Object.values(AGENT_VARIANT_DEFINITIONS)

export function AgentVariantSwitch() {
	const agent = useAgent()
	const variant = useValue('agentVariant', () => agent.variant.getVariant(), [agent])
	const isBusy = useValue(
		'agentVariantIsBusy',
		() =>
			agent.requests.isGenerating() || agent.mode.getCurrentModeDefinition().active,
		[agent]
	)

	return (
		<div className="agent-variant-control">
			<span className="agent-variant-label">Agent</span>
			<div className="agent-variant-switch" role="group" aria-label="Agent implementation">
				{VARIANTS.map((definition) => {
					const isActive = variant === definition.id
					const label = definition.id === 'original-tldraw' ? 'Original' : definition.label
					return (
						<button
							key={definition.id}
							type="button"
							className={isActive ? 'active' : undefined}
							aria-pressed={isActive}
							aria-label={`${isActive ? `${definition.label} selected` : `Switch to ${definition.label}`}. Switching starts a fresh chat and keeps the canvas.`}
							disabled={isBusy}
							title={`${definition.label}: ${definition.description} Switching starts a fresh chat and keeps the canvas.`}
							onClick={() => agent.setVariant(definition.id)}
						>
							{label}
						</button>
					)
				})}
			</div>
		</div>
	)
}
