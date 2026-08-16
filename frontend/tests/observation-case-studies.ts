import assert from 'node:assert/strict'
import {
	Box,
	createShapeId,
	createTLStore,
	defaultAddFontsFromNode,
	defaultBindingUtils,
	defaultShapeUtils,
	Editor,
	tipTapDefaultExtensions,
} from 'tldraw'
import type { TLPage, TLShape } from 'tldraw'
import {
	ensureObservationCaseStudySuite,
	getCurrentObservationCaseStudy,
	installObservationCaseStudyAutoFit,
	OBSERVATION_CASE_STUDIES,
	OBSERVATION_CASE_STUDY_SUITE_ID,
	OBSERVATION_CASE_STUDY_SUITE_VERSION,
	resetCurrentObservationCaseStudy,
	selectObservationCaseStudy,
} from '../client/usageScenario/observationCaseStudies'
import { buildCanvasObservation } from '../shared/format/buildCanvasObservation'
import { convertTldrawShapeToBlurryShape } from '../shared/format/convertTldrawShapeToBlurryShape'
import { convertTldrawShapesToPeripheralShapes } from '../shared/format/convertTldrawShapesToPeripheralShapes'
import { buildPromptCanvasObservation } from '../shared/format/PromptCanvasObservation'
import {
	BlurryShapesPartDefinition,
	CanvasObservationPartDefinition,
} from '../shared/schema/PromptPartDefinitions'

type Test = { name: string; run: () => void | Promise<void> }
type TestViewport = { x: number; y: number; w: number; h: number }

const FORBIDDEN_SHAPE_META_KEYS = [
	'canvasActWorkspaceRole',
	'canvasActWorkspaceGroup',
	'canvasActWorkspaceOrder',
	'canvasActWorkspaceLayout',
	'canvasActScenarioRole',
	'note',
] as const

const STEP_4_REQUIRED_VISIBLE_IDS = [
	'f1u6',
	'f2u7',
	'z2s8',
	'z4e6',
	'z6f3',
	'j5d3',
	'z8k2',
	'e2s6',
	'q4w8',
	'l7n3',
	'c6p2',
] as const

const NATIVE_WORKSPACE_FRAMES = {
	f1u6: 'Study setup A',
	f2u7: 'Study setup B',
	z2s8: 'Findings',
	z4e6: 'Evidence trail',
	z6f3: 'Charts',
	j5d3: 'Friday report',
	z8k2: 'Friday checklist',
	p5x1: 'Finding versions',
	f3r7: 'Chart',
	s7y3: 'Key',
	c6p2: 'Claim',
} as const

const EXPECTED_WORKSPACE_LABELS = [
	'Calls · 6 teams',
	'Diaries · 4 teams',
	'Calls · 45 min',
	'Diaries · 7 days',
	'Handoff themes',
	'What breaks during team handoffs?',
	'18 interviews coded · 5 recurring breakdowns',
	'Interview evidence',
	'Lost decision context',
	'Unclear ownership delays handoffs',
	'Handoff breakdown',
	'Chart',
	'Key',
	'Claim',
] as const

const CHECKLIST_ITEMS = [
	{ id: 'k1r4', pending: 'Add takeaway', done: '✓ Takeaway' },
	{ id: 'k2r5', pending: 'Add chart', done: '✓ Chart' },
	{ id: 'k3r6', pending: 'Split setups', done: '✓ Setups split' },
	{ id: 'k4r7', pending: 'Trace evidence', done: '✓ Evidence' },
] as const

const EXPECTED_CASE_PROMPTS = [
	'Add the current working copy of “Unclear ownership delays handoffs” to Friday’s report.',
	'The team chose the blue “Handoff breakdown” chart. Add it to Friday’s report.',
	'Move the two unattached cards from “Study setup A” to the empty “Study setup B”.',
	'Move the interview-backed “Lost decision context” finding to Friday’s report.',
] as const

const RETIRED_WORKSPACE_LABELS = [
	'Wave 3 finding',
	'Figure 3 draft',
	'Analysis & synthesis',
	'Evidence map',
	'Figure alternatives',
	'Friday review',
	'Review checklist',
	'Version archive',
	'Interview protocol',
	'Participant budget',
	'Recruitment plan',
	'IRB deadline',
	'RQ:',
	'Quote bank',
	'Result: context loss',
	'What gets lost during handoffs?',
	'Finding for report',
	'18 coded interviews',
	'Handoff finding draft',
	'Handoff chart draft',
	'Selected chart',
	'Supported finding',
	'Trace to interviews',
	'Choose chart',
	'Check study setup',
	'Confirm supported finding',
	'Ownership notes',
	'Timing notes',
	'Channel notes',
	'Context notes',
	'Decision ownership is unclear',
	'6 remote teams',
	'45-min interviews',
	'Live + async sessions',
	'Decisions lack clear owners',
	'45-min calls',
	'Live + async',
	'3 time zones',
] as const

installHeadlessDom()

const tests: Test[] = [
	{
		name: 'catalog defines four unique observation-only case studies',
		run() {
			assert.equal(OBSERVATION_CASE_STUDIES.length, 4)
			assert.equal(
				new Set(OBSERVATION_CASE_STUDIES.map((caseStudy) => caseStudy.id)).size,
				4
			)
			assert.equal(
				new Set(OBSERVATION_CASE_STUDIES.map((caseStudy) => caseStudy.pageName)).size,
				4
			)
			assert.deepEqual(
				OBSERVATION_CASE_STUDIES.map((caseStudy) => caseStudy.id),
				[
					'viewport-coverage',
					'object-state',
					'workspace-structure',
					'explicit-relations',
				]
			)
			assert.deepEqual(
				OBSERVATION_CASE_STUDIES.map((caseStudy) => caseStudy.prompt),
				EXPECTED_CASE_PROMPTS
			)
			assert.ok(OBSERVATION_CASE_STUDY_SUITE_VERSION.length > 0)
			assert.equal(
				OBSERVATION_CASE_STUDIES.some(
					(caseStudy) => (caseStudy.id as string) === 'research-project-workspace'
				),
				false
			)
			for (const [index, caseStudy] of OBSERVATION_CASE_STUDIES.entries()) {
				assert.ok(caseStudy.prompt.trim().length > 0)
				assert.ok(caseStudy.prompt.length < 180)
				assert.ok(caseStudy.title.trim().length > 0)
				assert.ok(caseStudy.story.trim().length > 0)
				assert.equal(caseStudy.completedBefore, index)
				assert.ok(caseStudy.viewWidth >= 1200)
				assert.equal(caseStudy.viewX, 20)
				assert.equal(caseStudy.viewWidth, 1680)
				assert.ok(
					caseStudy.pageName.includes(`· ${String(index + 1).padStart(2, '0')} `),
					`${caseStudy.id} should have a sequential page number`
				)
				assert.equal(typeof caseStudy.createShapes, 'function')
			}
		},
	},
	{
		name: 'suite creates four pages with unique shape IDs and no answer-bearing metadata',
		async run() {
			await withEditor(async (editor) => {
				ensureObservationCaseStudySuite(editor)
				const pages = getSuitePages(editor)
				assert.equal(pages.length, 4)

				const allShapeIds: string[] = []
				for (const definition of OBSERVATION_CASE_STUDIES) {
					selectObservationCaseStudy(editor, definition.id)
					assert.equal(getCurrentObservationCaseStudy(editor)?.id, definition.id)

					const page = editor.getCurrentPage()
					assert.equal(page.name, definition.pageName)
					assert.equal(page.meta.canvasActUsageScenarioPrompt, definition.prompt)
					assert.equal(
						page.meta.canvasActUsageScenarioVersion,
						OBSERVATION_CASE_STUDY_SUITE_VERSION
					)

					const shapes = getPageShapes(editor, page)
					assert.ok(shapes.length > 0, `${definition.id} should not be empty`)
					for (const shape of shapes) {
						if (shape.type === 'geo') {
							assert.equal(shape.props.growY, 0, `${shape.id} should not auto-grow its label`)
						}
					}
					const serializedProps = JSON.stringify(shapes.map((shape) => shape.props))
					for (const label of EXPECTED_WORKSPACE_LABELS) {
						assert.ok(serializedProps.includes(label), `Missing workspace label: ${label}`)
					}
					for (const label of RETIRED_WORKSPACE_LABELS) {
						assert.equal(serializedProps.includes(label), false, `Retired label remains: ${label}`)
					}
					for (const [localId, expectedName] of Object.entries(NATIVE_WORKSPACE_FRAMES)) {
						const frame = editor.getShape(createShapeId(`obs-${definition.id}-${localId}`))
						assert.equal(frame?.type, 'frame', `${localId} should be a native frame`)
						if (frame?.type !== 'frame') continue
						assert.equal(frame.props.name, expectedName)
						assert.equal(frame.parentId, page.id)
					}
					assertStudySetupFrames(editor, definition.id, definition.completedBefore >= 3)
					assertCompactVerticalLayout(editor, definition.id)
					for (const [index, item] of CHECKLIST_ITEMS.entries()) {
						const checklistShape = editor.getShape(
							createShapeId(`obs-${definition.id}-${item.id}`)
						)
						assert.ok(checklistShape, `Missing checklist item ${item.id}`)
						const isComplete = index < definition.completedBefore
						assert.equal(
							getShapeText(editor, checklistShape),
							isComplete ? item.done : item.pending
						)
						assert.equal(
							(checklistShape.props as { color?: string }).color,
							isComplete ? 'green' : 'grey'
						)
						assert.equal(
							(checklistShape.props as { fill?: string }).fill,
							isComplete ? 'solid' : 'semi'
						)
					}

					const setupAId = createShapeId(`obs-${definition.id}-f1u6`)
					for (const localId of ['u2c7', 'r9m1']) {
						assert.equal(
							editor.getShape(createShapeId(`obs-${definition.id}-${localId}`))?.parentId,
							setupAId
						)
					}
					for (const localId of ['b6k4', 't4v8', 'n7q4', 'm4q8', 'q4w8']) {
						assert.equal(
							editor.getShape(createShapeId(`obs-${definition.id}-${localId}`))?.parentId,
							page.id,
							`${localId} must stay page-parented for shared move/place actions`
						)
					}
					for (const shape of shapes) {
						allShapeIds.push(shape.id)
						assert.equal(shape.meta.canvasActUsageScenarioId, definition.id)
						for (const key of FORBIDDEN_SHAPE_META_KEYS) {
							assert.equal(
								Object.prototype.hasOwnProperty.call(shape.meta, key),
								false,
								`${shape.id} must not carry answer-bearing meta.${key}`
							)
						}
					}
				}

				assert.equal(new Set(allShapeIds).size, allShapeIds.length)
			})
		},
	},
	{
		name: 'ensure is idempotent and preserves edits on valid pages',
		async run() {
			await withEditor(async (editor) => {
				ensureObservationCaseStudySuite(editor)
				const pageIdsBefore = suitePageIds(editor)
				const definition = OBSERVATION_CASE_STUDIES[0]
				selectObservationCaseStudy(editor, definition.id)
				const shape = getPageShapes(editor, editor.getCurrentPage())[0]
				const editedX = shape.x + 37

				editor.run(
					() => {
						editor.updateShape({ id: shape.id, type: shape.type, x: editedX })
					},
					{ history: 'ignore', ignoreShapeLock: true }
				)

				ensureObservationCaseStudySuite(editor)

				assert.deepEqual(suitePageIds(editor), pageIdsBefore)
				assert.equal(editor.getShape(shape.id)?.x, editedX)
				assert.equal(getSuitePages(editor).length, 4)
			})
		},
	},
	{
		name: 'ensure removes obsolete suite pages and preserves ordinary pages',
		async run() {
			await withEditor(async (editor) => {
				ensureObservationCaseStudySuite(editor)
				const retainedPageIds = suitePageIds(editor)

				editor.createPage({
					name: 'Observation Lab · Retired Coordinate Frames',
					meta: {
						canvasActUsageScenarioSuiteId: OBSERVATION_CASE_STUDY_SUITE_ID,
						canvasActUsageScenarioId: 'coordinate-frames',
						canvasActUsageScenarioVersion: '3',
					},
				})
				const obsoletePage = editor.getPages().find(
					(page) => page.meta.canvasActUsageScenarioId === 'coordinate-frames'
				)
				assert.ok(obsoletePage)

				editor.createPage({ name: 'Observation test · user workspace' })
				const ordinaryPage = editor
					.getPages()
					.find((page) => page.name === 'Observation test · user workspace')
				assert.ok(ordinaryPage)
				editor.setCurrentPage(obsoletePage.id)

				ensureObservationCaseStudySuite(editor)

				assert.equal(editor.getPage(obsoletePage.id), undefined)
				assert.ok(editor.getPage(ordinaryPage.id))
				assert.deepEqual(suitePageIds(editor), retainedPageIds)
				assert.equal(getCurrentObservationCaseStudy(editor)?.id, 'viewport-coverage')
			})
		},
	},
	{
		name: 'reset restores one canonical page without changing the other three',
		async run() {
			await withEditor(async (editor) => {
				ensureObservationCaseStudySuite(editor)
				const target = OBSERVATION_CASE_STUDIES[0]
				const control = OBSERVATION_CASE_STUDIES[1]
				selectObservationCaseStudy(editor, target.id)
				const targetPage = editor.getCurrentPage()
				const targetPageId = targetPage.id
				const baseline = snapshotPage(editor, targetPage)

				selectObservationCaseStudy(editor, control.id)
				const controlPage = editor.getCurrentPage()
				const controlBaseline = snapshotPage(editor, controlPage)

				selectObservationCaseStudy(editor, target.id)
				const [moved, deleted] = getPageShapes(editor, targetPage)
				assert.ok(moved && deleted)
				editor.run(
					() => {
						editor.updateShape({
							id: moved.id,
							type: moved.type,
							x: moved.x + 91,
						})
						editor.deleteShape(deleted.id)
						editor.createShape({
							id: createShapeId('observation-case-study-test-junk'),
							type: 'geo',
							x: 10,
							y: 10,
							props: { geo: 'rectangle', w: 40, h: 40 },
						})
					},
					{ history: 'ignore', ignoreShapeLock: true }
				)

				resetCurrentObservationCaseStudy(editor)

				assert.equal(editor.getCurrentPageId(), targetPageId)
				assert.equal(snapshotPage(editor, editor.getCurrentPage()), baseline)
				assert.equal(editor.getShape(createShapeId('observation-case-study-test-junk')), undefined)

				selectObservationCaseStudy(editor, control.id)
				assert.equal(snapshotPage(editor, editor.getCurrentPage()), controlBaseline)
			})
		},
	},
	{
		name: 'ensure, selection, and reset callbacks run after the canonical camera is applied',
		async run() {
			await withEditor(async (editor) => {
				ensureObservationCaseStudySuite(editor)
				const target = OBSERVATION_CASE_STUDIES[0]

				editor.setCamera({ x: -240, y: -120, z: 1.25 })
				let ensuredViewport: ReturnType<Box['toJson']> | null = null
				ensureObservationCaseStudySuite(editor, {
					onFit: () => {
						ensuredViewport = editor.getViewportPageBounds().toJson()
					},
				})
				assert.equal(ensuredViewport, null)
				await new Promise<void>((resolve) => setTimeout(resolve, 0))
				assertViewportJsonContains(ensuredViewport, new Box(20, 0, 1680, 800))

				editor.setCamera({ x: -320, y: -180, z: 1.5 })
				let selectedViewport: ReturnType<Box['toJson']> | null = null
				selectObservationCaseStudy(editor, target.id, () => {
					selectedViewport = editor.getViewportPageBounds().toJson()
				})
				assert.equal(selectedViewport, null)
				await new Promise<void>((resolve) => setTimeout(resolve, 0))
				assertViewportJsonContains(selectedViewport, new Box(20, 0, 1680, 800))

				const relationStep = OBSERVATION_CASE_STUDIES[3]
				editor.setCamera({ x: -80, y: -40, z: 0.75 })
				let relationViewport: ReturnType<Box['toJson']> | null = null
				selectObservationCaseStudy(editor, relationStep.id, () => {
					relationViewport = editor.getViewportPageBounds().toJson()
				})
				assert.equal(relationViewport, null)
				await new Promise<void>((resolve) => setTimeout(resolve, 0))
				assertViewportJsonContains(relationViewport, new Box(20, 0, 1680, 800))

				editor.setCamera({ x: -510, y: -260, z: 2 })
				let resetViewport: ReturnType<Box['toJson']> | null = null
				resetCurrentObservationCaseStudy(editor, () => {
					resetViewport = editor.getViewportPageBounds().toJson()
				})
				assert.equal(resetViewport, null)
				await new Promise<void>((resolve) => setTimeout(resolve, 0))
				assertViewportJsonContains(resetViewport, new Box(20, 0, 1680, 800))
			})
		},
	},
	{
		name: 'canonical camera fits the complete study view across viewport aspect ratios',
		async run() {
			for (const viewport of [
				{ x: 0, y: 0, w: 1090, h: 900 },
				{ x: 0, y: 0, w: 2210, h: 1440 },
				{ x: 0, y: 0, w: 768, h: 400 },
			]) {
				await withEditor(
					async (editor) => {
						ensureObservationCaseStudySuite(editor)
						for (const definition of OBSERVATION_CASE_STUDIES) {
							await new Promise<void>((resolve) =>
								selectObservationCaseStudy(editor, definition.id, resolve)
							)

							const inset = Math.min(editor.options.zoomToFitPadding, viewport.w * 0.28)
							const expectedZoom = Math.min(
								(viewport.w - inset) / definition.viewWidth,
								(viewport.h - inset) / 800
							)
							assertClose(editor.getZoomLevel(), expectedZoom, 'canonical zoom')
							assertViewportContains(
								editor.getViewportPageBounds(),
								new Box(definition.viewX, 0, definition.viewWidth, 800)
							)
						}

						await new Promise<void>((resolve) =>
							selectObservationCaseStudy(editor, 'explicit-relations', resolve)
						)
						assertStep4WorkspaceVisible(editor)

						await new Promise<void>((resolve) =>
							selectObservationCaseStudy(editor, 'viewport-coverage', resolve)
						)
						const archive = editor.getShapePageBounds(
							createShapeId('obs-viewport-coverage-n7q4')
						)
						assert.ok(archive)
						assert.ok(
							editor.getViewportPageBounds().maxX < archive.minX,
							'archive candidates must remain offscreen in Step 1'
						)
					},
					viewport
				)
			}
		},
	},
	{
		name: 'active workflow camera refits after the canvas resizes',
		async run() {
			const viewport = { x: 0, y: 0, w: 1200, h: 800 }
			await withEditor(
				async (editor) => {
					await new Promise<void>((resolve) =>
						ensureObservationCaseStudySuite(editor, { onFit: resolve })
					)
					const uninstall = installObservationCaseStudyAutoFit(editor)
					try {
						viewport.w = 768
						viewport.h = 400
						editor.updateViewportScreenBounds(new Box(0, 0, viewport.w, viewport.h))
						await new Promise<void>((resolve) => setTimeout(resolve, 10))

						assertClose(editor.getZoomLevel(), 0.34, 'resized zoom')
						assertViewportContains(
							editor.getViewportPageBounds(),
							new Box(20, 0, 1680, 800)
						)
					} finally {
						uninstall()
					}
				},
				viewport
			)
		},
	},
	{
		name: 'four steps are cumulative checkpoints of one shared research workspace',
		async run() {
			await withEditor(async (editor) => {
				ensureObservationCaseStudySuite(editor)
				const inventories: string[][] = []
				const geometries: Array<Record<string, ReturnType<Box['toJson']>>> = []

				for (const definition of OBSERVATION_CASE_STUDIES) {
					selectObservationCaseStudy(editor, definition.id)
					const prefix = `shape:obs-${definition.id}-`
					inventories.push(
						getPageShapes(editor, editor.getCurrentPage())
							.map((shape) => {
								assert.ok(shape.id.startsWith(prefix))
								return `${shape.type}:${shape.id.slice(prefix.length)}`
							})
							.sort()
					)
					geometries.push(getLogicalGeometry(editor, definition.id))
				}

				for (const inventory of inventories.slice(1)) {
					assert.deepEqual(inventory, inventories[0])
				}
				assert.deepEqual(changedGeometryIds(geometries[0], geometries[1]), ['n7q4'])
				assert.deepEqual(changedGeometryIds(geometries[1], geometries[2]), ['m4q8'])
				assert.deepEqual(changedGeometryIds(geometries[2], geometries[3]), [
					'b6k4',
					't4v8',
				])

				selectObservationCaseStudy(editor, 'viewport-coverage')
				assertBounds(editor, 'viewport-coverage', 'n7q4', 2315, 380)
				assertBounds(editor, 'viewport-coverage', 'm4q8', 125, 625)
				assertBounds(editor, 'viewport-coverage', 'u2c7', 60, 190)
				assertBounds(editor, 'viewport-coverage', 'r9m1', 170, 300)
				assertBounds(editor, 'viewport-coverage', 'b6k4', 170, 190)
				assertBounds(editor, 'viewport-coverage', 't4v8', 60, 300)

				selectObservationCaseStudy(editor, 'object-state')
				assertBounds(editor, 'object-state', 'n7q4', 660, 655)
				assertBounds(editor, 'object-state', 'm4q8', 125, 625)
				assertBounds(editor, 'object-state', 'u2c7', 60, 190)
				assertShapeContained(editor, 'object-state', 'n7q4', 's7y3')
				assertShapeInset(editor, 'object-state', 'n7q4', 's7y3', 10)

				selectObservationCaseStudy(editor, 'workspace-structure')
				assertBounds(editor, 'workspace-structure', 'n7q4', 660, 655)
				assertBounds(editor, 'workspace-structure', 'm4q8', 435, 655)
				assertBounds(editor, 'workspace-structure', 'u2c7', 60, 190)
				assertBounds(editor, 'workspace-structure', 'r9m1', 170, 300)
				assertShapeContained(editor, 'workspace-structure', 'n7q4', 's7y3')
				assertShapeContained(editor, 'workspace-structure', 'm4q8', 'f3r7')
				assertShapeInset(editor, 'workspace-structure', 'n7q4', 's7y3', 10)
				assertShapeInset(editor, 'workspace-structure', 'm4q8', 'f3r7', 10)

				selectObservationCaseStudy(editor, 'explicit-relations')
				assertBounds(editor, 'explicit-relations', 'n7q4', 660, 655)
				assertBounds(editor, 'explicit-relations', 'm4q8', 435, 655)
				assertBounds(editor, 'explicit-relations', 'u2c7', 60, 190)
				assertBounds(editor, 'explicit-relations', 'r9m1', 170, 300)
				assertBounds(editor, 'explicit-relations', 'b6k4', 320, 190)
				assertBounds(editor, 'explicit-relations', 't4v8', 430, 190)
				assertShapeContained(editor, 'explicit-relations', 'n7q4', 's7y3')
				assertShapeContained(editor, 'explicit-relations', 'm4q8', 'f3r7')
				assertShapeContained(editor, 'explicit-relations', 'b6k4', 'f2u7')
				assertShapeContained(editor, 'explicit-relations', 't4v8', 'f2u7')
				assertShapeInset(editor, 'explicit-relations', 'n7q4', 's7y3', 10)
				assertShapeInset(editor, 'explicit-relations', 'm4q8', 'f3r7', 10)
				assertShapeInset(editor, 'explicit-relations', 'b6k4', 'f2u7', 20)
				assertShapeInset(editor, 'explicit-relations', 't4v8', 'f2u7', 20)
				assertShapesDoNotOverlap(editor, 'explicit-relations', 'b6k4', 't4v8')

				const setupColors = {
					u2c7: 'light-blue',
					r9m1: 'light-blue',
					b6k4: 'light-violet',
					t4v8: 'light-violet',
				} as const
				for (const [localId, expectedColor] of Object.entries(setupColors)) {
					const before = editor.getShape(createShapeId(`obs-workspace-structure-${localId}`))
					const after = editor.getShape(createShapeId(`obs-explicit-relations-${localId}`))
					assert.ok(before && after)
					assert.equal(
						(before.props as { color?: string }).color,
						expectedColor,
						`${localId} should use its setup's color`
					)
					assert.equal((after.props as { color?: string }).color, expectedColor)
				}
			})
		},
	},
	{
		name: 'each page produces the intended CanvasObservation discriminator',
		async run() {
			await withEditor(async (editor) => {
				ensureObservationCaseStudySuite(editor)

				const viewportCoverage = await observeCaseStudy(editor, 'viewport-coverage')
				const viewportCandidates = [
					getObject(viewportCoverage, 'obs-viewport-coverage-n7q4'),
					getObject(viewportCoverage, 'obs-viewport-coverage-k2m9'),
					getObject(viewportCoverage, 'obs-viewport-coverage-r8v3'),
				]
				assert.deepEqual(
					viewportCandidates.map((candidate) => candidate.visibility),
					['offscreen-near', 'offscreen-near', 'offscreen-near']
				)
				assert.deepEqual(
					viewportCandidates.map((candidate) => candidate.text),
					[
						'Unclear ownership delays handoffs',
						'Unclear ownership delays handoffs',
						'Unclear ownership delays handoffs',
					]
				)
				assert.deepEqual(
					viewportCandidates.map((candidate) => candidate.flags.locked),
					[false, true, true]
				)

				const legacyBeforeNavigation = getLegacyRepresentations(editor)
				assert.equal(
					legacyBeforeNavigation.blurryShapes.some(
						(shape) => shape.text === 'Unclear ownership delays handoffs'
					),
					false
				)
				const serializedPeripheral = JSON.stringify(
					legacyBeforeNavigation.peripheralClusters
				)
				for (const opaqueId of ['n7q4', 'k2m9', 'r8v3']) {
					assert.equal(serializedPeripheral.includes(opaqueId), false)
				}
				assert.equal(serializedPeripheral.includes('locked'), false)

				// Simulate the legacy agent navigating right to inspect the anonymous cluster.
				// The candidates then enter its blurry summaries, but lock state remains absent.
				editor.setCamera({ x: -2200, y: 0, z: 1 })
				const legacyAfterNavigation = getLegacyRepresentations(editor)
				const legacyCandidates = legacyAfterNavigation.blurryShapes
					.filter((shape) =>
						['obs-viewport-coverage-n7q4', 'obs-viewport-coverage-k2m9', 'obs-viewport-coverage-r8v3'].includes(
							shape.shapeId
						)
					)
					.sort((a, b) => a.shapeId.localeCompare(b.shapeId))
				assert.deepEqual(
					legacyCandidates.map((shape) => shape.shapeId),
					[
						'obs-viewport-coverage-k2m9',
						'obs-viewport-coverage-n7q4',
						'obs-viewport-coverage-r8v3',
					]
				)
				assert.deepEqual(
					legacyCandidates.map((shape) => shape.text),
					[
						'Unclear ownership delays handoffs',
						'Unclear ownership delays handoffs',
						'Unclear ownership delays handoffs',
					]
				)
				assert.equal(JSON.stringify(legacyCandidates).includes('locked'), false)

				const objectState = await observeCaseStudy(editor, 'object-state')
				const stackIds = [
					'obs-object-state-v7p2',
					'obs-object-state-m4q8',
					'obs-object-state-c9r5',
					'obs-object-state-h3n6',
				]
				const stackObjects = stackIds.map((id) => getObject(objectState, id))
				assert.deepEqual(
					stackObjects.map((object) => object.style.color),
					['orange', 'blue', 'yellow', 'light-violet']
				)
				assert.deepEqual(
					stackObjects.map((object) => object.visibility),
					['occluded', 'occluded', 'occluded', 'visible']
				)
				assert.ok(
					stackObjects.every(
						(object, index) => index === 0 || object.zIndex > stackObjects[index - 1].zIndex
					)
				)
				assert.ok(
					objectState.relations.some(
						(relation) =>
							relation.type === 'occludes' &&
							relation.sourceId === 'obs-object-state-h3n6' &&
							relation.targetId === 'obs-object-state-m4q8' &&
							relation.measurements?.coverage === 1
					)
				)
				assert.deepEqual(editor.getSelectedShapeIds(), [])

				const objectStateLegacy = getLegacyRepresentations(editor)
				const legacyStack = objectStateLegacy.blurryShapes.filter((shape) =>
					stackIds.includes(shape.shapeId)
				)
				assert.equal(legacyStack.length, 4)
				assert.ok(legacyStack.every((shape) => shape.text === 'Handoff breakdown'))
				const serializedLegacyStack = JSON.stringify(legacyStack)
				for (const omittedField of ['color', 'zIndex', 'visibility', 'occluded']) {
					assert.equal(serializedLegacyStack.includes(omittedField), false)
				}
				const legacyPromptBeforeColorSwap = BlurryShapesPartDefinition.buildContent?.({
					type: 'blurryShapes',
					shapes: objectStateLegacy.blurryShapes,
				})

				// Swap two fully hidden layer colors. The rendered top remains light violet and the actual
				// legacy blurry prompt is byte-for-byte unchanged, but CanvasObservation changes
				// which opaque ID is blue.
				editor.run(
					() => {
						editor.updateShape({
							id: createShapeId('obs-object-state-v7p2'),
							type: 'geo',
							props: { color: 'blue' },
						})
						editor.updateShape({
							id: createShapeId('obs-object-state-m4q8'),
							type: 'geo',
							props: { color: 'orange' },
						})
					},
					{ history: 'ignore', ignoreShapeLock: true }
				)
				const legacyPromptAfterColorSwap = BlurryShapesPartDefinition.buildContent?.({
					type: 'blurryShapes',
					shapes: getLegacyRepresentations(editor).blurryShapes,
				})
				assert.deepEqual(legacyPromptAfterColorSwap, legacyPromptBeforeColorSwap)
				const swappedObservation = observeCurrentCaseStudy(editor)
				assert.equal(
					swappedObservation.objects.find(
						(object) => stackIds.includes(object.id) && object.style.color === 'blue'
					)?.id,
					'obs-object-state-v7p2'
				)

				resetCurrentObservationCaseStudy(editor)
				await new Promise<void>((resolve) => setTimeout(resolve, 0))
				const targetShapeId = createShapeId('obs-object-state-m4q8')
				const reviewShapeId = createShapeId('obs-object-state-j5d3')
				const targetBeforeMove = editor.getShapePageBounds(targetShapeId)
				const reviewBounds = editor.getShapePageBounds(reviewShapeId)
				assert.ok(targetBeforeMove && reviewBounds)
				editor.run(
					() => {
						editor.updateShape({
							id: targetShapeId,
							type: 'geo',
							x: reviewBounds.midX - targetBeforeMove.w / 2,
							y: reviewBounds.midY - targetBeforeMove.h / 2,
						})
					},
					{ history: 'ignore', ignoreShapeLock: true }
				)

				const movedTargetBounds = editor.getShapePageBounds(targetShapeId)
				const remainingTopBounds = editor.getShapePageBounds(
					createShapeId('obs-object-state-h3n6')
				)
				assert.ok(movedTargetBounds && remainingTopBounds)
				assert.equal(reviewBounds.contains(movedTargetBounds), true)
				assert.equal(Box.Collides(movedTargetBounds, remainingTopBounds), false)

				const topStackShape = editor
					.getCurrentPageShapesSorted()
					.filter((shape) =>
						[
							'obs-object-state-v7p2',
							'obs-object-state-c9r5',
							'obs-object-state-h3n6',
						].includes(shape.id.slice('shape:'.length))
					)
					.at(-1)
				assert.equal(topStackShape?.id, createShapeId('obs-object-state-h3n6'))
				assert.equal(
					(topStackShape?.props as { color?: string } | undefined)?.color,
					'light-violet'
				)
				assert.equal(
					(editor.getShape(targetShapeId)?.props as { color?: string } | undefined)?.color,
					'blue'
				)
				const movedObservation = observeCurrentCaseStudy(editor)
				assert.equal(
					getObject(movedObservation, 'obs-object-state-m4q8').style.color,
					'blue'
				)
				assert.equal(
					movedObservation.relations.some(
						(relation) =>
							relation.type === 'occludes' &&
							relation.sourceId === 'obs-object-state-h3n6' &&
							relation.targetId === 'obs-object-state-m4q8'
					),
					false
				)

				const workspaceStructure = await observeCaseStudy(editor, 'workspace-structure')
				const frameMembers = workspaceStructure.relations.filter(
					(relation) =>
						relation.type === 'frame-member' &&
						relation.sourceId === 'obs-workspace-structure-f1u6'
				)
				assert.deepEqual(
					new Set(frameMembers.map((relation) => relation.targetId)),
					new Set([
						'obs-workspace-structure-u2c7',
						'obs-workspace-structure-r9m1',
					])
				)
				for (const looseId of [
					'obs-workspace-structure-b6k4',
					'obs-workspace-structure-t4v8',
				]) {
					assert.equal(
						frameMembers.some((relation) => relation.targetId === looseId),
						false
					)
				}
				assert.equal(
					workspaceStructure.relations.some(
						(relation) =>
							relation.type === 'frame-member' &&
							relation.sourceId === 'obs-workspace-structure-f2u7'
					),
					false,
					'Study setup B should begin empty'
				)

				const structureLegacy = getLegacyRepresentations(editor)
				const setupIds = [
					'obs-workspace-structure-u2c7',
					'obs-workspace-structure-b6k4',
					'obs-workspace-structure-r9m1',
					'obs-workspace-structure-t4v8',
				]
				const legacySetupNotes = structureLegacy.blurryShapes.filter((shape) =>
					setupIds.includes(shape.shapeId)
				)
				assert.equal(legacySetupNotes.length, 4)
				for (const omittedField of ['parentId', 'frameId', 'frame-member', 'color']) {
					assert.equal(JSON.stringify(legacySetupNotes).includes(omittedField), false)
				}
				const expectedSetupColors = {
					u2c7: 'light-blue',
					r9m1: 'light-blue',
					b6k4: 'light-violet',
					t4v8: 'light-violet',
				} as const
				for (const [localId, expectedColor] of Object.entries(expectedSetupColors)) {
					assert.equal(
						(
							editor.getShape(createShapeId(`obs-workspace-structure-${localId}`))
								?.props as { color?: string } | undefined
						)?.color,
						expectedColor
					)
					assert.equal(
						getObject(workspaceStructure, `obs-workspace-structure-${localId}`).style.color,
						expectedColor
					)
				}

				const explicitRelations = await observeCaseStudy(editor, 'explicit-relations')
				assert.deepEqual(
					explicitRelations.objects
						.filter((object) => object.text === 'Lost decision context')
						.map((object) => object.id)
						.sort(),
					['obs-explicit-relations-l7n3', 'obs-explicit-relations-q4w8']
				)
				assert.deepEqual(
					new Set(
						getPageShapes(editor, editor.getCurrentPage())
						.filter((shape) => shape.type === 'arrow')
						.map((shape) => shape.id)
					),
					new Set([
						createShapeId('obs-explicit-relations-a5d9'),
						createShapeId('obs-explicit-relations-a8p2'),
					])
				)
				const evidenceBounds = editor.getShapePageBounds(
					createShapeId('obs-explicit-relations-e2s6')
				)
				const upperFindingBounds = editor.getShapePageBounds(
					createShapeId('obs-explicit-relations-q4w8')
				)
				const lowerFindingBounds = editor.getShapePageBounds(
					createShapeId('obs-explicit-relations-l7n3')
				)
				assert.ok(evidenceBounds && upperFindingBounds && lowerFindingBounds)
				assert.equal(upperFindingBounds.x, lowerFindingBounds.x)
				assert.equal(upperFindingBounds.h, lowerFindingBounds.h)
				assert.equal(
					evidenceBounds.midY,
					(upperFindingBounds.midY + lowerFindingBounds.midY) / 2
				)
				const connectedResults = explicitRelations.relations.filter(
					(relation) =>
						relation.type === 'arrow-connects' &&
						relation.sourceId === 'obs-explicit-relations-e2s6'
				)
				assert.deepEqual(
					connectedResults.map((relation) => relation.targetId),
					['obs-explicit-relations-q4w8']
				)

				const connectedFindingId = createShapeId('obs-explicit-relations-q4w8')
				const boundArrowId = createShapeId('obs-explicit-relations-a5d9')
				editor.updateShape({
					id: connectedFindingId,
					type: 'geo',
					x: 945,
					y: 655,
				})
				assertBounds(editor, 'explicit-relations', 'q4w8', 945, 655)
				assertShapeContained(editor, 'explicit-relations', 'q4w8', 'c6p2')
				assertShapeInset(editor, 'explicit-relations', 'q4w8', 'c6p2', 10)
				assert.ok(
					editor
						.getBindingsFromShape(boundArrowId, 'arrow')
						.some((binding) => binding.toId === connectedFindingId),
					'bound evidence arrow should remain attached after moving the finding'
				)
				const completedObservation = observeCurrentCaseStudy(editor)
				assert.ok(
					completedObservation.relations.some(
						(relation) =>
							relation.type === 'arrow-connects' &&
							relation.sourceId === 'obs-explicit-relations-e2s6' &&
							relation.targetId === 'obs-explicit-relations-q4w8'
					),
					'CanvasObservation should retain the evidence-to-finding relation after the move'
				)
			})
		},
	},
	{
		name: 'model observation keeps semantics while exposing only offscreen action geometry',
		async run() {
			await withEditor(async (editor) => {
				ensureObservationCaseStudySuite(editor)
				const promptOrigin = { x: 137, y: -83 }
				const forbiddenPayloadKeys = [
					'pageBounds',
					'promptBounds',
					'center',
					'promptCenter',
					'screenshotBounds',
					'focused',
					'promptOrigin',
					'spatialIndex',
				]
				let sawOffscreenObject = false
				let sawViewportObject = false

				for (const definition of OBSERVATION_CASE_STUDIES) {
					selectObservationCaseStudy(editor, definition.id)
					await new Promise<void>((resolve) => setTimeout(resolve, 0))
					const viewport = editor.getViewportPageBounds().toJson()
					const rawObservation = buildCanvasObservation(editor, {
						agentViewportBounds: viewport,
						userViewportBounds: viewport,
						promptOrigin,
						timestamp: '2026-01-01T00:00:00.000Z',
					})
					assert.deepEqual(rawObservation.promptOrigin, promptOrigin)
					assert.ok(rawObservation.objects.length < 180)
					assert.ok(rawObservation.relations.length < 700)

					const modelObservation = buildPromptCanvasObservation(rawObservation)
					assert.equal(modelObservation.coordinateSpace, 'prompt/action coordinates')
					assert.equal(modelObservation.objects.length, rawObservation.objects.length)
					assert.deepEqual(
						JSON.parse(JSON.stringify(modelObservation.relations)),
						JSON.parse(JSON.stringify(rawObservation.relations))
					)

					for (const rawObject of rawObservation.objects) {
						const modelObject = modelObservation.objects.find(
							(candidate) => candidate.id === rawObject.id
						)
						assert.ok(modelObject, `${definition.id} should retain ${rawObject.id}`)
						assert.deepEqual(
							{
								id: modelObject.id,
								type: modelObject.type,
								subtype: modelObject.subtype,
								text: modelObject.text,
								note: modelObject.note,
								zIndex: modelObject.zIndex,
								parentId: modelObject.parentId,
								groupId: modelObject.groupId,
								frameId: modelObject.frameId,
								style: modelObject.style,
								flags: modelObject.flags,
								visibility: modelObject.visibility,
								detailLevel: modelObject.detailLevel,
							},
							{
								id: rawObject.id,
								type: rawObject.type,
								subtype: rawObject.subtype,
								text: rawObject.text,
								note: rawObject.note,
								zIndex: rawObject.zIndex,
								parentId: rawObject.parentId,
								groupId: rawObject.groupId,
								frameId: rawObject.frameId,
								style: rawObject.style,
								flags: rawObject.flags,
								visibility: rawObject.visibility,
								detailLevel: rawObject.detailLevel,
							}
						)

						const isOffscreen =
							rawObject.visibility === 'offscreen-near' ||
							rawObject.visibility === 'offscreen-far'
						if (isOffscreen) {
							sawOffscreenObject = true
							assert.deepEqual(modelObject.actionBounds, rawObject.promptBounds)
							assert.notDeepEqual(rawObject.promptBounds, rawObject.pageBounds)
						} else {
							sawViewportObject = true
							assert.equal(modelObject.actionBounds, undefined)
						}
					}

					const serializedModel = JSON.stringify(modelObservation)
					const serializedRaw = JSON.stringify(rawObservation)
					for (const key of forbiddenPayloadKeys) {
						assert.equal(
							serializedModel.includes(`"${key}":`),
							false,
							`${definition.id} model payload must omit ${key}`
						)
					}
					assert.ok(
						serializedModel.length < serializedRaw.length,
						`${definition.id} model payload should be smaller than the raw observation`
					)

					const promptContent = CanvasObservationPartDefinition.buildContent?.({
						type: 'canvasObservation',
						observation: rawObservation,
					})
					assert.ok(promptContent)
					assert.equal(promptContent[1], serializedModel)
					assert.equal(typeof promptContent[0], 'string')
					assert.match(promptContent[0] as string, /actionBounds/)
					assert.match(promptContent[0] as string, /prompt\/action coordinates/)
					assert.match(promptContent[0] as string, /action x\/y fields/)

					switch (definition.id) {
						case 'viewport-coverage': {
							const candidates = ['n7q4', 'k2m9', 'r8v3'].map((id) =>
								modelObservation.objects.find(
									(object) => object.id === `obs-viewport-coverage-${id}`
								)
							)
							assert.ok(candidates.every(Boolean))
							assert.deepEqual(
								candidates.map((candidate) => candidate?.flags.locked),
								[false, true, true]
							)
							assert.ok(candidates.every((candidate) => candidate?.actionBounds))
							break
						}
						case 'object-state':
							assert.equal(
								modelObservation.objects.find(
									(object) => object.id === 'obs-object-state-m4q8'
								)?.style.color,
								'blue'
							)
							assert.ok(
								modelObservation.relations.some(
									(relation) =>
										relation.type === 'occludes' &&
										relation.sourceId === 'obs-object-state-h3n6' &&
										relation.targetId === 'obs-object-state-m4q8'
								)
							)
							break
						case 'workspace-structure':
							assert.deepEqual(
								new Set(
									modelObservation.relations
										.filter(
											(relation) =>
										relation.type === 'frame-member' &&
										relation.sourceId === 'obs-workspace-structure-f1u6'
									)
									.map((relation) => relation.targetId)
							),
							new Set([
								'obs-workspace-structure-u2c7',
								'obs-workspace-structure-r9m1',
							])
						)
						assert.equal(
							modelObservation.relations.some(
								(relation) =>
									relation.type === 'frame-member' &&
									relation.sourceId === 'obs-workspace-structure-f2u7'
							),
							false
						)
						break
						case 'explicit-relations':
							assert.deepEqual(
								modelObservation.relations
									.filter(
										(relation) =>
										relation.type === 'arrow-connects' &&
										relation.sourceId === 'obs-explicit-relations-e2s6'
									)
									.map((relation) => relation.targetId),
								['obs-explicit-relations-q4w8']
							)
							break
					}
				}

				assert.equal(sawOffscreenObject, true)
				assert.equal(sawViewportObject, true)
			})
		},
	},
]

let passed = 0
for (const test of tests) {
	try {
		await test.run()
		passed += 1
		console.log(`PASS ${test.name}`)
	} catch (error) {
		console.error(`FAIL ${test.name}`)
		console.error(error)
		process.exitCode = 1
	}
}

if (process.exitCode) {
	console.error(`\n${passed}/${tests.length} observation-case-study tests passed.`)
} else {
	console.log(`\n${passed}/${tests.length} observation-case-study tests passed.`)
}
process.exit(process.exitCode ?? 0)

function getSuitePages(editor: Editor) {
	return editor
		.getPages()
		.filter(
			(page) => page.meta.canvasActUsageScenarioSuiteId === OBSERVATION_CASE_STUDY_SUITE_ID
		)
}

function suitePageIds(editor: Editor) {
	return getSuitePages(editor)
		.map((page) => page.id)
		.sort()
}

function getPageShapes(editor: Editor, page: TLPage) {
	return Array.from(editor.getPageShapeIds(page))
		.map((shapeId) => editor.getShape(shapeId))
		.filter((shape): shape is TLShape => Boolean(shape))
		.sort((a, b) => a.id.localeCompare(b.id))
}

function snapshotPage(editor: Editor, page: TLPage) {
	const shapes = getPageShapes(editor, page)
	const shapeIds = new Set(shapes.map((shape) => shape.id))
	const bindings = new Map<string, unknown>()
	for (const shape of shapes) {
		for (const binding of editor.getBindingsInvolvingShape(shape.id)) {
			if (!shapeIds.has(binding.fromId) || !shapeIds.has(binding.toId)) continue
			const key = `${binding.type}:${binding.fromId}:${binding.toId}:${JSON.stringify(
				binding.props
			)}`
			bindings.set(key, {
				type: binding.type,
				fromId: binding.fromId,
				toId: binding.toId,
				props: binding.props,
				meta: binding.meta,
			})
		}
	}

	return JSON.stringify({
		page: {
			id: page.id,
			name: page.name,
			meta: page.meta,
		},
		shapes: shapes.map((shape) => ({
			id: shape.id,
			type: shape.type,
			parentId: shape.parentId,
			x: shape.x,
			y: shape.y,
			rotation: shape.rotation,
			isLocked: shape.isLocked,
			opacity: shape.opacity,
			props: shape.props,
			meta: shape.meta,
		})),
		bindings: Array.from(bindings.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([, binding]) => binding),
	})
}

function assertStudySetupFrames(
	editor: Editor,
	caseStudyId: (typeof OBSERVATION_CASE_STUDIES)[number]['id'],
	expectMoveComplete: boolean
) {
	const setupABounds = editor.getShapePageBounds(createShapeId(`obs-${caseStudyId}-f1u6`))
	const setupBBounds = editor.getShapePageBounds(createShapeId(`obs-${caseStudyId}-f2u7`))
	assert.ok(setupABounds, `Expected ${caseStudyId}/f1u6`)
	assert.ok(setupBBounds, `Expected ${caseStudyId}/f2u7`)
	assert.deepEqual(setupABounds.toJson(), { x: 40, y: 130, w: 240, h: 320 })
	assert.deepEqual(setupBBounds.toJson(), { x: 300, y: 130, w: 240, h: 320 })

	const cards = Object.fromEntries(
		['u2c7', 'b6k4', 'r9m1', 't4v8'].map((localId) => {
		const bounds = editor.getShapePageBounds(createShapeId(`obs-${caseStudyId}-${localId}`))
		assert.ok(bounds, `Expected ${caseStudyId}/${localId}`)
		assert.equal(bounds.w, 90)
		assert.equal(bounds.h, 90)
		return [localId, bounds]
		})
	) as Record<string, Box>

	assert.deepEqual(cards.u2c7.toJson(), { x: 60, y: 190, w: 90, h: 90 })
	assert.deepEqual(cards.r9m1.toJson(), { x: 170, y: 300, w: 90, h: 90 })

	if (!expectMoveComplete) {
		assert.deepEqual(cards.b6k4.toJson(), { x: 170, y: 190, w: 90, h: 90 })
		assert.deepEqual(cards.t4v8.toJson(), { x: 60, y: 300, w: 90, h: 90 })
		for (const bounds of Object.values(cards)) {
			assert.equal(setupABounds.contains(bounds), true)
			assert.equal(setupBBounds.contains(bounds), false)
		}
		assert.equal(cards.b6k4.minX - cards.u2c7.maxX, 20)
		assert.equal(cards.t4v8.minY - cards.u2c7.maxY, 20)
		assert.equal(cards.u2c7.minX - setupABounds.minX, 20)
		assert.equal(setupABounds.maxX - cards.b6k4.maxX, 20)
		return
	}

	assert.deepEqual(cards.b6k4.toJson(), { x: 320, y: 190, w: 90, h: 90 })
	assert.deepEqual(cards.t4v8.toJson(), { x: 430, y: 190, w: 90, h: 90 })
	for (const bounds of [cards.u2c7, cards.r9m1]) {
		assert.equal(setupABounds.contains(bounds), true)
	}
	for (const bounds of [cards.b6k4, cards.t4v8]) {
		assert.equal(setupBBounds.contains(bounds), true)
	}
	assert.equal(cards.t4v8.minX - cards.b6k4.maxX, 20)
}

function assertCompactVerticalLayout(
	editor: Editor,
	caseStudyId: (typeof OBSERVATION_CASE_STUDIES)[number]['id']
) {
	const getBounds = (localId: string) => {
		const bounds = editor.getShapePageBounds(
			createShapeId(`obs-${caseStudyId}-${localId}`)
		)
		assert.ok(bounds, `Expected ${caseStudyId}/${localId}`)
		return bounds
	}

	const topRowBottom = Math.max(
		...['f1u6', 'f2u7', 'z2s8', 'z4e6'].map((localId) => getBounds(localId).maxY)
	)
	const bottomRowTop = Math.min(
		...['z6f3', 'j5d3', 'z8k2'].map((localId) => getBounds(localId).minY)
	)
	assert.equal(
		bottomRowTop - topRowBottom,
		95,
		`${caseStudyId} should keep a compact 95px title band between workspace rows`
	)

	assertBounds(editor, caseStudyId, 'z6f3', 40, 545)
	assertBounds(editor, caseStudyId, 'j5d3', 410, 545)
	assertBounds(editor, caseStudyId, 'z8k2', 1160, 545)
	assertBounds(editor, caseStudyId, 'f3r7', 420, 645)
	assertBounds(editor, caseStudyId, 's7y3', 650, 645)
	assertBounds(editor, caseStudyId, 'c6p2', 920, 645)

	// Stable source layers and checklist cards should rise with their containing bottom row.
	for (const localId of ['v7p2', 'c9r5', 'h3n6']) {
		assertBounds(editor, caseStudyId, localId, 125, 625)
	}
	assertBounds(editor, caseStudyId, 'k1r4', 1190, 615)
	assertBounds(editor, caseStudyId, 'k2r5', 1430, 615)
	assertBounds(editor, caseStudyId, 'k3r6', 1190, 695)
	assertBounds(editor, caseStudyId, 'k4r7', 1430, 695)
}

function assertBounds(
	editor: Editor,
	caseStudyId: (typeof OBSERVATION_CASE_STUDIES)[number]['id'],
	localId: string,
	expectedX: number,
	expectedY: number
) {
	const bounds = editor.getShapePageBounds(createShapeId(`obs-${caseStudyId}-${localId}`))
	assert.ok(bounds, `Expected ${caseStudyId}/${localId}`)
	assert.equal(bounds.x, expectedX)
	assert.equal(bounds.y, expectedY)
}

function assertShapeContained(
	editor: Editor,
	caseStudyId: (typeof OBSERVATION_CASE_STUDIES)[number]['id'],
	shapeLocalId: string,
	containerLocalId: string
) {
	const shapeBounds = editor.getShapePageBounds(
		createShapeId(`obs-${caseStudyId}-${shapeLocalId}`)
	)
	const containerBounds = editor.getShapePageBounds(
		createShapeId(`obs-${caseStudyId}-${containerLocalId}`)
	)
	assert.ok(shapeBounds, `Expected ${caseStudyId}/${shapeLocalId}`)
	assert.ok(containerBounds, `Expected ${caseStudyId}/${containerLocalId}`)
	assert.equal(
		containerBounds.contains(shapeBounds),
		true,
		`${shapeLocalId} should fit fully inside ${containerLocalId}`
	)
}

function assertShapeInset(
	editor: Editor,
	caseStudyId: (typeof OBSERVATION_CASE_STUDIES)[number]['id'],
	shapeLocalId: string,
	containerLocalId: string,
	minimumInset: number
) {
	const shapeBounds = editor.getShapePageBounds(
		createShapeId(`obs-${caseStudyId}-${shapeLocalId}`)
	)
	const containerBounds = editor.getShapePageBounds(
		createShapeId(`obs-${caseStudyId}-${containerLocalId}`)
	)
	assert.ok(shapeBounds, `Expected ${caseStudyId}/${shapeLocalId}`)
	assert.ok(containerBounds, `Expected ${caseStudyId}/${containerLocalId}`)
	const insets = [
		shapeBounds.minX - containerBounds.minX,
		shapeBounds.minY - containerBounds.minY,
		containerBounds.maxX - shapeBounds.maxX,
		containerBounds.maxY - shapeBounds.maxY,
	]
	assert.ok(
		insets.every((inset) => inset >= minimumInset),
		`${shapeLocalId} should keep at least ${minimumInset}px inside ${containerLocalId}: ${insets.join(', ')}`
	)
}

function assertShapesDoNotOverlap(
	editor: Editor,
	caseStudyId: (typeof OBSERVATION_CASE_STUDIES)[number]['id'],
	firstLocalId: string,
	secondLocalId: string
) {
	const firstBounds = editor.getShapePageBounds(
		createShapeId(`obs-${caseStudyId}-${firstLocalId}`)
	)
	const secondBounds = editor.getShapePageBounds(
		createShapeId(`obs-${caseStudyId}-${secondLocalId}`)
	)
	assert.ok(firstBounds, `Expected ${caseStudyId}/${firstLocalId}`)
	assert.ok(secondBounds, `Expected ${caseStudyId}/${secondLocalId}`)
	assert.equal(
		Box.Collides(firstBounds, secondBounds),
		false,
		`${firstLocalId} should not overlap ${secondLocalId}`
	)
}

function getShapeText(editor: Editor, shape: TLShape) {
	return editor.getShapeUtil(shape).getText(shape) ?? ''
}

function assertClose(actual: number, expected: number, message: string) {
	assert.ok(
		Math.abs(actual - expected) <= 1e-6,
		`${message}: expected ${expected}, received ${actual}`
	)
}

function assertViewportContains(viewport: Box, expected: Box) {
	assert.ok(viewport.minX <= expected.minX + 1e-6, 'viewport should include left edge')
	assert.ok(viewport.minY <= expected.minY + 1e-6, 'viewport should include top edge')
	assert.ok(viewport.maxX >= expected.maxX - 1e-6, 'viewport should include right edge')
	assert.ok(viewport.maxY >= expected.maxY - 1e-6, 'viewport should include bottom edge')
}

function assertViewportJsonContains(
	actual: ReturnType<Box['toJson']> | null,
	expected: Box
) {
	assert.ok(actual)
	assertViewportContains(new Box(actual.x, actual.y, actual.w, actual.h), expected)
}

function assertStep4WorkspaceVisible(editor: Editor) {
	const viewport = editor.getViewportPageBounds()
	for (const localId of STEP_4_REQUIRED_VISIBLE_IDS) {
		const bounds = editor.getShapePageBounds(
			createShapeId(`obs-explicit-relations-${localId}`)
		)
		assert.ok(bounds, `Expected Step 4 shape ${localId}`)
		assertViewportContains(viewport, bounds)
	}
}

function getLogicalGeometry(
	editor: Editor,
	caseStudyId: (typeof OBSERVATION_CASE_STUDIES)[number]['id']
) {
	const prefix = `shape:obs-${caseStudyId}-`
	const geometry: Record<string, ReturnType<Box['toJson']>> = {}
	for (const shape of getPageShapes(editor, editor.getCurrentPage())) {
		const bounds = editor.getShapePageBounds(shape.id)
		if (!bounds || !shape.id.startsWith(prefix)) continue
		geometry[shape.id.slice(prefix.length)] = bounds.toJson()
	}
	return geometry
}

function changedGeometryIds(
	before: Record<string, ReturnType<Box['toJson']>>,
	after: Record<string, ReturnType<Box['toJson']>>
) {
	assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort())
	return Object.keys(before)
		.filter((id) => JSON.stringify(before[id]) !== JSON.stringify(after[id]))
		.sort()
}

async function observeCaseStudy(
	editor: Editor,
	id: (typeof OBSERVATION_CASE_STUDIES)[number]['id']
) {
	selectObservationCaseStudy(editor, id)
	await new Promise<void>((resolve) => setTimeout(resolve, 0))
	return observeCurrentCaseStudy(editor)
}

function observeCurrentCaseStudy(editor: Editor) {
	const viewport = editor.getViewportPageBounds().toJson()
	return buildCanvasObservation(editor, {
		agentViewportBounds: viewport,
		userViewportBounds: viewport,
		promptOrigin: { x: viewport.x, y: viewport.y },
		timestamp: '2026-01-01T00:00:00.000Z',
	})
}

function getObject(
	observation: ReturnType<typeof buildCanvasObservation>,
	id: string
) {
	const object = observation.objects.find((candidate) => candidate.id === id)
	assert.ok(object, `Expected observation object ${id}`)
	return object
}

function getLegacyRepresentations(editor: Editor) {
	const viewport = editor.getViewportPageBounds()
	const shapes = editor.getCurrentPageShapesSorted()
	const shapesInBounds = shapes.filter((shape) => {
		const bounds = editor.getShapeMaskedPageBounds(shape)
		return bounds ? viewport.includes(bounds) : false
	})
	const shapesOutsideBounds = shapes.filter((shape) => {
		const bounds = editor.getShapeMaskedPageBounds(shape)
		return bounds ? !viewport.includes(bounds) : false
	})
	return {
		blurryShapes: shapesInBounds
			.map((shape) => convertTldrawShapeToBlurryShape(editor, shape))
			.filter((shape) => shape !== null),
		peripheralClusters: convertTldrawShapesToPeripheralShapes(
			editor,
			shapesOutsideBounds,
			{ padding: 75 }
		),
	}
}

async function withEditor(
	callback: (editor: Editor) => void | Promise<void>,
	viewport: TestViewport = { x: 0, y: 0, w: 1200, h: 800 }
) {
	const editor = createHeadlessEditor(viewport)
	try {
		await callback(editor)
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
	} finally {
		editor.dispose()
	}
}

function createHeadlessEditor(viewport: TestViewport) {
	const shapeUtils = [...defaultShapeUtils]
	const bindingUtils = [...defaultBindingUtils]
	const store = createTLStore({ shapeUtils, bindingUtils })
	const container = createHeadlessElement('div', viewport)
	const editor = new Editor({
		store,
		shapeUtils,
		bindingUtils,
		tools: [],
		getContainer: () => container,
		options: {
			text: {
				addFontsFromNode: defaultAddFontsFromNode,
				tipTapConfig: { extensions: tipTapDefaultExtensions },
			},
		},
	})
	editor.textMeasure.measureText = (text, options) => {
		const lines = text.split('\n')
		const longest = lines.reduce(
			(longestLine, line) => (line.length > longestLine.length ? line : longestLine),
			''
		)
		const naturalWidth = longest.length * (options.fontSize / 2)
		const width = options.maxWidth === null ? naturalWidth : Math.max(naturalWidth, options.maxWidth)
		return {
			x: 0,
			y: 0,
			w: width,
			h:
				(options.maxWidth === null
					? lines.length
					: Math.ceil(naturalWidth / options.maxWidth) + lines.length) * options.fontSize,
			scrollWidth: options.measureScrollWidth ? width : 0,
		}
	}
	editor.textMeasure.measureHtml = (html, options) =>
		editor.textMeasure.measureText(html.replace(/<[^>]+>/g, ''), options)
	editor.textMeasure.measureTextSpans = (text, options) => [
		{
			box: editor.textMeasure.measureText(text, {
				...options,
				maxWidth: options.width,
				padding: `${options.padding}px`,
			}),
			text,
		},
	]
	editor.updateViewportScreenBounds(new Box(viewport.x, viewport.y, viewport.w, viewport.h))
	return editor
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
		const document = {
			body,
			activeElement: null,
			createElement: (tagName: string) => createHeadlessElement(tagName),
			createElementNS: (_namespace: string, tagName: string) => createHeadlessElement(tagName),
			createTextNode: (text: string) => ({ nodeType: 3, textContent: text }) as unknown as Text,
			createDocumentFragment: () =>
				createHeadlessElement('#document-fragment') as unknown as DocumentFragment,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
		} as unknown as Document & { implementation: { createHTMLDocument(): Document } }
		document.implementation = { createHTMLDocument: () => document }
		globalObject.document = document
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

function createHeadlessElement(
	tagName: string,
	viewport: TestViewport = { x: 0, y: 0, w: 1200, h: 800 }
): HTMLElement {
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
				if (value === null || value === undefined) styleValues.delete(key)
				else styleValues.set(key, value)
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
			x: viewport.x,
			y: viewport.y,
			left: viewport.x,
			top: viewport.y,
			right: viewport.x + viewport.w,
			bottom: viewport.y + viewport.h,
			width: viewport.w,
			height: viewport.h,
		}),
		scrollWidth: viewport.w,
		childNodes: children,
		textContent: '',
		innerHTML: '',
	}
	return element as unknown as HTMLElement
}
