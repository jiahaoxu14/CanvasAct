import {
	type ChangeEventHandler,
	type FormEventHandler,
	useCallback,
	useRef,
	useState,
} from 'react'
import { useValue } from 'tldraw'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import {
	getCurrentObservationCaseStudy,
	OBSERVATION_CASE_STUDIES,
	type ObservationCaseStudyId,
	selectObservationCaseStudy,
} from '../usageScenario/observationCaseStudies'
import { ChatHistory } from './chat-history/ChatHistory'
import { ChatInput } from './ChatInput'
import { TodoList } from './TodoList'
import { AgentVariantSwitch } from './AgentVariantSwitch'

export function ChatPanel() {
	const agent = useAgent()
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const [inputValue, setInputValue] = useState('')
	const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
	const currentCaseStudy = useValue(
		'currentObservationCaseStudy',
		() => getCurrentObservationCaseStudy(agent.editor),
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
		if (!currentCaseStudy) return
		setInputValue(currentCaseStudy.prompt)
		inputRef.current?.focus()
	}, [currentCaseStudy])

	const handleCopyPrompt = useCallback(async () => {
		if (!currentCaseStudy) return
		await navigator.clipboard.writeText(currentCaseStudy.prompt)
		setCopyState('copied')
		window.setTimeout(() => setCopyState('idle'), 1400)
	}, [currentCaseStudy])

	const handleCaseStudyChange = useCallback<ChangeEventHandler<HTMLSelectElement>>(
		(event) => {
			agent.reset()
			setInputValue('')
			setCopyState('idle')
			selectObservationCaseStudy(
				agent.editor,
				event.currentTarget.value as ObservationCaseStudyId,
				() => agent.chatOrigin.reset()
			)
		},
		[agent]
	)

	const currentCaseStudyIndex = currentCaseStudy
		? OBSERVATION_CASE_STUDIES.findIndex((caseStudy) => caseStudy.id === currentCaseStudy.id)
		: -1

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
				{currentCaseStudy && (
					<section className="observation-lab" aria-label="Observation Lab case study">
						<div className="observation-lab-kicker">
							<span>Observation Lab</span>
							<span className="observation-lab-count">
								{currentCaseStudyIndex + 1} / {OBSERVATION_CASE_STUDIES.length}
							</span>
						</div>
						<label className="observation-lab-select">
							<span>Case study</span>
							<select value={currentCaseStudy.id} onChange={handleCaseStudyChange}>
								{OBSERVATION_CASE_STUDIES.map((caseStudy, index) => (
									<option key={caseStudy.id} value={caseStudy.id}>
										{index + 1}. {caseStudy.title}
									</option>
								))}
							</select>
						</label>
						<div className="observation-lab-heading">
							<span>{currentCaseStudy.aspect}</span>
							<h2>{currentCaseStudy.title}</h2>
						</div>
						<dl className="observation-lab-comparison">
							<div>
								<dt>Legacy</dt>
								<dd>{currentCaseStudy.legacy}</dd>
							</div>
							<div>
								<dt>CanvasAct</dt>
								<dd>{currentCaseStudy.canvasAct}</dd>
							</div>
						</dl>
						<div className="observation-lab-prompt">
							<div>
								<span>Suggested prompt</span>
								<button type="button" onClick={handleCopyPrompt}>
									{copyState === 'copied' ? 'Copied' : 'Copy'}
								</button>
							</div>
							<p>{currentCaseStudy.prompt}</p>
							<button
								className="observation-lab-use-prompt"
								type="button"
								onClick={handleUsePrompt}
							>
								Use prompt
							</button>
						</div>
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
