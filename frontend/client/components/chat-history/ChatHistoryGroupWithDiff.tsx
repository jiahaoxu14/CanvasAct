import { useCallback, useMemo } from 'react'
import { reverseRecordsDiff, squashRecordDiffs } from 'tldraw'
import { AgentIcon, AgentIconType } from '../../../shared/icons/AgentIcon'
import { ChatHistoryActionItem } from '../../../shared/types/ChatHistoryItem'
import { useAgent } from '../../agent/TldrawAgentAppProvider'
import { ChatHistoryGroup } from './ChatHistoryGroup'
import { TldrawDiffViewer } from './TldrawDiffViewer'
import { getActionInfo } from './getActionInfo'

export function ChatHistoryGroupWithDiff({ group }: { group: ChatHistoryGroup }) {
	const agent = useAgent()
	const { items } = group
	const { editor } = agent
	const diff = useMemo(() => squashRecordDiffs(items.map((item) => item.diff)), [items])
	const acceptance = useMemo<ChatHistoryActionItem['acceptance']>(() => {
		if (items.length === 0) return 'pending'
		const first = items[0].acceptance
		return items.every((item) => item.acceptance === first) ? first : 'pending'
	}, [items])

	// Accept all changes from this group
	const handleAccept = useCallback(() => {
		agent.chat.update((currentChatHistoryItems) => {
			const newItems = [...currentChatHistoryItems]
			if (acceptance === 'rejected') editor.store.applyDiff(diff)
			for (const item of items) {
				const index = newItems.findIndex((v) => v === item)

				// Mark the item as accepted
				if (index !== -1) {
					newItems[index] = { ...item, acceptance: 'accepted' }
				}

			}
			return newItems
		})
	}, [items, editor, agent.chat, acceptance, diff])

	// Reject all changes from this group
	const handleReject = useCallback(() => {
		agent.chat.update((currentChatHistoryItems) => {
			const newItems = [...currentChatHistoryItems]
			if (acceptance !== 'rejected') editor.store.applyDiff(reverseRecordsDiff(diff))
			for (const item of items) {
				const index = newItems.findIndex((v) => v === item)

				// Mark the item as rejected
				if (index !== -1) {
					newItems[index] = { ...item, acceptance: 'rejected' }
				}

			}
			return newItems
		})
	}, [items, editor, agent.chat, acceptance, diff])

	const steps = useMemo(
		() => items.map((item) => getActionInfo(item.action, agent)),
		[items, agent]
	)

	return (
		<div className="chat-history-change">
			<div className="chat-history-change-acceptance">
				<button onClick={handleReject} disabled={acceptance === 'rejected'}>
					{acceptance === 'rejected' ? 'Rejected' : 'Reject'}
				</button>
				<button onClick={handleAccept} disabled={acceptance === 'accepted'}>
					{acceptance === 'accepted' ? 'Accepted' : 'Accept'}
				</button>
			</div>
			<DiffSteps steps={steps} />
			<TldrawDiffViewer diff={diff} />
		</div>
	)
}

interface DiffStep {
	icon: AgentIconType | null
	description: string | null
}

function DiffSteps({ steps }: { steps: DiffStep[] }) {
	let previousDescription = ''
	return (
		<div className="agent-changes">
			{steps.map((step, i) => {
				if (!step.description) return null

				if (step.description === previousDescription) return null
				previousDescription = step.description
				return (
					<div className="agent-change" key={'intent-' + i}>
						{step.icon && (
							<span className="agent-change-icon">
								<AgentIcon type={step.icon} />
							</span>
						)}
						{step.description}
					</div>
				)
			})}
		</div>
	)
}
