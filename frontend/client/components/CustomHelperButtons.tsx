import { useCallback, useEffect } from 'react'
import {
	DefaultHelperButtons,
	DefaultHelperButtonsContent,
	TldrawUiButton,
	TldrawUiButtonLabel,
	TldrawUiMenuContextProvider,
	useEditor,
	useValue,
} from 'tldraw'
import {
	fitResearchWorkspaceScenario,
	getCurrentResearchWorkspaceScenario,
	resetResearchWorkspaceScenario,
} from '../usageScenario/researchWorkspaceScenario'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { GoToAgentButtons } from './GoToAgentButton'

export function CustomHelperButtons() {
	return (
		<DefaultHelperButtons>
			<TldrawUiMenuContextProvider type="helper-buttons" sourceId="helper-buttons">
				<DefaultHelperButtonsContent />
				<ResearchWorkspaceScenarioControls />
				<GoToAgentButtons />
			</TldrawUiMenuContextProvider>
		</DefaultHelperButtons>
	)
}

function ResearchWorkspaceScenarioControls() {
	const editor = useEditor()
	const agent = useAgent()
	const scenarioPageId = useValue(
		'researchWorkspaceScenarioPageId',
		() => getCurrentResearchWorkspaceScenario(editor)?.id ?? null,
		[editor]
	)

	useEffect(() => {
		if (scenarioPageId) fitResearchWorkspaceScenario(editor, false)
	}, [editor, scenarioPageId])

	const handleReset = useCallback(() => {
		agent.reset()
		resetResearchWorkspaceScenario(editor)
	}, [agent, editor])

	if (!scenarioPageId) return null

	return (
		<TldrawUiButton type="low" onClick={handleReset} title="Restore the original case study">
			<TldrawUiButtonLabel>Reset scenario</TldrawUiButtonLabel>
		</TldrawUiButton>
	)
}
