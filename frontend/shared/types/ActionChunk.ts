import type { AgentAction } from './AgentAction'
import type { ActionPostcondition } from './ActionContract'
import type { Streaming } from './Streaming'

export interface ActionChunk {
	chunkId?: string
	intent: string
	actions: AgentAction[]
	postconditions?: ActionPostcondition[]
}

export interface ActionChunkStreamInfo {
	chunkId: string
	intent: string
	index: number
	actionIndex: number
	actionCount: number
	complete: boolean
	postconditions?: ActionPostcondition[]
}

export type AgentStreamAction = Streaming<AgentAction> & {
	chunk?: ActionChunkStreamInfo
}

export interface AgentActionResponse {
	actions?: AgentAction[]
	chunks?: ActionChunk[]
}
