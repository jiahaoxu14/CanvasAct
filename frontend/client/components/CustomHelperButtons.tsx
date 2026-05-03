import {
	DefaultHelperButtons,
	DefaultHelperButtonsContent,
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiButtonLabel,
	TldrawUiMenuContextProvider,
	useEditor,
} from 'tldraw'
import { loadShowcaseDemoCanvas } from '../demo/loadShowcaseDemoCanvas'
import { GoToAgentButtons } from './GoToAgentButton'

export function CustomHelperButtons() {
	return (
		<DefaultHelperButtons>
			<TldrawUiMenuContextProvider type="helper-buttons" sourceId="helper-buttons">
				<DefaultHelperButtonsContent />
				<LoadShowcaseDemoCanvasButton />
				<GoToAgentButtons />
			</TldrawUiMenuContextProvider>
		</DefaultHelperButtons>
	)
}

function LoadShowcaseDemoCanvasButton() {
	const editor = useEditor()

	return (
		<TldrawUiButton
			type="low"
			title="Replace the current page with the CanvasAct showcase demo canvas"
			onClick={() => {
				const confirmed = window.confirm(
					'Replace the current page with the CanvasAct showcase demo canvas?'
				)
				if (!confirmed) return
				loadShowcaseDemoCanvas(editor)
			}}
		>
			<TldrawUiButtonIcon icon="pack" />
			<TldrawUiButtonLabel>Load demo</TldrawUiButtonLabel>
		</TldrawUiButton>
	)
}
