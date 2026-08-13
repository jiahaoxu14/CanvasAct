import type { CanvasObservation } from '../format/CanvasObservation'
import type { AgentVariant } from '../agentVariants'
import type { AgentAction } from './AgentAction'
import type { AgentRequest } from './AgentRequest'
import type { Streaming } from './Streaming'

export type AgentTrajectoryStatus = 'running' | 'completed' | 'cancelled' | 'failed'

export interface AgentTrajectoryDiffSummary {
	added: string[]
	updated: string[]
	removed: string[]
}

export interface AgentTrajectoryActionRecord {
	action: Streaming<AgentAction>
	diff: AgentTrajectoryDiffSummary
}

export interface AgentTrajectory {
	trajectoryId: string
	agentVariant: AgentVariant
	startedAt: string
	finishedAt?: string
	status: AgentTrajectoryStatus
	request: Pick<AgentRequest, 'agentMessages' | 'userMessages' | 'source' | 'bounds'>
	initialObservation: CanvasObservation
	finalObservation?: CanvasObservation
	actions: AgentTrajectoryActionRecord[]
	metrics: {
		modelCallCount: number
		actionCount: number
		primitiveEditCount: number
		latencyToFirstActionMs: number | null
		totalLatencyMs: number | null
	}
	error?: string
}
