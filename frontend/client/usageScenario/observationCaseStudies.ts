import {
	Box,
	createShapeId,
	type Editor,
	type TLArrowShape,
	type TLFrameShape,
	type TLGeoShape,
	type TLPage,
	type TLParentId,
	type TLShapeId,
	toRichText,
} from 'tldraw'

export const OBSERVATION_CASE_STUDY_SUITE_ID = 'canvas-observation-lab'
export const OBSERVATION_CASE_STUDY_SUITE_VERSION = '32'

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
	story: string
	completedBefore: number
	prompt: string
	legacy: string
	canvasAct: string
	viewX: number
	viewWidth: number
	createShapes(editor: Editor): void
}

const VIEWPORT_HEIGHT = 800
// Leave extra room below the workflow on narrow canvases for tldraw's floating toolbars,
// without pushing the top-row frame labels under the navigation bar.
const NARROW_VIEWPORT_Y = 80

export const OBSERVATION_CASE_STUDIES: readonly ObservationCaseStudyDefinition[] = [
	{
		id: 'viewport-coverage',
		pageName: 'Remote Team Handoff · 01 Stage Takeaway',
		title: 'Stage the current takeaway',
		aspect: 'Step 1 · Workspace coverage',
		story:
			'To start Friday’s report, the researcher pulls in the team’s live takeaway from its saved versions.',
		completedBefore: 0,
		prompt: 'Add the current working copy of “Unclear ownership delays handoffs” to Friday’s report.',
		legacy: 'The saved versions are initially anonymous, and later summaries still omit which copy is editable.',
		canvasAct: 'Each saved version retains its ID, action-space bounds, and locked state.',
		viewX: 20,
		viewWidth: 1680,
		createShapes: (editor) => createResearchWorkspace(editor, 'viewport-coverage', 0),
	},
	{
		id: 'object-state',
		pageName: 'Remote Team Handoff · 02 Stage Chart',
		title: 'Stage the approved chart',
		aspect: 'Step 2 · Object state',
		story: 'With the takeaway in place, the team stages its approved chart for Friday’s review.',
		completedBefore: 1,
		prompt: 'The team chose the blue “Handoff breakdown” chart. Add it to Friday’s report.',
		legacy: 'The screenshot shows only the top chart; identical summaries omit the hidden colors.',
		canvasAct: 'Every chart retains its color, layer order, visibility, and occlusion relations.',
		viewX: 20,
		viewWidth: 1680,
		createShapes: (editor) => createResearchWorkspace(editor, 'object-state', 1),
	},
	{
		id: 'workspace-structure',
		pageName: 'Remote Team Handoff · 03 Split Study Setups',
		title: 'Move the loose setup cards',
		aspect: 'Step 3 · Workspace structure',
		story:
			'During handoff, two cards were pasted over the first setup frame instead of being filed with the second.',
		completedBefore: 2,
		prompt:
			'Move the two unattached cards from “Study setup A” to the empty “Study setup B”.',
		legacy:
			'All four cards appear inside Study setup A, while legacy summaries omit which two are native frame children.',
		canvasAct:
			'Two frame-member relations identify the attached pair, leaving the other two cards to move.',
		viewX: 20,
		viewWidth: 1680,
		createShapes: (editor) => createResearchWorkspace(editor, 'workspace-structure', 2),
	},
	{
		id: 'explicit-relations',
		pageName: 'Remote Team Handoff · 04 Complete Report',
		title: 'Add the supported finding',
		aspect: 'Step 4 · Explicit relations',
		story: 'Before sharing the report, the researcher adds a finding with traceable interview support.',
		completedBefore: 3,
		prompt: 'Move the interview-backed “Lost decision context” finding to Friday’s report.',
		legacy: 'Both arrows appear to touch a finding, so the real evidence link must be inferred visually.',
		canvasAct: 'The native arrow binding explicitly records the evidence-to-finding relationship.',
		// Every checkpoint uses the same overview so switching steps never changes the framing.
		viewX: 20,
		viewWidth: 1680,
		createShapes: (editor) => createResearchWorkspace(editor, 'explicit-relations', 3),
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

		// The editor normally tracks this via ResizeObserver, but synchronizing here prevents an
		// initial fit from using tldraw's fallback viewport before the DOM measurement arrives.
		editor.updateViewportScreenBounds(editor.getContainer())
		const viewport = editor.getViewportScreenBounds()
		const viewY = viewport.w <= 768 ? NARROW_VIEWPORT_Y : 0
		editor.zoomToBounds(
			new Box(caseStudy.viewX, viewY, caseStudy.viewWidth, VIEWPORT_HEIGHT),
			{
				animation: animate ? { duration: 220 } : undefined,
			}
		)
		onFit?.()
	}

	if (typeof window === 'undefined') fit()
	else window.requestAnimationFrame(fit)
}

/** Keep a workflow checkpoint framed when its canvas changes size. */
export function installObservationCaseStudyAutoFit(editor: Editor) {
	let animationFrame: number | null = null

	const handleResize = () => {
		if (!getCurrentObservationCaseStudy(editor)) return
		if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
		animationFrame = window.requestAnimationFrame(() => {
			animationFrame = null
			fitCurrentObservationCaseStudy(editor, false)
		})
	}

	editor.on('resize', handleResize)
	return () => {
		editor.off('resize', handleResize)
		if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
	}
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
		canvasActUsageScenarioStory: caseStudy.story,
		canvasActUsageScenarioCompletedBefore: caseStudy.completedBefore,
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

/**
 * Build one realistic handoff-report workspace at a deterministic checkpoint.
 * Every case-study page contains this same logical board. `completedSteps` applies the
 * canonical outcomes of earlier prompts so the four pages read as a continuous workflow.
 */
function createResearchWorkspace(
	editor: Editor,
	caseStudyId: ObservationCaseStudyId,
	completedSteps: number
) {
	createWorkspaceZones(editor, caseStudyId)
	// Create the report slots before their source cards so moved content renders above the slots.
	createReviewArea(editor, caseStudyId)
	createMethodsArea(editor, caseStudyId)
	createSynthesisArea(editor, caseStudyId)
	createEvidenceMap(editor, caseStudyId)
	createFigureAlternatives(editor, caseStudyId)
	createReviewChecklist(editor, caseStudyId, completedSteps)
	createVersionArchive(editor, caseStudyId)
	applyCompletedWorkflowSteps(editor, caseStudyId, completedSteps)
}

function createWorkspaceZones(editor: Editor, caseStudyId: ObservationCaseStudyId) {
	// Use native tldraw frames for consistent workspace chrome. Ordinary cards are explicitly
	// page-parented below because the shared legacy move/place actions do not reparent across
	// frames. The two Study setup A members are the deliberate structural exception used in Step 3.
	createFrame(editor, caseStudyId, 'z2s8', 590, 130, 520, 320, 'Findings', 'grey')
	createFrame(editor, caseStudyId, 'z4e6', 1160, 130, 520, 320, 'Evidence trail', 'grey')
	createFrame(editor, caseStudyId, 'z6f3', 40, 545, 360, 230, 'Charts', 'grey')
	createFrame(editor, caseStudyId, 'j5d3', 410, 545, 740, 230, 'Friday report', 'green')
	createFrame(editor, caseStudyId, 'z8k2', 1160, 545, 520, 230, 'Friday checklist', 'grey')
	createFrame(editor, caseStudyId, 'p5x1', 2200, 130, 470, 610, 'Finding versions', 'grey')
}

function createMethodsArea(editor: Editor, caseStudyId: ObservationCaseStudyId) {
	const firstFrameId = createFrame(
		editor,
		caseStudyId,
		'f1u6',
		40,
		130,
		240,
		320,
		'Study setup A',
		'blue'
	)
	createFrame(editor, caseStudyId, 'f2u7', 300, 130, 240, 320, 'Study setup B', 'blue')

	// All four cards form one balanced 2x2 grid inside Study setup A. The two native children
	// occupy one diagonal; the other diagonal consists of page-level cards that only look attached.
	createGeo(editor, caseStudyId, 'u2c7', 20, 60, 90, 90, 'Calls · 6 teams', {
		color: 'light-blue',
		fill: 'solid',
		size: 's',
		parentId: firstFrameId,
	})
	createGeo(editor, caseStudyId, 'b6k4', 170, 190, 90, 90, 'Diaries · 4 teams', {
		color: 'light-violet',
		fill: 'solid',
		size: 's',
	})
	createGeo(editor, caseStudyId, 'r9m1', 130, 170, 90, 90, 'Calls · 45 min', {
		color: 'light-blue',
		fill: 'solid',
		size: 's',
		parentId: firstFrameId,
	})
	createGeo(editor, caseStudyId, 't4v8', 60, 300, 90, 90, 'Diaries · 7 days', {
		color: 'light-violet',
		fill: 'solid',
		size: 's',
	})

	// These two cards were pasted over Study setup A. They look enclosed but remain page-level.
	editor.reparentShapes(
		[getShapeId(caseStudyId, 'b6k4'), getShapeId(caseStudyId, 't4v8')],
		editor.getCurrentPageId()
	)
}

function createSynthesisArea(editor: Editor, caseStudyId: ObservationCaseStudyId) {
	const pageId = editor.getCurrentPageId()
	createGeo(editor, caseStudyId, 'd4h8', 620, 185, 210, 90, 'Handoff themes', {
		color: 'blue',
		fill: 'semi',
		size: 'm',
		parentId: pageId,
	})
	createGeo(
		editor,
		caseStudyId,
		'q2w5',
		850,
		185,
		230,
		90,
		'What breaks during team handoffs?',
		{
			color: 'light-violet',
			fill: 'solid',
			size: 'm',
			parentId: pageId,
		}
	)
	createGeo(
		editor,
		caseStudyId,
		'q8n2',
		620,
		305,
		460,
		90,
		'18 interviews coded · 5 recurring breakdowns',
		{
			color: 'light-blue',
			fill: 'semi',
			size: 'm',
			parentId: pageId,
		}
	)
}

function createEvidenceMap(editor: Editor, caseStudyId: ObservationCaseStudyId) {
	const pageId = editor.getCurrentPageId()
	createGeo(editor, caseStudyId, 'e2s6', 1190, 240, 140, 95, 'Interview evidence', {
		color: 'blue',
		fill: 'solid',
		size: 'm',
		parentId: pageId,
	})
	createGeo(editor, caseStudyId, 'q4w8', 1350, 175, 170, 95, 'Lost decision context', {
		color: 'yellow',
		fill: 'solid',
		size: 'm',
		parentId: pageId,
	})
	createGeo(editor, caseStudyId, 'l7n3', 1350, 305, 170, 95, 'Lost decision context', {
		color: 'yellow',
		fill: 'solid',
		size: 'm',
		parentId: pageId,
	})
	createBoundArrow(editor, caseStudyId, 'a5d9', 'e2s6', 'q4w8')
	// This loose arrow visually touches the lower finding but has no end binding.
	createArrow(editor, caseStudyId, 'a8p2', 1330, 280, 20, 72, pageId)
}

function createFigureAlternatives(editor: Editor, caseStudyId: ObservationCaseStudyId) {
	const pageId = editor.getCurrentPageId()
	// Identical geometry and labels make every lower draft fully hidden by the violet top layer.
	createGeo(editor, caseStudyId, 'v7p2', 125, 625, 190, 95, 'Handoff breakdown', {
		color: 'orange',
		fill: 'solid',
		size: 'm',
		parentId: pageId,
	})
	createGeo(editor, caseStudyId, 'm4q8', 125, 625, 190, 95, 'Handoff breakdown', {
		color: 'blue',
		fill: 'solid',
		size: 'm',
		parentId: pageId,
	})
	createGeo(editor, caseStudyId, 'c9r5', 125, 625, 190, 95, 'Handoff breakdown', {
		color: 'yellow',
		fill: 'solid',
		size: 'm',
		parentId: pageId,
	})
	createGeo(editor, caseStudyId, 'h3n6', 125, 625, 190, 95, 'Handoff breakdown', {
		color: 'light-violet',
		fill: 'solid',
		size: 'm',
		parentId: pageId,
	})
}

function createReviewArea(editor: Editor, caseStudyId: ObservationCaseStudyId) {
	// Native frames keep each destination title outside its content area, so a placed card can
	// fill the destination without covering or colliding with its label.
	createFrame(editor, caseStudyId, 'f3r7', 420, 645, 220, 115, 'Chart', 'grey')
	createFrame(editor, caseStudyId, 's7y3', 650, 645, 260, 115, 'Key', 'grey')
	createFrame(editor, caseStudyId, 'c6p2', 920, 645, 220, 115, 'Claim', 'grey')
}

function createReviewChecklist(
	editor: Editor,
	caseStudyId: ObservationCaseStudyId,
	completedSteps: number
) {
	const pageId = editor.getCurrentPageId()
	const items = [
		{ id: 'k1r4', x: 1190, y: 615, pending: 'Add takeaway', done: '✓ Takeaway' },
		{ id: 'k2r5', x: 1430, y: 615, pending: 'Add chart', done: '✓ Chart' },
		{ id: 'k3r6', x: 1190, y: 695, pending: 'Split setups', done: '✓ Setups split' },
		{
			id: 'k4r7',
			x: 1430,
			y: 695,
			pending: 'Trace evidence',
			done: '✓ Evidence',
		},
	] as const

	for (const [index, item] of items.entries()) {
		const isComplete = index < completedSteps
		createGeo(editor, caseStudyId, item.id, item.x, item.y, 210, 65, isComplete ? item.done : item.pending, {
			color: isComplete ? 'green' : 'grey',
			fill: isComplete ? 'solid' : 'semi',
			size: 'm',
			parentId: pageId,
		})
	}
}

function createVersionArchive(editor: Editor, caseStudyId: ObservationCaseStudyId) {
	const pageId = editor.getCurrentPageId()
	// Opaque IDs and identical visible styling keep lock state as the only target discriminator.
	createGeo(editor, caseStudyId, 'k2m9', 2315, 210, 240, 95, 'Unclear ownership delays handoffs', {
		color: 'light-blue',
		fill: 'solid',
		size: 'm',
		isLocked: true,
		parentId: pageId,
	})
	createGeo(editor, caseStudyId, 'n7q4', 2315, 380, 240, 95, 'Unclear ownership delays handoffs', {
		color: 'light-blue',
		fill: 'solid',
		size: 'm',
		parentId: pageId,
	})
	createGeo(editor, caseStudyId, 'r8v3', 2315, 550, 240, 95, 'Unclear ownership delays handoffs', {
		color: 'light-blue',
		fill: 'solid',
		size: 'm',
		isLocked: true,
		parentId: pageId,
	})
}

function applyCompletedWorkflowSteps(
	editor: Editor,
	caseStudyId: ObservationCaseStudyId,
	completedSteps: number
) {
	if (completedSteps >= 1) {
		editor.updateShape({
			id: getShapeId(caseStudyId, 'n7q4'),
			type: 'geo',
			x: 660,
			y: 655,
		})
	}
	if (completedSteps >= 2) {
		editor.updateShape({
			id: getShapeId(caseStudyId, 'm4q8'),
			type: 'geo',
			x: 435,
			y: 655,
		})
	}
	if (completedSteps >= 3) {
		const movedCards = [
			{ localId: 'b6k4', x: 320 },
			{ localId: 't4v8', x: 430 },
		] as const
		for (const { localId, x } of movedCards) {
			editor.updateShape({
				id: getShapeId(caseStudyId, localId),
				type: 'geo',
				x,
				y: 190,
			})
		}
	}
}

function createFrame(
	editor: Editor,
	caseStudyId: ObservationCaseStudyId,
	localId: string,
	x: number,
	y: number,
	w: number,
	h: number,
	name: string,
	color: CanvasColor
) {
	const frameId = getShapeId(caseStudyId, localId)
	editor.createShape<TLFrameShape>({
		id: frameId,
		type: 'frame',
		parentId: editor.getCurrentPageId(),
		x,
		y,
		props: { w, h, name, color },
		meta: getShapeMeta(caseStudyId),
	})
	return frameId
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
		parentId?: TLParentId
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

function createArrow(
	editor: Editor,
	caseStudyId: ObservationCaseStudyId,
	localId: string,
	x: number,
	y: number,
	dx: number,
	dy: number,
	parentId?: TLParentId
) {
	editor.createShape<TLArrowShape>({
		id: getShapeId(caseStudyId, localId),
		type: 'arrow',
		x,
		y,
		...(parentId ? { parentId } : {}),
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
