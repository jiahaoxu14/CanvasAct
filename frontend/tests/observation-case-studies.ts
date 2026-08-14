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

const FORBIDDEN_SHAPE_META_KEYS = [
	'canvasActWorkspaceRole',
	'canvasActWorkspaceGroup',
	'canvasActWorkspaceOrder',
	'canvasActWorkspaceLayout',
	'canvasActScenarioRole',
	'note',
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
				assert.deepEqual(ensuredViewport, { x: 0, y: 0, w: 1200, h: 800 })

				editor.setCamera({ x: -320, y: -180, z: 1.5 })
				let selectedViewport: ReturnType<Box['toJson']> | null = null
				selectObservationCaseStudy(editor, target.id, () => {
					selectedViewport = editor.getViewportPageBounds().toJson()
				})
				assert.equal(selectedViewport, null)
				await new Promise<void>((resolve) => setTimeout(resolve, 0))
				assert.deepEqual(selectedViewport, { x: 0, y: 0, w: 1200, h: 800 })

				editor.setCamera({ x: -510, y: -260, z: 2 })
				let resetViewport: ReturnType<Box['toJson']> | null = null
				resetCurrentObservationCaseStudy(editor, () => {
					resetViewport = editor.getViewportPageBounds().toJson()
				})
				assert.equal(resetViewport, null)
				await new Promise<void>((resolve) => setTimeout(resolve, 0))
				assert.deepEqual(resetViewport, { x: 0, y: 0, w: 1200, h: 800 })
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
					['Q3 Result', 'Q3 Result', 'Q3 Result']
				)
				assert.deepEqual(
					viewportCandidates.map((candidate) => candidate.flags.locked),
					[false, true, true]
				)

				const legacyBeforeNavigation = getLegacyRepresentations(editor)
				assert.equal(legacyBeforeNavigation.peripheralClusters.length, 1)
				assert.equal(legacyBeforeNavigation.peripheralClusters[0].numberOfShapes, 4)
				assert.equal(
					legacyBeforeNavigation.blurryShapes.some((shape) => shape.text === 'Q3 Result'),
					false
				)
				const serializedPeripheral = JSON.stringify(
					legacyBeforeNavigation.peripheralClusters
				)
				for (const opaqueId of ['d4h8', 'p5x1', 'n7q4', 'k2m9', 'r8v3']) {
					assert.equal(serializedPeripheral.includes(opaqueId), false)
				}
				assert.equal(serializedPeripheral.includes('locked'), false)

				// Simulate the legacy agent navigating right to inspect the anonymous cluster.
				// The candidates then enter its blurry summaries, but lock state remains absent.
				editor.setCamera({ x: -1200, y: 0, z: 1 })
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
					['Q3 Result', 'Q3 Result', 'Q3 Result']
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
				assert.ok(legacyStack.every((shape) => shape.text === 'Figure 3 draft'))
				assert.equal(objectStateLegacy.peripheralClusters.length, 0)
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
					swappedObservation.objects.find((object) => object.style.color === 'blue')?.id,
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
						relation.sourceId === 'obs-workspace-structure-f1'
				)
				assert.deepEqual(
					new Set(frameMembers.map((relation) => relation.targetId)),
					new Set(['obs-workspace-structure-g1', 'obs-workspace-structure-g3'])
				)

				const explicitRelations = await observeCaseStudy(editor, 'explicit-relations')
				const connectedResults = explicitRelations.relations.filter(
					(relation) =>
						relation.type === 'arrow-connects' &&
						relation.sourceId === 'obs-explicit-relations-g1'
				)
				assert.deepEqual(
					connectedResults.map((relation) => relation.targetId),
					['obs-explicit-relations-g2']
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
												relation.sourceId === 'obs-workspace-structure-f1'
										)
										.map((relation) => relation.targetId)
								),
								new Set(['obs-workspace-structure-g1', 'obs-workspace-structure-g3'])
							)
							break
						case 'explicit-relations':
							assert.deepEqual(
								modelObservation.relations
									.filter(
										(relation) =>
											relation.type === 'arrow-connects' &&
											relation.sourceId === 'obs-explicit-relations-g1'
									)
									.map((relation) => relation.targetId),
								['obs-explicit-relations-g2']
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
	const zOrder = new Map(
		[...shapes]
			.sort((a, b) => a.index.localeCompare(b.index))
			.map((shape, index) => [shape.id, index])
	)
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
			zOrder: zOrder.get(shape.id),
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

async function withEditor(callback: (editor: Editor) => void | Promise<void>) {
	const editor = createHeadlessEditor()
	try {
		await callback(editor)
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
	} finally {
		editor.dispose()
	}
}

function createHeadlessEditor() {
	const shapeUtils = [...defaultShapeUtils]
	const bindingUtils = [...defaultBindingUtils]
	const store = createTLStore({ shapeUtils, bindingUtils })
	const container = createHeadlessElement('div')
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
	editor.updateViewportScreenBounds(new Box(0, 0, 1200, 800))
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
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			right: 1200,
			bottom: 800,
			width: 1200,
			height: 800,
		}),
		scrollWidth: 1200,
		childNodes: children,
		textContent: '',
		innerHTML: '',
	}
	return element as unknown as HTMLElement
}
