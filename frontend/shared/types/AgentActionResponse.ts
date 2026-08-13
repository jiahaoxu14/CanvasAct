import type { AgentAction } from './AgentAction'
import type { Streaming } from './Streaming'

/** An action event emitted by the original tldraw streaming response path. */
export type AgentStreamAction = Streaming<AgentAction>

/** The response envelope shared by CanvasAct and the original tldraw agent. */
export interface AgentActionResponse {
	actions?: AgentAction[]
}
