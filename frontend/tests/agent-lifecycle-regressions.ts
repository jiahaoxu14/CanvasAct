import assert from 'node:assert/strict'
import { TldrawAgent } from '../client/agent/TldrawAgent'
import { AgentModeManager } from '../client/agent/managers/AgentModeManager'
import { AgentRequestManager } from '../client/agent/managers/AgentRequestManager'
import { getModeNode } from '../client/modes/AgentModeChart'
import type { AgentVariant } from '../shared/agentVariants'
import type { AgentRequest } from '../shared/types/AgentRequest'

type Test = { name: string; run: () => void | Promise<void> }

const tests: Test[] = [
	{
		name: 'CanvasAct reuses the exact original review and lint lifecycle node',
		run() {
			assert.equal(getModeNode('working'), getModeNode('working-legacy'))
		},
	},
	{
		name: 'cancel immediately clears generation and returns both variants to idle',
		async run() {
			for (const variant of ['canvasact', 'original-tldraw'] satisfies AgentVariant[]) {
				const { agent, cancelCalls } = createLifecycleHarness(variant)
				let resolveRequest!: () => void
				const pendingRequest = new Promise<void>((resolve) => {
					resolveRequest = resolve
				})

				agent.request = (async (input) => {
					const request = agent.requests.getFullRequestFromInput(input)
					agent.requests.setActiveRequest(request)
					agent.requests.setCancelFn(() => {
						cancelCalls.count += 1
						resolveRequest()
					})
					try {
						await pendingRequest
					} finally {
						agent.requests.clearActiveRequest()
					}
				}) as TldrawAgent['request']

				const prompt = agent.prompt({ message: `Exercise cancellation for ${variant}.` })
				assert.equal(agent.requests.isGenerating(), true)
				assert.equal(
					agent.mode.getCurrentModeType(),
					variant === 'canvasact' ? 'working' : 'working-legacy',
				)

				agent.cancel()
				assert.equal(cancelCalls.count, 1)
				assert.equal(agent.requests.isGenerating(), false)
				assert.equal(agent.requests.getActiveRequest(), null)
				assert.equal(agent.requests.getScheduledRequest(), null)
				assert.equal(agent.mode.getCurrentModeType(), 'idling')

				await prompt
				assert.equal(
					agent.requests.isGenerating(),
					false,
					'a superseded prompt must not restore the generating flag',
				)
				assert.equal(agent.mode.getCurrentModeType(), 'idling')
			}
		},
	},
	{
		name: 'cancel also idles a working agent with no active request',
		run() {
			for (const variant of ['canvasact', 'original-tldraw'] satisfies AgentVariant[]) {
				const { agent } = createLifecycleHarness(variant)
				agent.mode.setMode(variant === 'canvasact' ? 'working' : 'working-legacy')
				agent.requests.setIsPrompting(true)

				agent.cancel()

				assert.equal(agent.requests.isGenerating(), false)
				assert.equal(agent.mode.getCurrentModeType(), 'idling')
			}
		},
	},
	{
		name: 'CanvasAct and original tldraw use the same todo continuation behavior',
		async run() {
			const outputs = await Promise.all(
				(['working', 'working-legacy'] as const).map((mode) =>
					runPromptEnd(mode, {
						todos: [{ id: 'todo-1', text: 'Finish the edit', status: 'todo' }],
					}),
				),
			)
			assert.deepEqual(outputs[0], outputs[1])
			assert.deepEqual(outputs[0], {
				scheduled: [
					"Continue until all your todo items are marked as done. If you've completed the work, mark them as done, otherwise keep going.",
				],
				mode: 'working',
			})
		},
	},
	{
		name: 'CanvasAct and original tldraw use the same legacy lint follow-up',
		async run() {
			const outputs = await Promise.all(
				(['working', 'working-legacy'] as const).map((mode) =>
					runPromptEnd(mode, { hasLint: true }),
				),
			)
			assert.deepEqual(outputs[0], outputs[1])
			assert.deepEqual(outputs[0], {
				scheduled: [
					{
						agentMessages: [
							'The automated linter has detected potential visual problems in the canvas. Decide if they need to be addressed.',
						],
					},
				],
				mode: 'working',
			})
		},
	},
	{
		name: 'both variants finish by idling when todos and legacy lints are clear',
		async run() {
			for (const mode of ['working', 'working-legacy'] as const) {
				const output = await runPromptEnd(mode)
				assert.deepEqual(output, { scheduled: [], mode: 'idling' })
			}
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
	console.error(`\n${passed}/${tests.length} lifecycle-regression tests passed.`)
} else {
	console.log(`\n${passed}/${tests.length} lifecycle-regression tests passed.`)
}
process.exit(process.exitCode ?? 0)

function createLifecycleHarness(initialVariant: AgentVariant) {
	let variant = initialVariant
	const cancelCalls = { count: 0 }
	const resettable = () => ({ reset: () => undefined })
	const agent = Object.create(TldrawAgent.prototype) as TldrawAgent

	Object.assign(agent, {
		id: `lifecycle-${initialVariant}`,
		editor: {
			getViewportPageBounds: () => ({ x: 0, y: 0, w: 1024, h: 768 }),
		},
		onError: (error: unknown) => {
			throw error
		},
		variant: {
			getVariant: () => variant,
			setVariant: (next: AgentVariant) => {
				variant = next
			},
			reset: () => {
				variant = 'canvasact'
			},
		},
		actions: {
			reset: () => undefined,
			rebuildUtilsForMode: () => undefined,
		},
		chat: resettable(),
		chatOrigin: resettable(),
		context: { reset: () => undefined, clear: () => undefined },
		lints: {
			reset: () => undefined,
			clearCreatedShapes: () => undefined,
			unlockCreatedShapes: () => undefined,
		},
		todos: {
			reset: () => undefined,
			flush: () => undefined,
			getTodos: () => [],
		},
		userAction: { reset: () => undefined, clearHistory: () => undefined },
		trajectories: resettable(),
		promptGeneration: 0,
		isActingOnEditor: false,
	})

	agent.mode = new AgentModeManager(agent)
	agent.requests = new AgentRequestManager(agent)

	return { agent, cancelCalls }
}

async function runPromptEnd(
	mode: 'working' | 'working-legacy',
	options: {
		todos?: Array<{ id: string; text: string; status: string }>
		hasLint?: boolean
	} = {},
) {
	const scheduled: unknown[] = []
	let currentMode: string = mode
	const createdShapes = new Set()
	const agent = {
		todos: { getTodos: () => options.todos ?? [] },
		lints: {
			getCreatedShapes: () => createdShapes,
			hasUnsurfacedLints: () => options.hasLint ?? false,
		},
		schedule: (input: unknown) => scheduled.push(input),
		mode: { setMode: (next: string) => (currentMode = next) },
	} as unknown as TldrawAgent

	await getModeNode(mode).onPromptEnd?.(agent, {} as AgentRequest)
	return { scheduled, mode: currentMode === mode ? 'working' : currentMode }
}
