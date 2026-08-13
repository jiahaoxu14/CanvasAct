import { FormEventHandler, useCallback, useRef, useState } from 'react'
import { useValue } from 'tldraw'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import {
	getCurrentResearchWorkspaceScenario,
	RESEARCH_WORKSPACE_PROMPT,
} from '../usageScenario/researchWorkspaceScenario'
import { ChatHistory } from './chat-history/ChatHistory'
import { ChatInput } from './ChatInput'
import { TodoList } from './TodoList'
import { AgentVariantSwitch } from './AgentVariantSwitch'

export function ChatPanel() {
	const agent = useAgent()
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const [inputValue, setInputValue] = useState('')
	const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
	const isResearchWorkspaceScenario = useValue(
		'researchWorkspaceScenario',
		() => Boolean(getCurrentResearchWorkspaceScenario(agent.editor)),
		[agent]
	)

	const handleSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
		async (e) => {
			e.preventDefault()
			const value = inputValue.trim()

			// If the user's message is empty, just cancel the current request (if there is one)
			if (value === '') {
				agent.cancel()
				return
			}

			// Clear the chat input (context is cleared after it's captured in requestAgentActions)
			setInputValue('')

			// Sending a new message to the agent should interrupt the current request
			agent.interrupt({
				input: {
					agentMessages: [value],
					bounds: agent.editor.getViewportPageBounds(),
					source: 'user',
					contextItems: agent.context.getItems(),
				},
			})
		},
		[agent, inputValue]
	)

	const handleNewChat = useCallback(() => {
		agent.reset()
	}, [agent])

	const handleUsePrompt = useCallback(() => {
		setInputValue(RESEARCH_WORKSPACE_PROMPT)
		inputRef.current?.focus()
	}, [])

	const handleCopyPrompt = useCallback(async () => {
		await navigator.clipboard.writeText(RESEARCH_WORKSPACE_PROMPT)
		setCopyState('copied')
		window.setTimeout(() => setCopyState('idle'), 1400)
	}, [])

	return (
		<div className="chat-panel tl-theme__dark">
			<div className="chat-header">
				<AgentVariantSwitch />
				<button
					className="new-chat-button"
					onClick={handleNewChat}
					title="Start a new chat"
					aria-label="Start a new chat"
				>
					+
				</button>
			</div>
			<ChatHistory agent={agent} />
			<div className="chat-input-container">
				<TodoList agent={agent} />
				{isResearchWorkspaceScenario && (
					<section className="scenario-prompt" aria-label="Case study prompt">
						<div className="scenario-prompt-heading">
							<span>Case study prompt</span>
							<button type="button" onClick={handleCopyPrompt}>
								{copyState === 'copied' ? 'Copied' : 'Copy'}
							</button>
						</div>
						<p>{RESEARCH_WORKSPACE_PROMPT}</p>
						<button className="scenario-prompt-use" type="button" onClick={handleUsePrompt}>
							Use prompt
						</button>
					</section>
				)}
				<ChatInput
					handleSubmit={handleSubmit}
					inputRef={inputRef}
					inputValue={inputValue}
					setInputValue={setInputValue}
				/>
			</div>
		</div>
	)
}
