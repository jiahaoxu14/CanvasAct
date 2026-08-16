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
	fitCurrentObservationCaseStudy,
	getCurrentObservationCaseStudy,
	resetCurrentObservationCaseStudy,
} from '../usageScenario/observationCaseStudies'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { GoToAgentButtons } from './GoToAgentButton'

export function CustomHelperButtons() {
	return (
		<DefaultHelperButtons>
			<TldrawUiMenuContextProvider type="helper-buttons" sourceId="helper-buttons">
				<DefaultHelperButtonsContent />
				<ObservationCaseStudyControls />
				<GoToAgentButtons />
			</TldrawUiMenuContextProvider>
		</DefaultHelperButtons>
	)
}

function ObservationCaseStudyControls() {
	const editor = useEditor()
	const agent = useAgent()
	const caseStudyId = useValue(
		'currentObservationCaseStudyId',
		() => getCurrentObservationCaseStudy(editor)?.id ?? null,
		[editor]
	)

	useEffect(() => {
		if (caseStudyId) fitCurrentObservationCaseStudy(editor, false)
	}, [caseStudyId, editor])

	const handleReset = useCallback(() => {
		agent.reset()
		resetCurrentObservationCaseStudy(editor, () => agent.chatOrigin.reset())
	}, [agent, editor])

	if (!caseStudyId) return null

	return (
		<TldrawUiButton type="low" onClick={handleReset} title="Restore this workflow step">
			<TldrawUiButtonLabel>Reset step</TldrawUiButtonLabel>
		</TldrawUiButton>
	)
}
