import { RecordsDiff, TLRecord } from 'tldraw'
import { buildCanvasObservation } from '../../../shared/format/buildCanvasObservation'
import type { AgentStreamAction } from '../../../shared/types/ActionChunk'
import type { ActionContract, ActionVerificationResult } from '../../../shared/types/ActionContract'
import type { AgentRequest } from '../../../shared/types/AgentRequest'
import type {
	AgentTrajectory,
	AgentTrajectoryDiffSummary,
	AgentTrajectoryStatus,
} from '../../../shared/types/AgentTrajectory'
import type { AgentHelpers } from '../../AgentHelpers'
import { BaseAgentManager } from './BaseAgentManager'

const MAX_TRAJECTORIES = 50
const STORAGE_KEY = 'canvas-agent-trajectories-v1'

export class AgentTrajectoryManager extends BaseAgentManager {
	private trajectories: AgentTrajectory[] = []
	private currentTrajectory: AgentTrajectory | null = null

	reset(): void {
		this.trajectories = []
		this.currentTrajectory = null
		this.persist()
	}

	startRequest(request: AgentRequest, helpers: AgentHelpers) {
		const now = new Date()
		const trajectory: AgentTrajectory = {
			trajectoryId: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
			startedAt: now.toISOString(),
			status: 'running',
			request: {
				agentMessages: request.agentMessages,
				userMessages: request.userMessages,
				source: request.source,
				bounds: request.bounds,
			},
			initialObservation: this.buildObservation(request, helpers),
			actions: [],
			chunks: [],
			verifications: [],
			metrics: {
				modelCallCount: 1,
				actionCount: 0,
				chunkCount: 0,
				primitiveEditCount: 0,
				repairLoopCount: request.source === 'self' ? 1 : 0,
				verificationFailureCount: 0,
				latencyToFirstActionMs: null,
				totalLatencyMs: null,
			},
		}

		this.currentTrajectory = trajectory
		this.trajectories.push(trajectory)
		this.trim()
		this.persist()
	}

	recordAction(
		action: AgentStreamAction,
		diff: RecordsDiff<TLRecord>,
		contract: ActionContract | null
	) {
		const trajectory = this.currentTrajectory
		if (!trajectory || !action.complete) return

		if (trajectory.metrics.latencyToFirstActionMs === null) {
			trajectory.metrics.latencyToFirstActionMs = action.time
		}

		trajectory.actions.push({
			action: cloneJson(action),
			chunk: action.chunk ? cloneJson(action.chunk) : undefined,
			contract: contract ? cloneJson(contract) : null,
			diff: summarizeDiff(diff),
		})
		trajectory.metrics.actionCount = trajectory.actions.length
		trajectory.metrics.primitiveEditCount += countDiffChanges(diff)

		if (action.chunk) {
			const existing = trajectory.chunks.find((chunk) => chunk.chunkId === action.chunk?.chunkId)
			if (existing) {
				existing.actionCount = Math.max(existing.actionCount, action.chunk.actionCount)
				existing.actionTypes.push(action._type)
			} else {
				trajectory.chunks.push({
					chunkId: action.chunk.chunkId,
					intent: action.chunk.intent,
					index: action.chunk.index,
					actionCount: action.chunk.actionCount,
					actionTypes: [action._type],
					postconditions: (action.chunk.postconditions ?? []).map(
						(postcondition) => postcondition.type
					),
				})
				trajectory.metrics.chunkCount = trajectory.chunks.length
			}
		}

		this.persist()
	}

	recordVerification(scope: 'action' | 'chunk', id: string, result: ActionVerificationResult) {
		const trajectory = this.currentTrajectory
		if (!trajectory) return

		trajectory.verifications.push({
			scope,
			id,
			result: cloneJson(result),
			timestamp: new Date().toISOString(),
		})
		trajectory.metrics.verificationFailureCount += result.failures.length
		this.persist()
	}

	finishRequest(
		status: AgentTrajectoryStatus,
		request: AgentRequest,
		helpers: AgentHelpers,
		error?: unknown
	) {
		const trajectory = this.currentTrajectory
		if (!trajectory) return

		const now = new Date()
		trajectory.status = status
		trajectory.finishedAt = now.toISOString()
		trajectory.finalObservation = this.buildObservation(request, helpers)
		trajectory.metrics.totalLatencyMs = now.getTime() - Date.parse(trajectory.startedAt)
		if (error) {
			trajectory.error = error instanceof Error ? error.message : String(error)
		}

		this.currentTrajectory = null
		this.persist()
	}

	getTrajectories() {
		return this.trajectories
	}

	private buildObservation(request: AgentRequest, helpers: AgentHelpers) {
		return buildCanvasObservation(this.agent.editor, {
			agentViewportBounds: request.bounds,
			userViewportBounds: this.agent.editor.getViewportPageBounds(),
			promptOrigin: {
				x: -helpers.offset.x,
				y: -helpers.offset.y,
			},
			contextItems: request.contextItems,
		})
	}

	private trim() {
		if (this.trajectories.length > MAX_TRAJECTORIES) {
			this.trajectories = this.trajectories.slice(-MAX_TRAJECTORIES)
		}
	}

	private persist() {
		if (typeof window === 'undefined') return
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.trajectories))
		} catch {
			// Trajectory logging is best-effort and should never block the agent.
		}
	}
}

function summarizeDiff(diff: RecordsDiff<TLRecord>): AgentTrajectoryDiffSummary {
	return {
		added: Object.keys(diff.added),
		updated: Object.keys(diff.updated),
		removed: Object.keys(diff.removed),
	}
}

function countDiffChanges(diff: RecordsDiff<TLRecord>) {
	return (
		Object.keys(diff.added).length +
		Object.keys(diff.updated).length +
		Object.keys(diff.removed).length
	)
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}
