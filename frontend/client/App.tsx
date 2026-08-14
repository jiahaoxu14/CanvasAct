import { useCallback, useEffect, useMemo, useState } from 'react'
import {
	DefaultSizeStyle,
	type Editor,
	ErrorBoundary,
	TLComponents,
	Tldraw,
	TldrawOverlays,
	TldrawUiToastsProvider,
	TLUiOverrides,
} from 'tldraw'
import { TldrawAgentApp } from './agent/TldrawAgentApp'
import {
	TldrawAgentAppContextProvider,
	TldrawAgentAppProvider,
} from './agent/TldrawAgentAppProvider'
import { ChatPanel } from './components/ChatPanel'
import { ChatPanelFallback } from './components/ChatPanelFallback'
import { CustomHelperButtons } from './components/CustomHelperButtons'
import { AgentViewportBoundsHighlights } from './components/highlights/AgentViewportBoundsHighlights'
import { AllContextHighlights } from './components/highlights/ContextHighlights'
import { TargetAreaTool } from './tools/TargetAreaTool'
import { TargetShapeTool } from './tools/TargetShapeTool'
import {
	ensureObservationCaseStudySuite,
	OBSERVATION_CASE_STUDY_SUITE_VERSION,
} from './usageScenario/observationCaseStudies'

// Customize tldraw's styles to play to the agent's strengths
DefaultSizeStyle.setDefaultValue('s')

// Custom tools for picking context items
const tools = [TargetShapeTool, TargetAreaTool]
const CANVAS_PERSISTENCE_KEY = 'canvasact-agent-v2'
const LEGACY_CANVAS_PERSISTENCE_KEYS = ['canvasact-agent', 'canvasact-agent-demo-v1']
const TLDRAW_DATABASE_PREFIX = 'TLDRAW_DOCUMENT_v2'
const TLDRAW_ASSET_DATABASE_PREFIX = 'TLDRAW_ASSET_STORE_v1'
const TLDRAW_DATABASE_INDEX_KEY = 'TLDRAW_DB_NAME_INDEX_v2'
const OBSERVATION_CASE_STUDY_MIGRATION_KEY =
	'canvasact-observation-case-study-suite-version'

function deleteIndexedDatabase(name: string) {
	return new Promise<void>((resolve, reject) => {
		const request = window.indexedDB.deleteDatabase(name)
		request.onsuccess = () => resolve()
		request.onerror = () => reject(request.error)
	})
}

async function deleteLegacyCanvasSaves() {
	const legacyDatabaseNames = LEGACY_CANVAS_PERSISTENCE_KEYS.flatMap((persistenceKey) => [
		`${TLDRAW_DATABASE_PREFIX}${persistenceKey}`,
		`${TLDRAW_ASSET_DATABASE_PREFIX}${persistenceKey}`,
	])

	await Promise.all(legacyDatabaseNames.map(deleteIndexedDatabase))

	try {
		const indexedNames = JSON.parse(
			window.localStorage.getItem(TLDRAW_DATABASE_INDEX_KEY) ?? '[]'
		)
		if (!Array.isArray(indexedNames)) return

		const remainingNames = indexedNames.filter((name) => !legacyDatabaseNames.includes(name))
		window.localStorage.setItem(TLDRAW_DATABASE_INDEX_KEY, JSON.stringify(remainingNames))
	} catch {
		// A malformed or unavailable index cannot restore the deleted database.
	}
}

const REMOVED_CASE_STUDY_PAGE_NAME =
	/(?:\bcase[\s_-]*study(?:[\s_-]*(?:1|2)|\s*·\s*(?:coastal storm handoff|metrocare capacity dashboard))\b|^case study\s*·\s*research project workspace$)/i
const REMOVED_USAGE_SCENARIO_IDS = new Set([
	'operational-workflow',
	'dashboard-cleanup',
	'coastal-storm-handoff',
	'metrocare-capacity-dashboard',
	'evidence-synthesis-board',
	'research-project-workspace',
])

function deleteRemovedPrototypePages(editor: Editor) {
	const removedPages = editor.getPages().filter((page) => {
		const usageScenarioId = page.meta.canvasActUsageScenarioId
		return (
			typeof page.meta.canvasActDemoVersion === 'string' ||
			(typeof usageScenarioId === 'string' && REMOVED_USAGE_SCENARIO_IDS.has(usageScenarioId)) ||
			REMOVED_CASE_STUDY_PAGE_NAME.test(page.name)
		)
	})
	if (removedPages.length === 0) return

	const removedPageIds = new Set(removedPages.map((page) => page.id))
	editor.run(
		() => {
			let remainingPages = editor
				.getPages()
				.filter((page) => !removedPageIds.has(page.id))
			if (remainingPages.length === 0) {
				editor.createPage({ name: 'Page 1' })
				remainingPages = editor
					.getPages()
					.filter((page) => !removedPageIds.has(page.id))
			}

			if (removedPageIds.has(editor.getCurrentPageId()) && remainingPages[0]) {
				editor.setCurrentPage(remainingPages[0].id)
			}

			for (const page of removedPages) {
				if (editor.getPage(page.id) && editor.getPages().length > 1) {
					editor.deletePage(page.id)
				}
			}
		},
		{ history: 'ignore' }
	)
}

const overrides: TLUiOverrides = {
	tools: (editor, tools) => {
		return {
			...tools,
			'target-area': {
				id: 'target-area',
				label: 'Pick Area',
				kbd: 'c',
				icon: 'tool-frame',
				onSelect() {
					editor.setCurrentTool('target-area')
				},
			},
			'target-shape': {
				id: 'target-shape',
				label: 'Pick Shape',
				kbd: 's',
				icon: 'tool-frame',
				onSelect() {
					editor.setCurrentTool('target-shape')
				},
			},
		}
	},
}

function App() {
	const [app, setApp] = useState<TldrawAgentApp | null>(null)

	useEffect(() => {
		void deleteLegacyCanvasSaves().catch((error) => {
			console.warn('Could not delete legacy prototype saves', error)
		})
	}, [])

	const handleUnmount = useCallback(() => {
		setApp(null)
	}, [])

	const handleMount = useCallback((mountedApp: TldrawAgentApp) => {
		deleteRemovedPrototypePages(mountedApp.editor)
		const shouldRebuildCaseStudies =
			window.localStorage.getItem(OBSERVATION_CASE_STUDY_MIGRATION_KEY) !==
			OBSERVATION_CASE_STUDY_SUITE_VERSION

		ensureObservationCaseStudySuite(mountedApp.editor, {
			rebuild: shouldRebuildCaseStudies,
			onFit: shouldRebuildCaseStudies
				? () => {
						mountedApp.agents.resetAllAgents()
						window.localStorage.setItem(
							OBSERVATION_CASE_STUDY_MIGRATION_KEY,
							OBSERVATION_CASE_STUDY_SUITE_VERSION
						)
						setApp(mountedApp)
					}
				: undefined,
		})
		if (!shouldRebuildCaseStudies) setApp(mountedApp)
	}, [])

	// Custom components to visualize what the agent is doing
	// These use TldrawAgentAppContextProvider to access the app/agent
	const components: TLComponents = useMemo(() => {
		return {
			HelperButtons: () =>
				app && (
					<TldrawAgentAppContextProvider app={app}>
						<CustomHelperButtons />
					</TldrawAgentAppContextProvider>
				),
			Overlays: () => (
				<>
					<TldrawOverlays />
					{app && (
						<TldrawAgentAppContextProvider app={app}>
							<AgentViewportBoundsHighlights />
							<AllContextHighlights />
						</TldrawAgentAppContextProvider>
					)}
				</>
			),
		}
	}, [app])

	return (
		<TldrawUiToastsProvider>
			<div className="tldraw-agent-container">
				<div className="tldraw-canvas">
					<Tldraw
						persistenceKey={CANVAS_PERSISTENCE_KEY}
						tools={tools}
						overrides={overrides}
						components={components}
					>
						<TldrawAgentAppProvider onMount={handleMount} onUnmount={handleUnmount} />
					</Tldraw>
				</div>
				<ErrorBoundary fallback={ChatPanelFallback}>
					{app && (
						<TldrawAgentAppContextProvider app={app}>
							<ChatPanel />
						</TldrawAgentAppContextProvider>
					)}
				</ErrorBoundary>
			</div>
		</TldrawUiToastsProvider>
	)
}

export default App
