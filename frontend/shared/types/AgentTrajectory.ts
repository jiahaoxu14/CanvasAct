import type { CanvasObservation } from '../format/CanvasObservation'
import type { AgentAction } from './AgentAction'
import type { ActionChunkStreamInfo } from './ActionChunk'
import type { ActionContract, ActionVerificationResult } from './ActionContract'
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
	chunk?: ActionChunkStreamInfo
	contract: ActionContract | null
	diff: AgentTrajectoryDiffSummary
}

export interface AgentTrajectoryChunkRecord {
	chunkId: string
	intent: string
	index: number
	actionCount: number
	actionTypes: string[]
	postconditions: string[]
}

export interface AgentTrajectoryVerificationRecord {
	scope: 'action' | 'chunk'
	id: string
	result: ActionVerificationResult
	timestamp: string
}

export interface AgentTrajectory {
	trajectoryId: string
	startedAt: string
	finishedAt?: string
	status: AgentTrajectoryStatus
	request: Pick<AgentRequest, 'agentMessages' | 'userMessages' | 'source' | 'bounds'>
	initialObservation: CanvasObservation
	finalObservation?: CanvasObservation
	actions: AgentTrajectoryActionRecord[]
	chunks: AgentTrajectoryChunkRecord[]
	verifications: AgentTrajectoryVerificationRecord[]
	metrics: {
		modelCallCount: number
		actionCount: number
		chunkCount: number
		primitiveEditCount: number
		repairLoopCount: number
		verificationFailureCount: number
		latencyToFirstActionMs: number | null
		totalLatencyMs: number | null
	}
	error?: string
}
