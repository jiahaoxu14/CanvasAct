import type { AgentStreamAction } from '../../../shared/types/ActionChunk'
import type {
	ActionContract,
	ActionPostcondition,
	ActionVerificationFailure,
} from '../../../shared/types/ActionContract'
import type { SimpleShapeId } from '../../../shared/types/ids-schema'
import { isLegacyAgentMode } from '../../../shared/agentVariants'
import { verifyActionResult } from '../../actions/verifyActionResult'
import type { AgentHelpers } from '../../AgentHelpers'
import { BaseAgentManager } from './BaseAgentManager'

interface PendingChunkVerification {
	chunkId: string
	intent: string
	contracts: ActionContract[]
	postconditions: ActionPostcondition[]
}

export class AgentVerificationManager extends BaseAgentManager {
	private surfacedFailureKeys = new Set<string>()
	private pendingChunks = new Map<string, PendingChunkVerification>()

	reset(): void {
		this.surfacedFailureKeys.clear()
		this.pendingChunks.clear()
	}

	verifyCompletedAction(
		action: AgentStreamAction,
		contract: ActionContract | null,
		_helpers: AgentHelpers
	): void {
		if (!action.complete) return
		if (isLegacyAgentMode(this.agent.mode.getCurrentModeType())) return

		if (action.chunk) {
			this.addChunkContract(action, contract)
			if (action.chunk.complete) {
				this.verifyCompletedChunk(action.chunk.chunkId)
			}
			return
		}

		if (!contract || contract.postconditions.length === 0) return
		this.verifyContract('action', contract.actionType, contract)
	}

	private addChunkContract(action: AgentStreamAction, contract: ActionContract | null) {
		if (!action.chunk) return
		const pending = this.pendingChunks.get(action.chunk.chunkId) ?? {
			chunkId: action.chunk.chunkId,
			intent: action.chunk.intent,
			contracts: [],
			postconditions: action.chunk.postconditions ?? [],
		}
		if (contract) {
			pending.contracts.push(contract)
		}
		pending.postconditions = action.chunk.postconditions ?? pending.postconditions
		this.pendingChunks.set(action.chunk.chunkId, pending)
	}

	private verifyCompletedChunk(chunkId: string) {
		const pending = this.pendingChunks.get(chunkId)
		if (!pending) return
		this.pendingChunks.delete(chunkId)

		const contract: ActionContract = {
			actionType: `chunk:${pending.intent}`,
			intent: pending.intent,
			modifiedShapeIds: uniqueIds(pending.contracts.flatMap((item) => item.modifiedShapeIds ?? [])),
			createdShapeIds: uniqueIds(pending.contracts.flatMap((item) => item.createdShapeIds ?? [])),
			postconditions: [
				...pending.contracts.flatMap((item) => item.postconditions),
				...pending.postconditions,
			],
		}
		if (contract.postconditions.length === 0) return

		this.verifyContract('chunk', chunkId, contract)
	}

	private verifyContract(scope: 'action' | 'chunk', id: string, contract: ActionContract) {
		const activeRequest = this.agent.requests.getActiveRequest()
		const result = verifyActionResult(this.agent.editor, contract, activeRequest)
		this.agent.trajectories.recordVerification(scope, id, result)
		if (result.ok) return

		const freshFailures = result.failures.filter((failure) => {
			const key = getFailureKey(scope, contract, failure)
			if (this.surfacedFailureKeys.has(key)) return false
			this.surfacedFailureKeys.add(key)
			return true
		})
		if (freshFailures.length === 0) return

		this.agent.schedule({
			message: buildVerificationFailureMessage(scope, contract, freshFailures),
			source: 'self',
			bounds: activeRequest?.bounds,
			contextItems: activeRequest?.contextItems ?? [],
		})
	}
}

function buildVerificationFailureMessage(
	scope: 'action' | 'chunk',
	contract: ActionContract,
	failures: ActionVerificationFailure[]
) {
	return `[VERIFICATION FAILED]: The completed ${scope} "${contract.actionType}" did not satisfy its local postconditions. Use the fresh CanvasObservation in this follow-up to repair the canvas before finishing. Failures: ${JSON.stringify(
		failures.map((failure) => ({
			postcondition: failure.postcondition.type,
			message: failure.message,
			shapeIds: failure.shapeIds,
		}))
	)}`
}

function getFailureKey(
	scope: 'action' | 'chunk',
	contract: ActionContract,
	failure: ActionVerificationFailure
) {
	return JSON.stringify({
		scope,
		actionType: contract.actionType,
		postcondition: failure.postcondition.type,
		shapeIds: failure.shapeIds,
		message: failure.message,
	})
}

function uniqueIds(ids: SimpleShapeId[]): SimpleShapeId[] {
	return Array.from(new Set(ids))
}
