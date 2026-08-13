import {
	createShapeId,
	createTLStore,
	defaultBindingUtils,
	defaultShapeUtils,
	Editor,
} from 'tldraw'
import type { BoxModel, TLArrowShape, TLShapeId } from 'tldraw'
import { buildCanvasObservation } from '../format/buildCanvasObservation'
import type { CanvasObservation } from '../format/CanvasObservation'
import { INITIAL_CANVAS_AGENT_EVAL_FIXTURES } from './CanvasAgentEvalFixtures'
import {
	runCanvasAgentEvalHarness,
	type CanvasAgentEvalRunResult,
} from './CanvasAgentEvalMetrics'

const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z'
const VIEWPORT: BoxModel = { x: 0, y: 0, w: 400, h: 300 }

export interface InitialCanvasAgentEvalRun {
	result: CanvasAgentEvalRunResult
	artifacts: {
		observationIds: string[]
	}
	records: {
		observations: Partial<Record<string, CanvasObservation>>
		deterministicResults: Partial<Record<string, boolean>>
	}
}

/** Build and score the three deterministic CanvasObservation fixtures. */
export function runInitialCanvasAgentEvals(): InitialCanvasAgentEvalRun {
	installHeadlessDom()

	const observations: Partial<Record<string, CanvasObservation>> = {}
	const deterministicResults: Partial<Record<string, boolean>> = {}

	runObservationFixture(
		'observation_partial_visibility',
		setupPartialVisibilityFixture,
		observations,
		deterministicResults,
	)
	runObservationFixture(
		'observation_arrow_relations',
		setupArrowRelationsFixture,
		observations,
		deterministicResults,
	)
	runObservationFixture(
		'observation_selected_offscreen',
		setupSelectedOffscreenFixture,
		observations,
		deterministicResults,
	)

	const result = runCanvasAgentEvalHarness({
		fixtures: INITIAL_CANVAS_AGENT_EVAL_FIXTURES,
		observations,
		deterministicResults,
	})

	return {
		result,
		artifacts: {
			observationIds: Object.keys(observations).sort(),
		},
		records: {
			observations,
			deterministicResults,
		},
	}
}

function runObservationFixture(
	id: string,
	setup: (editor: Editor) => void,
	observations: Partial<Record<string, CanvasObservation>>,
	deterministicResults: Partial<Record<string, boolean>>,
) {
	withEditor((editor) => {
		setup(editor)
		const first = observe(editor)
		const second = observe(editor)
		observations[id] = first
		deterministicResults[id] = normalizeObservation(first) === normalizeObservation(second)
	})
}

function setupPartialVisibilityFixture(editor: Editor) {
	createGeo(editor, 'visible', 80, 80, 80, 60)
	createGeo(editor, 'partial-left', -30, 80, 80, 60)
	createGeo(editor, 'partial-right', 360, 80, 80, 60)
}

function setupArrowRelationsFixture(editor: Editor) {
	createGeo(editor, 'start', 70, 110, 80, 60)
	createGeo(editor, 'end', 270, 110, 80, 60)
	createArrow(editor, 'bound-arrow', 150, 140, 'start', 'end')
	createArrow(editor, 'unbound-arrow', 40, 230)
}

function setupSelectedOffscreenFixture(editor: Editor) {
	createGeo(editor, 'selected-offscreen', 420, 120, 80, 60)
	editor.select(toTlShapeId('selected-offscreen'))
}

function createGeo(editor: Editor, id: string, x: number, y: number, w: number, h: number) {
	editor.createShape({
		id: toTlShapeId(id),
		type: 'geo',
		x,
		y,
		props: {
			geo: 'rectangle',
			w,
			h,
		},
	})
}

function createArrow(
	editor: Editor,
	id: string,
	x: number,
	y: number,
	startShapeId?: string,
	endShapeId?: string,
) {
	editor.createShape<TLArrowShape>({
		id: toTlShapeId(id),
		type: 'arrow',
		x,
		y,
		props: {
			start: { x: 0, y: 0 },
			end: { x: 120, y: 0 },
		},
	})
	if (startShapeId) bindArrow(editor, id, startShapeId, 'start')
	if (endShapeId) bindArrow(editor, id, endShapeId, 'end')
}

function bindArrow(
	editor: Editor,
	arrowId: string,
	targetShapeId: string,
	terminal: 'start' | 'end',
) {
	editor.createBinding({
		type: 'arrow',
		fromId: toTlShapeId(arrowId),
		toId: toTlShapeId(targetShapeId),
		props: {
			terminal,
			normalizedAnchor: { x: 0.5, y: 0.5 },
			isExact: false,
			isPrecise: false,
			snap: 'none',
		},
	})
}

function observe(editor: Editor): CanvasObservation {
	return buildCanvasObservation(editor, {
		agentViewportBounds: VIEWPORT,
		userViewportBounds: VIEWPORT,
		timestamp: FIXED_TIMESTAMP,
		limits: {
			maxObjects: 40,
			maxRelations: 200,
			maxTilesPerBand: 8,
			maxObjectIdsPerTile: 20,
		},
	})
}

function normalizeObservation(observation: CanvasObservation) {
	return JSON.stringify(observation)
}

function withEditor(callback: (editor: Editor) => void) {
	const editor = createHeadlessEditor()
	try {
		callback(editor)
	} finally {
		editor.dispose()
	}
}

function createHeadlessEditor() {
	const shapeUtils = [...defaultShapeUtils]
	const bindingUtils = [...defaultBindingUtils]
	const store = createTLStore({ shapeUtils, bindingUtils })
	const container = createHeadlessElement('div')
	return new Editor({
		store,
		shapeUtils,
		bindingUtils,
		tools: [],
		getContainer: () => container,
	})
}

function toTlShapeId(id: string): TLShapeId {
	return createShapeId(id)
}

function installHeadlessDom() {
	const globalObject = globalThis as typeof globalThis & {
		document?: Document
		window?: Window & typeof globalThis
		devicePixelRatio?: number
		requestAnimationFrame?: (callback: FrameRequestCallback) => number
		cancelAnimationFrame?: (handle: number) => void
		Node?: { TEXT_NODE: number }
	}

	const requestAnimationFrame =
		globalObject.requestAnimationFrame ??
		((callback: FrameRequestCallback) => Number(setTimeout(() => callback(Date.now()), 0)))
	const cancelAnimationFrame =
		globalObject.cancelAnimationFrame ?? ((handle: number) => clearTimeout(handle))

	globalObject.requestAnimationFrame = requestAnimationFrame
	globalObject.cancelAnimationFrame = cancelAnimationFrame
	globalObject.devicePixelRatio = globalObject.devicePixelRatio ?? 1
	globalObject.Node = globalObject.Node ?? { TEXT_NODE: 3 }

	if (!globalObject.document) {
		const body = createHeadlessElement('body')
		globalObject.document = {
			body,
			activeElement: null,
			createElement: (tagName: string) => createHeadlessElement(tagName),
			createTextNode: (text: string) => ({ nodeType: 3, textContent: text }) as unknown as Text,
			createDocumentFragment: () =>
				createHeadlessElement('#document-fragment') as unknown as DocumentFragment,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
		} as unknown as Document
	}

	if (!globalObject.window) {
		globalObject.window = {
			document: globalObject.document,
			devicePixelRatio: globalObject.devicePixelRatio,
			requestAnimationFrame,
			cancelAnimationFrame,
			matchMedia: () =>
				({
					matches: false,
					media: '',
					onchange: null,
					addListener: () => undefined,
					removeListener: () => undefined,
					addEventListener: () => undefined,
					removeEventListener: () => undefined,
					dispatchEvent: () => false,
				}) as unknown as MediaQueryList,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
		} as unknown as Window & typeof globalThis
	}
}

function createHeadlessElement(tagName: string): HTMLElement {
	const styleValues = new Map<string, string>()
	const children: unknown[] = []
	const element = {
		tagName,
		nodeType: tagName === '#document-fragment' ? 11 : 1,
		classList: {
			add: () => undefined,
			remove: () => undefined,
			toggle: () => false,
		},
		style: {
			setProperty: (key: string, value: string | null | undefined) => {
				if (value === null || value === undefined) {
					styleValues.delete(key)
				} else {
					styleValues.set(key, value)
				}
			},
			getPropertyValue: (key: string) => styleValues.get(key) ?? '',
		},
		setAttribute: () => undefined,
		appendChild: (child: unknown) => {
			children.push(child)
			return child
		},
		removeChild: (child: unknown) => {
			const index = children.indexOf(child)
			if (index >= 0) children.splice(index, 1)
			return child
		},
		remove: () => undefined,
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
		focus: () => undefined,
		blur: () => undefined,
		getBoundingClientRect: () => ({
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			right: 120,
			bottom: 24,
			width: 120,
			height: 24,
		}),
		scrollWidth: 120,
		childNodes: children,
		textContent: '',
		innerHTML: '',
	}
	return element as unknown as HTMLElement
}
