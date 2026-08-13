import {
	Box,
	createShapeId,
	Editor,
	TLArrowShape,
	TLGeoShape,
	TLPage,
	TLShapeId,
	TLTextShape,
	toRichText,
} from 'tldraw'
import {
	CANVASACT_WORKSPACE_ROLE_KEY,
	CANVASACT_WORKSPACE_ROLES,
	type CanvasActWorkspaceRole,
} from '../../shared/workspaceSemantics'

export const RESEARCH_WORKSPACE_SCENARIO_ID = 'research-project-workspace'
export const RESEARCH_WORKSPACE_SCENARIO_VERSION = '2'
export const RESEARCH_WORKSPACE_PAGE_NAME = 'Case Study · Research Project Workspace'
export const RESEARCH_WORKSPACE_PROMPT = 'Organize this research workspace by theme.'

const RESEARCH_WORKSPACE_BOUNDS = new Box(0, 0, 1540, 1000)

type CanvasColor =
	| 'black'
	| 'grey'
	| 'light-violet'
	| 'violet'
	| 'blue'
	| 'light-blue'
	| 'yellow'
	| 'orange'
	| 'green'
	| 'red'
	| 'light-red'
	| 'white'

type ThemeId = 'navigation-context' | 'semantic-manipulation' | 'trust-verification'

interface ResearchCard {
	id: string
	themeId: ThemeId
	order: 1 | 2 | 3
	artifactType: 'prior work' | 'study evidence' | 'design direction'
	text: string
	x: number
	y: number
	color: CanvasColor
}

const THEMES: Array<{
	id: ThemeId
	containerId: string
	y: number
	index: string
	title: string
	subtitle: string
}> = [
	{
		id: 'navigation-context',
		containerId: 'theme-navigation-context',
		y: 254,
		index: '01',
		title: 'NAVIGATION & CONTEXT',
		subtitle: 'Keep people oriented across a workspace larger than the viewport',
	},
	{
		id: 'semantic-manipulation',
		containerId: 'theme-semantic-manipulation',
		y: 494,
		index: '02',
		title: 'SEMANTIC MANIPULATION',
		subtitle: 'Change layout without breaking the meaning carried by structure',
	},
	{
		id: 'trust-verification',
		containerId: 'theme-trust-verification',
		y: 734,
		index: '03',
		title: 'TRUST & VERIFICATION',
		subtitle: 'Make completion and unresolved problems visible to the researcher',
	},
]

const RESEARCH_CARDS: ResearchCard[] = [
	{
		id: 'nav-prior-work',
		themeId: 'navigation-context',
		order: 1,
		artifactType: 'prior work',
		text:
			'PRIOR WORK · Cockburn et al., 2009\nOverview + detail views help people retain context in large information spaces.',
		x: 72,
		y: 340,
		color: 'light-blue',
	},
	{
		id: 'nav-study-evidence',
		themeId: 'navigation-context',
		order: 2,
		artifactType: 'study evidence',
		text:
			'INTERVIEW · P07\n“I lost the note once it left my screen.” P07 repeatedly zoomed out to rebuild context.',
		x: 564,
		y: 568,
		color: 'yellow',
	},
	{
		id: 'nav-design-direction',
		themeId: 'navigation-context',
		order: 3,
		artifactType: 'design direction',
		text:
			'DESIGN DIRECTION\nMaintain a workspace-wide spatial index and reason beyond the current viewport.',
		x: 848,
		y: 810,
		color: 'light-violet',
	},
	{
		id: 'semantic-prior-work',
		themeId: 'semantic-manipulation',
		order: 1,
		artifactType: 'prior work',
		text:
			'PRIOR WORK · Shneiderman, 1983\nDirect manipulation depends on visible objects and rapid, reversible actions.',
		x: 90,
		y: 590,
		color: 'light-blue',
	},
	{
		id: 'semantic-study-evidence',
		themeId: 'semantic-manipulation',
		order: 2,
		artifactType: 'study evidence',
		text:
			'PILOT SESSION · P03\nThe cleanup looked better, but one moved connector changed the workflow meaning.',
		x: 438,
		y: 318,
		color: 'yellow',
	},
	{
		id: 'semantic-design-direction',
		themeId: 'semantic-manipulation',
		order: 3,
		artifactType: 'design direction',
		text:
			'DESIGN DIRECTION\nOrganize the workspace while preserving bindings and containment.',
		x: 850,
		y: 568,
		color: 'light-violet',
	},
	{
		id: 'trust-prior-work',
		themeId: 'trust-verification',
		order: 1,
		artifactType: 'prior work',
		text:
			'PRIOR WORK · Amershi et al., 2019\nAI systems should communicate what happened and support efficient correction.',
		x: 60,
		y: 810,
		color: 'light-blue',
	},
	{
		id: 'trust-study-evidence',
		themeId: 'trust-verification',
		order: 2,
		artifactType: 'study evidence',
		text:
			'INTERVIEW · P11\n“I ran organize twice because I could not tell whether it had finished correctly.”',
		x: 462,
		y: 810,
		color: 'yellow',
	},
	{
		id: 'trust-design-direction',
		themeId: 'trust-verification',
		order: 3,
		artifactType: 'design direction',
		text:
			'DESIGN DIRECTION\nCheck containment, overlap, text fit, and bindings before reporting success.',
		x: 842,
		y: 326,
		color: 'light-violet',
	},
]

const RESEARCH_LINKS = THEMES.flatMap((theme) => {
	const cards = RESEARCH_CARDS.filter((card) => card.themeId === theme.id).sort(
		(a, b) => a.order - b.order
	)
	return cards.slice(0, -1).map((card, index) => ({
		id: `research-link-${theme.id}-${index + 1}`,
		startId: card.id,
		endId: cards[index + 1].id,
		themeId: theme.id,
	}))
})

export function isResearchWorkspaceScenarioPage(page: TLPage | undefined): boolean {
	return page?.meta.canvasActUsageScenarioId === RESEARCH_WORKSPACE_SCENARIO_ID
}

export function getCurrentResearchWorkspaceScenario(editor: Editor) {
	const page = editor.getCurrentPage()
	return isResearchWorkspaceScenarioPage(page) ? page : null
}

export function ensureResearchWorkspaceScenarioPage(editor: Editor) {
	let page = editor
		.getPages()
		.find(
			(candidate) =>
				candidate.meta.canvasActUsageScenarioId === RESEARCH_WORKSPACE_SCENARIO_ID
		)

	if (!page) {
		editor.createPage({
			name: RESEARCH_WORKSPACE_PAGE_NAME,
			meta: scenarioPageMeta(),
		})
		page = editor
			.getPages()
			.find(
				(candidate) =>
					candidate.meta.canvasActUsageScenarioId === RESEARCH_WORKSPACE_SCENARIO_ID
			)
	}
	if (!page) return null

	editor.setCurrentPage(page.id)
	const pageVersion = page.meta.canvasActUsageScenarioVersion
	const hasScenarioShapes = editor.getCurrentPageShapes().some(
		(shape) => shape.meta.canvasActUsageScenarioId === RESEARCH_WORKSPACE_SCENARIO_ID
	)
	if (pageVersion !== RESEARCH_WORKSPACE_SCENARIO_VERSION || !hasScenarioShapes) {
		resetResearchWorkspaceScenario(editor)
	} else {
		editor.updatePage({
			id: page.id,
			name: RESEARCH_WORKSPACE_PAGE_NAME,
			meta: scenarioPageMeta(),
		})
		fitResearchWorkspaceScenario(editor, false)
	}

	return editor.getCurrentPage()
}

export function resetResearchWorkspaceScenario(editor: Editor) {
	const page = getCurrentResearchWorkspaceScenario(editor)
	if (!page) return

	editor.run(
		() => {
			editor.selectNone()
			editor.deleteShapes(Array.from(editor.getCurrentPageShapeIds()))
			editor.updatePage({
				id: page.id,
				name: RESEARCH_WORKSPACE_PAGE_NAME,
				meta: scenarioPageMeta(),
			})
			createResearchWorkspaceShapes(editor)
		},
		{ history: 'ignore', ignoreShapeLock: true }
	)
	fitResearchWorkspaceScenario(editor)
}

export function fitResearchWorkspaceScenario(editor: Editor, animate = true) {
	const fit = () => {
		if (!getCurrentResearchWorkspaceScenario(editor)) return
		editor.zoomToBounds(RESEARCH_WORKSPACE_BOUNDS, {
			inset: 32,
			animation: animate ? { duration: 240 } : undefined,
		})
	}
	if (typeof window === 'undefined') fit()
	else window.requestAnimationFrame(fit)
}

function scenarioPageMeta() {
	return {
		canvasActUsageScenarioId: RESEARCH_WORKSPACE_SCENARIO_ID,
		canvasActUsageScenarioVersion: RESEARCH_WORKSPACE_SCENARIO_VERSION,
		canvasActUsageScenarioPrompt: RESEARCH_WORKSPACE_PROMPT,
	}
}

function scenarioShapeMeta(
	note: string,
	role: string,
	workspace?: {
		role: CanvasActWorkspaceRole
		group?: ThemeId
		order?: number
		layout?: 'row' | 'column'
	}
) {
	return {
		note,
		canvasActUsageScenarioId: RESEARCH_WORKSPACE_SCENARIO_ID,
		canvasActScenarioRole: role,
		...(workspace
			? {
					[CANVASACT_WORKSPACE_ROLE_KEY]: workspace.role,
					...(workspace.group
						? { canvasActWorkspaceGroup: workspace.group }
						: {}),
					...(workspace.order !== undefined
						? { canvasActWorkspaceOrder: workspace.order }
						: {}),
					...(workspace.layout
						? { canvasActWorkspaceLayout: workspace.layout }
						: {}),
				}
			: {}),
	}
}

function createResearchWorkspaceShapes(editor: Editor) {
	createGeo(editor, 'workspace-background', 0, 0, 1540, 1000, '', {
		color: 'grey',
		fill: 'solid',
		opacity: 0.06,
		isLocked: true,
		role: 'fixed-background',
		note: 'Fixed full-canvas research project workspace background.',
	})

	createText(editor, 'workspace-kicker', 40, 26, 760, 'RESEARCH PROJECT  /  WORKING SYNTHESIS', {
		color: 'blue',
		size: 's',
		isLocked: true,
		role: 'fixed-heading',
		note: 'Protected research workspace heading.',
	})
	createText(
		editor,
		'workspace-title',
		40,
		54,
		920,
		'How should AI organize large visual workspaces?',
		{
			color: 'black',
			size: 'l',
			isLocked: true,
			role: 'fixed-heading',
			note: 'Protected project title.',
		}
	)
	createGeo(editor, 'lab-review-status', 970, 38, 292, 52, 'LAB REVIEW  ·  FRI 10:00', {
		color: 'green',
		fill: 'semi',
		size: 's',
		isLocked: true,
		role: 'fixed-status',
		note: 'Protected next lab review milestone.',
	})

	createGeo(
		editor,
		'project-brief',
		40,
		122,
		760,
		98,
		'PROJECT BRIEF\nResearch question: How can an LLM reorganize a complex 2D workspace without losing spatial meaning?\nStudy materials: 12 interviews · 6 think-aloud sessions · literature notes',
		{
			color: 'blue',
			fill: 'semi',
			size: 's',
			verticalAlign: 'start',
			isLocked: true,
			role: 'fixed-project-brief',
			note: 'Protected project brief and study scope.',
		}
	)
	createGeo(
		editor,
		'workspace-legend',
		824,
		122,
		438,
		98,
		'WORKING CONVENTION\nBlue = prior work   ·   Yellow = study evidence\nViolet = design direction   ·   Reading chain: prior work → evidence → design direction',
		{
			color: 'grey',
			fill: 'semi',
			size: 's',
			verticalAlign: 'start',
			isLocked: true,
			role: 'fixed-legend',
			note: 'Protected visual legend for research artifact types and meaningful links.',
		}
	)

	for (const theme of THEMES) {
		createGeo(
			editor,
			theme.containerId,
			40,
			theme.y,
			1222,
			210,
			`THEME ${theme.index}  /  ${theme.title}\n${theme.subtitle}`,
			{
				color: 'grey',
				fill: 'none',
				dash: 'dashed',
				size: 's',
				verticalAlign: 'start',
				isLocked: true,
				role: 'theme-container',
				note: `GROUP CONTAINER ${theme.title} | layout row | prior work to evidence to design`,
				workspace: {
					role: CANVASACT_WORKSPACE_ROLES.groupContainer,
					group: theme.id,
					layout: 'row',
				},
			}
		)
	}

	for (const card of RESEARCH_CARDS) {
		createGeo(editor, card.id, card.x, card.y, 350, 116, card.text, {
			color: card.color,
			fill: 'solid',
			size: 's',
			verticalAlign: 'start',
			role: 'research-card',
			note: `GROUP ${card.themeId} | ORDER ${card.order} | ${card.artifactType} | movable research card`,
			workspace: {
				role: CANVASACT_WORKSPACE_ROLES.groupItem,
				group: card.themeId,
				order: card.order,
			},
		})
	}

	const relationArrowIds: TLShapeId[] = []
	for (const link of RESEARCH_LINKS) {
		createBoundArrow(editor, link.id, link.startId, link.endId, {
			color: 'grey',
			dash: 'solid',
			opacity: 0.58,
			role: 'research-link',
			note: `READING CHAIN ${link.themeId} | preserves prior work to evidence to design direction`,
			workspace: {
				role: CANVASACT_WORKSPACE_ROLES.semanticLink,
				group: link.themeId,
			},
		})
		relationArrowIds.push(createShapeId(link.id))
	}

	// Notes stay legible while their six meaningful links remain visible behind them.
	editor.bringToFront(RESEARCH_CARDS.map((card) => createShapeId(card.id)))
	for (const arrowId of relationArrowIds) {
		const arrow = editor.getShape(arrowId)
		if (arrow) editor.updateShape({ id: arrow.id, type: arrow.type, isLocked: true })
	}
}

function createGeo(
	editor: Editor,
	id: string,
	x: number,
	y: number,
	w: number,
	h: number,
	text: string,
	options: {
		color?: CanvasColor
		fill?: 'none' | 'semi' | 'solid'
		dash?: 'draw' | 'solid' | 'dashed' | 'dotted'
		size?: 's' | 'm' | 'l' | 'xl'
		opacity?: number
		isLocked?: boolean
		verticalAlign?: 'start' | 'middle' | 'end'
		align?: 'start' | 'middle' | 'end'
		role: string
		note: string
		workspace?: {
			role: CanvasActWorkspaceRole
			group?: ThemeId
			order?: number
			layout?: 'row' | 'column'
		}
	}
) {
	editor.createShape<TLGeoShape>({
		id: createShapeId(id),
		type: 'geo',
		x,
		y,
		opacity: options.opacity ?? 1,
		isLocked: options.isLocked ?? false,
		props: {
			geo: 'rectangle',
			w,
			h,
			color: options.color ?? 'black',
			labelColor: 'black',
			fill: options.fill ?? 'none',
			dash: options.dash ?? 'solid',
			font: 'sans',
			size: options.size ?? 's',
			align: options.align ?? 'start',
			verticalAlign: options.verticalAlign ?? 'middle',
			richText: toRichText(text),
		},
		meta: scenarioShapeMeta(options.note, options.role, options.workspace),
	})
}

function createText(
	editor: Editor,
	id: string,
	x: number,
	y: number,
	w: number,
	text: string,
	options: {
		color: CanvasColor
		size: 's' | 'm' | 'l' | 'xl'
		isLocked: boolean
		role: string
		note: string
	}
) {
	editor.createShape<TLTextShape>({
		id: createShapeId(id),
		type: 'text',
		x,
		y,
		isLocked: options.isLocked,
		props: {
			autoSize: false,
			w,
			color: options.color,
			font: 'sans',
			size: options.size,
			textAlign: 'start',
			richText: toRichText(text),
		},
		meta: scenarioShapeMeta(options.note, options.role),
	})
}

function createBoundArrow(
	editor: Editor,
	id: string,
	startShapeId: string,
	endShapeId: string,
	options: {
		color: CanvasColor
		dash: 'draw' | 'solid' | 'dashed' | 'dotted'
		opacity: number
		role: string
		note: string
		workspace: {
			role: CanvasActWorkspaceRole
			group?: ThemeId
		}
	}
) {
	editor.createShape<TLArrowShape>({
		id: createShapeId(id),
		type: 'arrow',
		x: 0,
		y: 0,
		opacity: options.opacity,
		props: {
			start: { x: 0, y: 0 },
			end: { x: 120, y: 0 },
			color: options.color,
			dash: options.dash,
			size: 's',
			arrowheadStart: 'none',
			arrowheadEnd: 'arrow',
		},
		meta: scenarioShapeMeta(options.note, options.role, options.workspace),
	})
	createArrowBinding(editor, id, startShapeId, 'start')
	createArrowBinding(editor, id, endShapeId, 'end')
}

function createArrowBinding(
	editor: Editor,
	arrowId: string,
	targetShapeId: string,
	terminal: 'start' | 'end'
) {
	editor.createBinding({
		type: 'arrow',
		fromId: createShapeId(arrowId),
		toId: createShapeId(targetShapeId),
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

export const RESEARCH_WORKSPACE_CARD_IDS = RESEARCH_CARDS.map((card) => card.id)
