import {
	Box,
	createShapeId,
	type Editor,
	type TLArrowShape,
	type TLFrameShape,
	type TLGeoShape,
	type TLPage,
	type TLShapeId,
	type TLTextShape,
	toRichText,
} from 'tldraw'

export const OBSERVATION_CASE_STUDY_SUITE_ID = 'canvas-observation-lab'
export const OBSERVATION_CASE_STUDY_SUITE_VERSION = '4'

export type ObservationCaseStudyId =
	| 'viewport-coverage'
	| 'object-state'
	| 'workspace-structure'
	| 'explicit-relations'

type CanvasColor =
	| 'grey'
	| 'light-violet'
	| 'blue'
	| 'light-blue'
	| 'yellow'
	| 'orange'
	| 'green'

export interface ObservationCaseStudyDefinition {
	id: ObservationCaseStudyId
	pageName: string
	title: string
	aspect: string
	prompt: string
	legacy: string
	canvasAct: string
	viewX: number
	createShapes(editor: Editor): void
}

const VIEWPORT_WIDTH = 1200
const VIEWPORT_CENTER_Y = 400

export const OBSERVATION_CASE_STUDIES: readonly ObservationCaseStudyDefinition[] = [
	{
		id: 'viewport-coverage',
		pageName: 'Observation Lab · 01 Viewport Coverage',
		title: 'Offscreen identity under ambiguity',
		aspect: 'Workspace coverage',
		prompt: 'Place the only unlocked, offscreen “Q3 Result” below “Synthesis”.',
		legacy: 'Initially anonymous; after navigation, its shape summaries still omit lock state.',
		canvasAct: 'Each offscreen card retains its ID, full bounds, and locked flag.',
		viewX: 0,
		createShapes: createViewportCoverageCase,
	},
	{
		id: 'object-state',
		pageName: 'Observation Lab · 02 Object State',
		title: 'Occluded draft identity',
		aspect: 'Object state',
		prompt: 'Move only the blue “Figure 3 draft” into “Review”.',
		legacy: 'The screenshot shows only the top draft; identical summaries omit hidden colors.',
		canvasAct: 'Every layer retains its color, z-index, visibility, and occlusion relations.',
		viewX: 0,
		createShapes: createObjectStateCase,
	},
	{
		id: 'workspace-structure',
		pageName: 'Observation Lab · 03 Workspace Structure',
		title: 'True frame membership',
		aspect: 'Workspace structure',
		prompt: 'Move only the two cards that are actual members of “Methods” 80 pixels right.',
		legacy: 'All four cards look enclosed, so membership must be inferred from pixels.',
		canvasAct: 'Parent and frame-member relations distinguish real children from visual overlap.',
		viewX: 0,
		createShapes: createWorkspaceStructureCase,
	},
	{
		id: 'explicit-relations',
		pageName: 'Observation Lab · 04 Explicit Relations',
		title: 'Bound versus touching arrows',
		aspect: 'Relationships',
		prompt: 'Move the “Result” node that is actually connected to “Data” into “Review”.',
		legacy: 'The two arrows look connected and their topology must be inferred visually.',
		canvasAct: 'Arrow start, end, and connects relations identify the bound result.',
		viewX: 0,
		createShapes: createExplicitRelationsCase,
	},
] as const

const CASE_STUDY_BY_ID = new Map(
	OBSERVATION_CASE_STUDIES.map((caseStudy) => [caseStudy.id, caseStudy])
)

export function getCurrentObservationCaseStudy(editor: Editor) {
	return getObservationCaseStudyForPage(editor.getCurrentPage())
}

export function ensureObservationCaseStudySuite(
	editor: Editor,
	options: { rebuild?: boolean; onFit?: () => void } = {}
) {
	const previousPageId = editor.getCurrentPageId()
	const previousPageWasSuiteOwned =
		editor.getCurrentPage().meta.canvasActUsageScenarioSuiteId ===
		OBSERVATION_CASE_STUDY_SUITE_ID
	const previousCaseStudy = getCurrentObservationCaseStudy(editor)
	let createdAnyPage = false

	editor.run(
		() => {
			for (const caseStudy of OBSERVATION_CASE_STUDIES) {
				const matchingPages = getCaseStudyPages(editor, caseStudy.id)
				let page = matchingPages[0]
				if (!page) {
					editor.createPage({
						name: caseStudy.pageName,
						meta: getPageMeta(caseStudy),
					})
					page = getCaseStudyPages(editor, caseStudy.id)[0]
					createdAnyPage = true
				}
				if (!page) continue

				editor.setCurrentPage(page.id)
				const hasOwnedShapes = Array.from(editor.getPageShapeIds(page)).some((shapeId) => {
					const shape = editor.getShape(shapeId)
					return shape?.meta.canvasActUsageScenarioId === caseStudy.id
				})
				const isStale =
					page.meta.canvasActUsageScenarioVersion !==
						OBSERVATION_CASE_STUDY_SUITE_VERSION || !hasOwnedShapes

				if (options.rebuild || isStale) {
					resetCaseStudyPage(editor, page, caseStudy)
				} else {
					editor.updatePage({
						id: page.id,
						name: caseStudy.pageName,
						meta: getPageMeta(caseStudy),
					})
				}

				for (const duplicate of matchingPages.slice(1)) {
					if (editor.getPage(duplicate.id) && editor.getPages().length > 1) {
						editor.deletePage(duplicate.id)
					}
				}
			}

			// Remove pages owned by older suite versions when their case is retired.
			for (const page of editor.getPages()) {
				if (
					page.meta.canvasActUsageScenarioSuiteId === OBSERVATION_CASE_STUDY_SUITE_ID &&
					!CASE_STUDY_BY_ID.has(
						page.meta.canvasActUsageScenarioId as ObservationCaseStudyId
					) &&
					editor.getPages().length > 1
				) {
					editor.deletePage(page.id)
				}
			}

			const targetCaseStudy = previousCaseStudy ??
				(createdAnyPage || options.rebuild || previousPageWasSuiteOwned
					? OBSERVATION_CASE_STUDIES[0]
					: null)
			const targetPage = targetCaseStudy
				? getCaseStudyPages(editor, targetCaseStudy.id)[0]
				: editor.getPage(previousPageId)
			if (targetPage) editor.setCurrentPage(targetPage.id)
		},
		{ history: 'ignore', ignoreShapeLock: true }
	)

	if (getCurrentObservationCaseStudy(editor)) {
		fitCurrentObservationCaseStudy(editor, false, options.onFit)
	} else {
		options.onFit?.()
	}
}

export function selectObservationCaseStudy(
	editor: Editor,
	id: ObservationCaseStudyId,
	onFit?: () => void
) {
	const caseStudy = CASE_STUDY_BY_ID.get(id)
	if (!caseStudy) return
	const page = getCaseStudyPages(editor, id)[0]
	if (!page) return

	editor.setCurrentPage(page.id)
	fitCurrentObservationCaseStudy(editor, false, onFit)
}

export function resetCurrentObservationCaseStudy(editor: Editor, onFit?: () => void) {
	const caseStudy = getCurrentObservationCaseStudy(editor)
	if (!caseStudy) return
	const page = editor.getCurrentPage()

	editor.run(
		() => resetCaseStudyPage(editor, page, caseStudy),
		{ history: 'ignore', ignoreShapeLock: true }
	)
	// Reset is the experimental starting point, so snap to the canonical viewport before the
	// next request rather than leaving a short interval where the prior zoom is still active.
	fitCurrentObservationCaseStudy(editor, false, onFit)
}

export function fitCurrentObservationCaseStudy(
	editor: Editor,
	animate = true,
	onFit?: () => void
) {
	const caseStudy = getCurrentObservationCaseStudy(editor)
	if (!caseStudy) return
	const pageId = editor.getCurrentPageId()

	const fit = () => {
		if (editor.getCurrentPageId() !== pageId) return
		const currentCaseStudy = getCurrentObservationCaseStudy(editor)
		if (!currentCaseStudy || currentCaseStudy.id !== caseStudy.id) return

		const viewport = editor.getViewportScreenBounds()
		if (viewport.w <= 0 || viewport.h <= 0) {
			editor.zoomToBounds(new Box(caseStudy.viewX, 0, VIEWPORT_WIDTH, 800), {
				inset: 0,
				animation: animate ? { duration: 220 } : undefined,
			})
		} else {
			const zoom = viewport.w / VIEWPORT_WIDTH
			const viewportPageHeight = viewport.h / zoom
			const viewportTop = VIEWPORT_CENTER_Y - viewportPageHeight / 2
			editor.setCamera(
				{ x: -caseStudy.viewX, y: -viewportTop, z: zoom },
				{ animation: animate ? { duration: 220 } : undefined }
			)
		}
		onFit?.()
	}

	if (typeof window === 'undefined') fit()
	else window.requestAnimationFrame(fit)
}

function getObservationCaseStudyForPage(page: TLPage | undefined) {
	if (page?.meta.canvasActUsageScenarioSuiteId !== OBSERVATION_CASE_STUDY_SUITE_ID) {
		return null
	}
	const id = page.meta.canvasActUsageScenarioId
	return typeof id === 'string'
		? CASE_STUDY_BY_ID.get(id as ObservationCaseStudyId) ?? null
		: null
}

function getCaseStudyPages(editor: Editor, id: ObservationCaseStudyId) {
	return editor.getPages().filter(
		(page) =>
			page.meta.canvasActUsageScenarioSuiteId === OBSERVATION_CASE_STUDY_SUITE_ID &&
			page.meta.canvasActUsageScenarioId === id
	)
}

function getPageMeta(caseStudy: ObservationCaseStudyDefinition) {
	return {
		canvasActUsageScenarioSuiteId: OBSERVATION_CASE_STUDY_SUITE_ID,
		canvasActUsageScenarioId: caseStudy.id,
		canvasActUsageScenarioVersion: OBSERVATION_CASE_STUDY_SUITE_VERSION,
		canvasActUsageScenarioPrompt: caseStudy.prompt,
		canvasActUsageScenarioAspect: caseStudy.aspect,
	}
}

function getShapeMeta(caseStudyId: ObservationCaseStudyId) {
	return {
		canvasActUsageScenarioSuiteId: OBSERVATION_CASE_STUDY_SUITE_ID,
		canvasActUsageScenarioId: caseStudyId,
		canvasActUsageScenarioVersion: OBSERVATION_CASE_STUDY_SUITE_VERSION,
	}
}

function resetCaseStudyPage(
	editor: Editor,
	page: TLPage,
	caseStudy: ObservationCaseStudyDefinition
) {
	editor.selectNone()
	editor.deleteShapes(Array.from(editor.getPageShapeIds(page)))
	editor.updatePage({
		id: page.id,
		name: caseStudy.pageName,
		meta: getPageMeta(caseStudy),
	})
	caseStudy.createShapes(editor)
}

function createViewportCoverageCase(editor: Editor) {
	createGeo(editor, 'viewport-coverage', 'd4h8', 440, 240, 320, 160, 'Synthesis', {
		color: 'blue',
		fill: 'semi',
		size: 'm',
	})
	createText(editor, 'viewport-coverage', 'w3c6', 980, 105, 190, 'Q3 evidence tray  →', {
		color: 'grey',
		size: 's',
	})
	createGeo(editor, 'viewport-coverage', 'p5x1', 1240, 80, 560, 650, 'Q3 evidence tray', {
		color: 'grey',
		fill: 'none',
		dash: 'dashed',
		size: 's',
		verticalAlign: 'start',
	})
	// The candidates use opaque IDs and identical visible styling. Their lock state is native
	// tldraw state—not answer-bearing metadata—and is only explicit in CanvasObservation.
	createGeo(editor, 'viewport-coverage', 'k2m9', 1320, 160, 360, 120, 'Q3 Result', {
		color: 'light-blue',
		fill: 'solid',
		size: 'm',
		isLocked: true,
	})
	createGeo(editor, 'viewport-coverage', 'n7q4', 1320, 340, 360, 120, 'Q3 Result', {
		color: 'light-blue',
		fill: 'solid',
		size: 'm',
	})
	createGeo(editor, 'viewport-coverage', 'r8v3', 1320, 520, 360, 120, 'Q3 Result', {
		color: 'light-blue',
		fill: 'solid',
		size: 'm',
		isLocked: true,
	})
}

function createObjectStateCase(editor: Editor) {
	createText(editor, 'object-state', 'w6t1', 160, 180, 360, 'Figure 3 alternatives · 4 stacked', {
		color: 'grey',
		size: 's',
	})
	// These cards have exactly the same visible geometry and label. The opaque top layer hides
	// every lower layer from the screenshot, while CanvasObservation retains each layer's style
	// and z-order. Opaque IDs prevent the identifier itself from hinting at the requested color.
	createGeo(editor, 'object-state', 'v7p2', 160, 250, 300, 190, 'Figure 3 draft', {
		color: 'orange',
		fill: 'solid',
		size: 'l',
	})
	createGeo(editor, 'object-state', 'm4q8', 160, 250, 300, 190, 'Figure 3 draft', {
		color: 'blue',
		fill: 'solid',
		size: 'l',
	})
	createGeo(editor, 'object-state', 'c9r5', 160, 250, 300, 190, 'Figure 3 draft', {
		color: 'yellow',
		fill: 'solid',
		size: 'l',
	})
	createGeo(editor, 'object-state', 'h3n6', 160, 250, 300, 190, 'Figure 3 draft', {
		color: 'light-violet',
		fill: 'solid',
		size: 'l',
	})
	createGeo(editor, 'object-state', 'j5d3', 760, 215, 340, 260, 'Review', {
		color: 'grey',
		fill: 'none',
		dash: 'dashed',
		size: 'm',
		verticalAlign: 'start',
	})
}

function createWorkspaceStructureCase(editor: Editor) {
	const frameId = createShapeId('obs-workspace-structure-f1')
	editor.createShape<TLFrameShape>({
		id: frameId,
		type: 'frame',
		x: 100,
		y: 140,
		props: {
			w: 620,
			h: 520,
			name: 'Methods',
			color: 'blue',
		},
		meta: getShapeMeta('workspace-structure'),
	})

	createGeo(editor, 'workspace-structure', 'g1', 55, 100, 220, 110, 'Protocol', {
		color: 'light-blue',
		fill: 'solid',
		size: 'm',
		parentId: frameId,
	})
	createGeo(editor, 'workspace-structure', 'g2', 390, 240, 220, 110, 'Budget', {
		color: 'yellow',
		fill: 'solid',
		size: 'm',
	})
	createGeo(editor, 'workspace-structure', 'g3', 300, 315, 220, 110, 'Recruitment', {
		color: 'light-violet',
		fill: 'solid',
		size: 'm',
		parentId: frameId,
	})
	createGeo(editor, 'workspace-structure', 'g4', 150, 475, 220, 110, 'Timeline', {
		color: 'green',
		fill: 'solid',
		size: 'm',
	})
	// Keep the two visual decoys on the page. tldraw automatically adopts shapes that are
	// created inside a frame, so explicitly reparent them after creation while preserving their
	// page-space positions.
	editor.reparentShapes(
		[
			getShapeId('workspace-structure', 'g2'),
			getShapeId('workspace-structure', 'g4'),
		],
		editor.getCurrentPageId()
	)
}

function createExplicitRelationsCase(editor: Editor) {
	createGeo(editor, 'explicit-relations', 'g1', 100, 300, 190, 110, 'Data', {
		color: 'blue',
		fill: 'solid',
		size: 'm',
	})
	createGeo(editor, 'explicit-relations', 'g2', 850, 180, 210, 110, 'Result', {
		color: 'yellow',
		fill: 'solid',
		size: 'm',
	})
	createGeo(editor, 'explicit-relations', 'g3', 850, 430, 210, 110, 'Result', {
		color: 'yellow',
		fill: 'solid',
		size: 'm',
	})
	createGeo(editor, 'explicit-relations', 'g4', 420, 580, 340, 135, 'Review', {
		color: 'green',
		fill: 'none',
		dash: 'dashed',
		size: 'm',
	})
	createBoundArrow(editor, 'explicit-relations', 'a1', 'g1', 'g2')
	createArrow(editor, 'explicit-relations', 'a2', 290, 355, 560, 130)
}

function createGeo(
	editor: Editor,
	caseStudyId: ObservationCaseStudyId,
	localId: string,
	x: number,
	y: number,
	w: number,
	h: number,
	text: string,
	options: {
		color: CanvasColor
		fill: 'none' | 'semi' | 'solid'
		size: 's' | 'm' | 'l' | 'xl'
		dash?: 'draw' | 'solid' | 'dashed' | 'dotted'
		verticalAlign?: 'start' | 'middle' | 'end'
		isLocked?: boolean
		rotation?: number
		parentId?: TLShapeId
	}
) {
	editor.createShape<TLGeoShape>({
		id: getShapeId(caseStudyId, localId),
		type: 'geo',
		x,
		y,
		rotation: options.rotation ?? 0,
		isLocked: options.isLocked ?? false,
		...(options.parentId ? { parentId: options.parentId } : {}),
		props: {
			geo: 'rectangle',
			w,
			h,
			color: options.color,
			labelColor: 'black',
			fill: options.fill,
			dash: options.dash ?? 'solid',
			font: 'sans',
			size: options.size,
			align: 'middle',
			verticalAlign: options.verticalAlign ?? 'middle',
			richText: toRichText(text),
		},
		meta: getShapeMeta(caseStudyId),
	})
}

function createText(
	editor: Editor,
	caseStudyId: ObservationCaseStudyId,
	localId: string,
	x: number,
	y: number,
	w: number,
	text: string,
	options: { color: CanvasColor; size: 's' | 'm' | 'l' | 'xl' }
) {
	editor.createShape<TLTextShape>({
		id: getShapeId(caseStudyId, localId),
		type: 'text',
		x,
		y,
		props: {
			autoSize: false,
			w,
			color: options.color,
			font: 'sans',
			size: options.size,
			textAlign: 'start',
			richText: toRichText(text),
		},
		meta: getShapeMeta(caseStudyId),
	})
}

function createArrow(
	editor: Editor,
	caseStudyId: ObservationCaseStudyId,
	localId: string,
	x: number,
	y: number,
	dx: number,
	dy: number
) {
	editor.createShape<TLArrowShape>({
		id: getShapeId(caseStudyId, localId),
		type: 'arrow',
		x,
		y,
		props: {
			start: { x: 0, y: 0 },
			end: { x: dx, y: dy },
			color: 'grey',
			dash: 'solid',
			size: 'm',
			arrowheadStart: 'none',
			arrowheadEnd: 'arrow',
		},
		meta: getShapeMeta(caseStudyId),
	})
}

function createBoundArrow(
	editor: Editor,
	caseStudyId: ObservationCaseStudyId,
	localId: string,
	startLocalId: string,
	endLocalId: string
) {
	createArrow(editor, caseStudyId, localId, 0, 0, 120, 0)
	createArrowBinding(editor, caseStudyId, localId, startLocalId, 'start')
	createArrowBinding(editor, caseStudyId, localId, endLocalId, 'end')
}

function createArrowBinding(
	editor: Editor,
	caseStudyId: ObservationCaseStudyId,
	arrowLocalId: string,
	targetLocalId: string,
	terminal: 'start' | 'end'
) {
	editor.createBinding({
		type: 'arrow',
		fromId: getShapeId(caseStudyId, arrowLocalId),
		toId: getShapeId(caseStudyId, targetLocalId),
		props: {
			terminal,
			normalizedAnchor: { x: 0.5, y: 0.5 },
			isExact: false,
			isPrecise: false,
			snap: 'none',
		},
		meta: {},
	})
}

function getShapeId(caseStudyId: ObservationCaseStudyId, localId: string) {
	return createShapeId(`obs-${caseStudyId}-${localId}`)
}
