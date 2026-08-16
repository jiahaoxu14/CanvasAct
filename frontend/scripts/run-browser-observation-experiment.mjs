#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import {
	createExperimentArtifactWriter,
	redactSensitive,
	redactSensitiveText,
} from './browser-experiment-artifacts.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(scriptDir, '..')
const repoRoot = resolve(frontendDir, '..')
const DEFAULT_CASE_IDS = [
	'viewport-coverage',
	'object-state',
	'workspace-structure',
	'explicit-relations',
]
const BRIDGE_METHODS = Object.freeze({
	listCases: 'listCases',
	prepareTrial: 'prepareTrial',
	prompt: 'prompt',
	waitForIdle: 'waitForIdle',
	exportState: 'exportState',
})
const PROFILE_DEFAULTS = Object.freeze({
	pilot: { repetitions: 2, rotationLimit: 1 },
	full: { repetitions: 20, rotationLimit: Number.POSITIVE_INFINITY },
})

if (process.argv.includes('--help') || process.argv.includes('-h')) {
	printHelp()
	process.exit(0)
}

await main().catch((error) => {
	console.error(`[browser-eval] ${redactSensitiveText(formatError(error))}`)
	process.exitCode = 1
})

async function main() {
	const config = readConfig()
	let browser
	let serverProcess
	const startedAt = new Date().toISOString()

	log(
		`Starting ${config.profile} run ${config.runId}: ${config.repetitions} paired repetitions, seed ${config.seed}`
	)
	log(`Target: ${config.url}`)

	try {
		serverProcess = await ensureFrontend(config)
		browser = await chromium.launch(buildLaunchOptions(config))
		const context = await browser.newContext({
			viewport: config.viewport,
			deviceScaleFactor: 1,
			locale: 'en-US',
			timezoneId: 'UTC',
		})
		const page = await context.newPage()
		page.setDefaultTimeout(config.bridgeTimeoutMs)
		page.setDefaultNavigationTimeout(config.navigationTimeoutMs)
		const pageErrors = []
		page.on('pageerror', (error) => pageErrors.push(redactSensitiveText(formatError(error))))

		await loadExperimentPage(page, config)
		const rawCases = await callBridge(page, config, 'listCases')
		const cases = selectCases(normalizeCases(rawCases), config)
		const schedule = buildSchedule(cases, config)
		assertAdjacentPairs(schedule)

		const writer = await createExperimentArtifactWriter({
			runDir: config.outputDir,
			runId: config.runId,
		})
		const browserMetadata = {
			engine: 'chromium',
			version: browser.version(),
			channel: config.browserChannel,
			executablePath: config.browserExecutablePath,
			headless: config.headless,
		}
		await writer.initialize({
			config: configForArtifact(config, cases),
			browser: browserMetadata,
			schedule,
			startedAt,
		})

		const existingRecords = await writer.loadResults()
		const completedTrialIds = new Set(existingRecords.map((record) => record.trialId))
		const pending = schedule.filter((trial) => !completedTrialIds.has(trial.trialId))
		log(
			`Scheduled ${schedule.length} trials in ${schedule.length / 2} adjacent pairs; ${pending.length} remain.`
		)

		for (const [pendingIndex, trial] of pending.entries()) {
			pageErrors.length = 0
			log(
				`[${pendingIndex + 1}/${pending.length}] ${trial.caseId}/${trial.rotation ?? 'default'} · ${trial.variant} · pair order ${trial.withinPairOrder + 1}/2`
			)
			const record = await runTrial({
				page,
				trial,
				config,
				writer,
				pageErrors,
			})
			await writer.appendTrial(record)
			if (record.status === 'failed' && config.failFast) break
		}

		const finishedAt = new Date().toISOString()
		const finalized = await writer.finalize({
			config: configForArtifact(config, cases),
			browser: browserMetadata,
			schedule,
			startedAt,
			finishedAt,
		})
		log(`Results: ${writer.paths.results}`)
		log(`Report: ${writer.paths.report}`)
		log(
			`Completed ${finalized.summary.completedTrials}; runner failures ${finalized.summary.failedTrials}; remaining ${finalized.summary.remainingTrials}.`
		)
		if (finalized.summary.failedTrials > 0 || finalized.summary.remainingTrials > 0) {
			process.exitCode = 2
		}
	} finally {
		await browser?.close().catch(() => undefined)
		await stopServer(serverProcess)
	}
}

async function runTrial({ page, trial, config, writer, pageErrors }) {
	const startedAt = new Date().toISOString()
	const startedMs = Date.now()
	const screenshots = {}
	let prepareResult = null
	let promptResult = null
	let idleResult = null
	let exportedState = null

	try {
		if (config.reloadEachTrial) await loadExperimentPage(page, config)
		const prepareInput = {
			caseId: trial.caseId,
			variant: trial.variant,
			modelName: trial.modelName,
			...(trial.rotation === null ? {} : { rotation: trial.rotation }),
		}
		const rawPrepareResult = await withTimeout(
			callBridge(page, config, 'prepareTrial', prepareInput),
			config.trialTimeoutMs,
			'prepareTrial'
		)
		prepareResult = compactBridgeResult(rawPrepareResult)

		if (config.screenshotMode === 'before-after') {
			screenshots.before = await captureScreenshot(page, writer, trial, 'before')
		}

		const message =
			trial.prompt ??
			rawPrepareResult?.preparedTrial?.prompt ??
			rawPrepareResult?.prompt ??
			rawPrepareResult?.message ??
			rawPrepareResult?.request
		const rawPromptResult = await withTimeout(
			message === null || message === undefined
				? callBridge(page, config, 'prompt')
				: callBridge(page, config, 'prompt', message),
			config.trialTimeoutMs,
			'prompt'
		)
		promptResult = compactBridgeResult(rawPromptResult)

		if (await hasBridgeMethod(page, config, 'waitForIdle')) {
			const rawIdleResult = await withTimeout(
				callBridge(page, config, 'waitForIdle', config.trialTimeoutMs),
				config.trialTimeoutMs + 5_000,
				'waitForIdle'
			)
			if (rawIdleResult === false) throw new Error('waitForIdle returned false')
			idleResult = compactBridgeResult(rawIdleResult)
		}

			exportedState = await withTimeout(
			callBridge(page, config, 'exportState'),
			config.bridgeTimeoutMs,
			'exportState'
		)
		// A zero-action response can be a valid model abstention. Reject only when
		// the client recorded an actual request/transport error.
		if (exportedState?.lastError) {
			throw new Error(`Agent reported an error: ${String(exportedState.lastError)}`)
		}
		if (exportedState?.isGenerating) throw new Error('Agent was still generating after waitForIdle.')
		if (config.screenshotMode !== 'none') {
			screenshots.after = await captureScreenshot(page, writer, trial, 'after')
		}

		return redactSensitive({
			schemaVersion: 1,
			kind: 'trial',
			runId: config.runId,
			...trial,
			status: 'complete',
			startedAt,
			finishedAt: new Date().toISOString(),
			durationMs: Date.now() - startedMs,
			prepareResult,
			promptResult,
			idleResult,
			exportedState,
			screenshots,
			pageErrors: [...pageErrors],
			error: null,
		})
	} catch (error) {
		try {
			if (config.screenshotMode !== 'none') {
				screenshots.error = await captureScreenshot(page, writer, trial, 'error')
			}
		} catch (screenshotError) {
			pageErrors.push(`Error screenshot failed: ${redactSensitiveText(formatError(screenshotError))}`)
		}
		return redactSensitive({
			schemaVersion: 1,
			kind: 'trial',
			runId: config.runId,
			...trial,
			status: 'failed',
			startedAt,
			finishedAt: new Date().toISOString(),
			durationMs: Date.now() - startedMs,
			prepareResult,
			promptResult,
			idleResult,
			exportedState,
			screenshots,
			pageErrors: [...pageErrors],
			error: redactSensitiveText(formatError(error)),
		})
	}
}

async function captureScreenshot(page, writer, trial, stage) {
	const buffer = await page.screenshot({
		animations: 'disabled',
		caret: 'hide',
		fullPage: false,
		scale: 'css',
		type: 'png',
	})
	return writer.saveScreenshot({ trialId: trial.trialId, stage, buffer })
}

async function loadExperimentPage(page, config) {
	await page.goto(config.url, { waitUntil: 'domcontentloaded' })
	await page.waitForFunction(
		({ bridgeName, requiredMethods }) => {
			const bridge = window[bridgeName]
			return (
				bridge && requiredMethods.every((method) => typeof bridge[method] === 'function')
			)
		},
		{
			bridgeName: config.bridgeName,
			requiredMethods: [
				BRIDGE_METHODS.listCases,
				BRIDGE_METHODS.prepareTrial,
				BRIDGE_METHODS.prompt,
				BRIDGE_METHODS.exportState,
			],
		},
		{ timeout: config.bridgeTimeoutMs }
	)
}

async function callBridge(page, config, operation, argument) {
	const method = BRIDGE_METHODS[operation]
	if (!method) throw new Error(`Unknown bridge operation: ${operation}`)
	return page.evaluate(
		async ({ bridgeName, method, hasArgument, argument }) => {
			const bridge = window[bridgeName]
			const fn = bridge?.[method]
			if (typeof fn !== 'function') {
				throw new Error(`Missing window.${bridgeName}.${method}()`)
			}
			return hasArgument ? await fn.call(bridge, argument) : await fn.call(bridge)
		},
		{
			bridgeName: config.bridgeName,
			method,
			hasArgument: arguments.length >= 4,
			argument,
		}
	)
}

async function hasBridgeMethod(page, config, operation) {
	const method = BRIDGE_METHODS[operation]
	return page.evaluate(
		({ bridgeName, method }) => typeof window[bridgeName]?.[method] === 'function',
		{ bridgeName: config.bridgeName, method }
	)
}

function normalizeCases(rawCases) {
	const input = Array.isArray(rawCases) ? rawCases : rawCases?.cases
	if (!Array.isArray(input)) {
		throw new Error('window.__canvasObsEval.listCases() must return an array or { cases: [] }.')
	}

	return input.map((rawCase, caseIndex) => {
		if (typeof rawCase === 'string') {
			return {
				id: rawCase,
				label: rawCase,
				rotations: [{ id: null, resolvedId: null, prompt: null }],
			}
		}
		if (!rawCase || typeof rawCase !== 'object') {
			throw new Error(`Invalid case at listCases()[${caseIndex}]`)
		}
		const id = rawCase.id ?? rawCase.caseId
		if (typeof id !== 'string' || id.length === 0) {
			throw new Error(`Case at listCases()[${caseIndex}] is missing id/caseId.`)
		}
		const casePrompt = rawCase.prompt ?? rawCase.message ?? rawCase.request ?? null
		const rawRotations = rawCase.rotations ?? rawCase.states ?? rawCase.configurations
		const rotations = Array.isArray(rawRotations) && rawRotations.length > 0
			? rawRotations.map((rotation, rotationIndex) =>
				normalizeRotation(rotation, casePrompt, id, rotationIndex)
			)
			: [
				{
					id: rawCase.rotation ?? null,
					resolvedId: rawCase.resolvedRotation ?? rawCase.rotation ?? null,
					prompt: casePrompt,
				},
			]
		return {
			id,
			label: rawCase.label ?? rawCase.title ?? id,
			rotations,
		}
	})
}

function normalizeRotation(rotation, casePrompt, caseId, rotationIndex) {
	if (typeof rotation === 'string' || typeof rotation === 'number') {
		return { id: String(rotation), resolvedId: String(rotation), prompt: casePrompt }
	}
	if (!rotation || typeof rotation !== 'object') {
		throw new Error(`Invalid rotation at ${caseId}.rotations[${rotationIndex}]`)
	}
	const id = rotation.id ?? rotation.rotation ?? rotation.name ?? rotation.stateId
	if (typeof id !== 'string' && typeof id !== 'number') {
		throw new Error(`Rotation at ${caseId}.rotations[${rotationIndex}] is missing an id.`)
	}
	return {
		id: String(id),
		resolvedId: String(rotation.resolvedId ?? rotation.rotationId ?? id),
		prompt: rotation.prompt ?? rotation.message ?? rotation.request ?? casePrompt,
	}
}

function selectCases(cases, config) {
	const caseById = new Map(cases.map((item) => [item.id, item]))
	const missing = config.caseIds.filter((caseId) => !caseById.has(caseId))
	if (missing.length > 0) {
		throw new Error(
			`Bridge is missing requested case(s): ${missing.join(', ')}. Available: ${cases.map((item) => item.id).join(', ')}`
		)
	}

	return config.caseIds.map((caseId) => {
		const item = caseById.get(caseId)
		let rotations = item.rotations
		if (config.rotationIds.length > 0) {
			rotations = rotations.filter((rotation) => {
				if (rotation.id === null) return config.rotationIds.includes('default')
				return (
					config.rotationIds.includes(rotation.id) ||
					(rotation.resolvedId !== null && config.rotationIds.includes(rotation.resolvedId))
				)
			})
		}
		if (Number.isFinite(config.rotationLimit)) rotations = rotations.slice(0, config.rotationLimit)
		if (rotations.length === 0) {
			throw new Error(`No rotations selected for ${caseId}.`)
		}
		return { ...item, rotations }
	})
}

function buildSchedule(cases, config) {
	const random = seededRandom(config.seed)
	const pairs = []
	for (let repetition = 1; repetition <= config.repetitions; repetition++) {
		for (const modelName of config.modelNames) {
			for (const item of cases) {
				for (const rotation of item.rotations) {
					const pairKey = JSON.stringify([
						config.runId,
						repetition,
						modelName,
						item.id,
						rotation.id,
					])
					const pairId = `pair-${createHash('sha256').update(pairKey).digest('hex').slice(0, 16)}`
					const orderedVariants = shuffle([...config.variants], random)
					pairs.push(
						orderedVariants.map((variant, withinPairOrder) => ({
							trialId: `${pairId}--${safeId(variant)}`,
							pairId,
							withinPairOrder,
							repetition,
							modelName,
							caseId: item.id,
							caseLabel: item.label,
							rotation: rotation.id,
							resolvedRotation: rotation.resolvedId,
							variant,
							prompt: rotation.prompt,
						}))
					)
				}
			}
		}
	}

	return shuffle(pairs, random).flatMap((pair, pairIndex) =>
		pair.map((trial, withinPairOrder) => ({
			...trial,
			ordinal: pairIndex * 2 + withinPairOrder + 1,
			pairOrdinal: pairIndex + 1,
		}))
	)
}

function assertAdjacentPairs(schedule) {
	if (schedule.length % 2 !== 0) throw new Error('Matched schedule has an odd trial count.')
	for (let index = 0; index < schedule.length; index += 2) {
		const left = schedule[index]
		const right = schedule[index + 1]
		if (left.pairId !== right.pairId || left.variant === right.variant) {
			throw new Error(`Schedule lost adjacency at trials ${index + 1}-${index + 2}.`)
		}
	}
}

function readConfig() {
	const profile = readChoiceEnv('CANVAS_OBS_EVAL_PROFILE', ['pilot', 'full'], 'pilot')
	const defaults = PROFILE_DEFAULTS[profile]
	const seed = process.env.CANVAS_OBS_EVAL_SEED?.trim() || randomBytes(8).toString('hex')
	const runId =
		process.env.CANVAS_OBS_EVAL_RUN_ID?.trim() ||
		`${new Date().toISOString().replace(/[:.]/g, '-')}-${profile}-${seed.slice(0, 8)}`
	const url = process.env.CANVAS_OBS_EVAL_URL?.trim() || 'http://127.0.0.1:5173/?eval=1'
	const browserChannel = process.env.CANVAS_OBS_EVAL_BROWSER_CHANNEL?.trim() || 'chrome'
	const browserExecutablePath = process.env.CANVAS_OBS_EVAL_BROWSER_EXECUTABLE?.trim() || null
	const variants = readListEnv(
		'CANVAS_OBS_EVAL_VARIANTS',
		['canvasact', 'original-tldraw']
	)
	if (variants.length !== 2 || new Set(variants).size !== 2) {
		throw new Error('CANVAS_OBS_EVAL_VARIANTS must contain exactly two distinct variants.')
	}

	return {
		profile,
		seed,
		runId,
		url,
		outputDir:
			process.env.CANVAS_OBS_EVAL_OUTPUT_DIR?.trim() ||
			resolve(repoRoot, 'output', 'playwright', 'canvas-observation', runId),
		caseIds: readListEnv('CANVAS_OBS_EVAL_CASES', DEFAULT_CASE_IDS),
		rotationIds: readListEnv('CANVAS_OBS_EVAL_ROTATIONS', []),
		rotationLimit: readPositiveIntOrInfinityEnv(
			'CANVAS_OBS_EVAL_ROTATION_LIMIT',
			defaults.rotationLimit
		),
		modelNames: readListEnv('CANVAS_OBS_EVAL_MODELS', ['claude-sonnet-4-5']),
		variants,
		repetitions: readPositiveIntEnv('CANVAS_OBS_EVAL_REPETITIONS', defaults.repetitions),
		bridgeName: process.env.CANVAS_OBS_EVAL_BRIDGE_NAME?.trim() || '__canvasObsEval',
		bridgeTimeoutMs: readPositiveIntEnv('CANVAS_OBS_EVAL_BRIDGE_TIMEOUT_MS', 60_000),
		navigationTimeoutMs: readPositiveIntEnv(
			'CANVAS_OBS_EVAL_NAVIGATION_TIMEOUT_MS',
			60_000
		),
		trialTimeoutMs: readPositiveIntEnv('CANVAS_OBS_EVAL_TRIAL_TIMEOUT_MS', 240_000),
		viewport: readViewport(process.env.CANVAS_OBS_EVAL_VIEWPORT ?? '1440x1000'),
		headless: readBooleanEnv('CANVAS_OBS_EVAL_HEADLESS', true),
		browserChannel,
		browserExecutablePath,
		startServers: readBooleanEnv('CANVAS_OBS_EVAL_START_SERVERS', false),
		backendPort: readPositiveIntEnv('CANVAS_OBS_EVAL_BACKEND_PORT', 5000),
		reloadEachTrial: readBooleanEnv('CANVAS_OBS_EVAL_RELOAD_EACH_TRIAL', true),
		failFast: readBooleanEnv('CANVAS_OBS_EVAL_FAIL_FAST', false),
		screenshotMode: readChoiceEnv(
			'CANVAS_OBS_EVAL_SCREENSHOTS',
			['none', 'after', 'before-after'],
			'before-after'
		),
	}
}

function buildLaunchOptions(config) {
	return {
		headless: config.headless,
		...(config.browserExecutablePath
			? { executablePath: config.browserExecutablePath }
			: config.browserChannel === 'chromium'
				? {}
				: { channel: config.browserChannel }),
	}
}

function configForArtifact(config, cases) {
	return redactSensitive({
		profile: config.profile,
		seed: config.seed,
		url: config.url,
		outputDir: config.outputDir,
		caseIds: config.caseIds,
		selectedCases: cases,
		rotationIds: config.rotationIds,
		rotationLimit: Number.isFinite(config.rotationLimit) ? config.rotationLimit : 'all',
		modelNames: config.modelNames,
		variants: config.variants,
		repetitions: config.repetitions,
		bridgeName: config.bridgeName,
		bridgeMethods: BRIDGE_METHODS,
		bridgeTimeoutMs: config.bridgeTimeoutMs,
		navigationTimeoutMs: config.navigationTimeoutMs,
		trialTimeoutMs: config.trialTimeoutMs,
		viewport: config.viewport,
		headless: config.headless,
		browserChannel: config.browserChannel,
		browserExecutablePath: config.browserExecutablePath,
		startServers: config.startServers,
		backendPort: config.backendPort,
		reloadEachTrial: config.reloadEachTrial,
		failFast: config.failFast,
		screenshotMode: config.screenshotMode,
	})
}

function compactBridgeResult(result) {
	if (!result || typeof result !== 'object') return result
	return {
		version: result.version,
		preparedTrial: result.preparedTrial ?? null,
		caseId: result.caseId ?? null,
		variant: result.variant,
		modelName: result.modelName,
		isGenerating: result.isGenerating,
		lastError: result.lastError ?? null,
		evaluation: result.evaluation ?? null,
		actionCount: Array.isArray(result.actions) ? result.actions.length : null,
		trajectoryCount: Array.isArray(result.trajectories) ? result.trajectories.length : null,
	}
}

async function ensureFrontend(config) {
	if (await isReachable(config.url)) return null
	if (!config.startServers) {
		throw new Error(
			`Frontend is not reachable at ${config.url}. Start it with ./dev.sh, or set CANVAS_OBS_EVAL_START_SERVERS=1.`
		)
	}

	const url = new URL(config.url)
	if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
		throw new Error('Automatic startup is allowed only for a loopback CANVAS_OBS_EVAL_URL.')
	}
	const devScript = resolve(repoRoot, 'dev.sh')
	await access(devScript)
	const frontendPort = Number(url.port || (url.protocol === 'https:' ? 443 : 80))
	log(`Starting ./dev.sh on frontend port ${frontendPort}, backend port ${config.backendPort}.`)
	const child = spawn(devScript, [], {
		cwd: repoRoot,
		env: {
			...process.env,
			FRONTEND_PORT: String(frontendPort),
			BACKEND_PORT: String(config.backendPort),
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	pipeSanitized(child.stdout, '[dev]')
	pipeSanitized(child.stderr, '[dev]')
	await waitForReachable(config.url, config.navigationTimeoutMs, child)
	return child
}

async function stopServer(child) {
	if (!child || child.exitCode !== null) return
	child.kill('SIGTERM')
	await Promise.race([
		new Promise((resolvePromise) => child.once('exit', resolvePromise)),
		new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000)),
	])
	if (child.exitCode === null) child.kill('SIGKILL')
}

async function waitForReachable(url, timeoutMs, child) {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`./dev.sh exited with code ${child.exitCode} before the frontend was ready.`)
		}
		if (await isReachable(url)) return
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
	}
	throw new Error(`Timed out waiting for ${url}.`)
}

async function isReachable(url) {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), 2_000)
	try {
		const response = await fetch(url, { signal: controller.signal })
		return response.status < 500
	} catch {
		return false
	} finally {
		clearTimeout(timeout)
	}
}

function pipeSanitized(stream, prefix) {
	let pending = ''
	stream.setEncoding('utf8')
	stream.on('data', (chunk) => {
		pending += chunk
		const lines = pending.split(/\r?\n/)
		pending = lines.pop() ?? ''
		for (const line of lines) {
			if (line.trim()) console.log(`${prefix} ${redactSensitiveText(line)}`)
		}
	})
}

function seededRandom(seed) {
	let state = 2166136261
	for (const character of String(seed)) {
		state ^= character.charCodeAt(0)
		state = Math.imul(state, 16777619)
	}
	return () => {
		state += 0x6d2b79f5
		let value = state
		value = Math.imul(value ^ (value >>> 15), value | 1)
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296
	}
}

function shuffle(values, random) {
	for (let index = values.length - 1; index > 0; index--) {
		const swapIndex = Math.floor(random() * (index + 1))
		;[values[index], values[swapIndex]] = [values[swapIndex], values[index]]
	}
	return values
}

function withTimeout(promise, timeoutMs, label) {
	let timer
	return Promise.race([
		promise,
		new Promise((_, reject) => {
			timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs)
		}),
	]).finally(() => clearTimeout(timer))
}

function readListEnv(name, fallback) {
	const raw = process.env[name]
	if (raw === undefined || raw.trim() === '') return [...fallback]
	return [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))]
}

function readPositiveIntEnv(name, fallback) {
	const raw = process.env[name]
	if (raw === undefined || raw.trim() === '') return fallback
	const value = Number.parseInt(raw, 10)
	if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`)
	return value
}

function readPositiveIntOrInfinityEnv(name, fallback) {
	const raw = process.env[name]
	if (raw === undefined || raw.trim() === '') return fallback
	if (raw.trim().toLowerCase() === 'all') return Number.POSITIVE_INFINITY
	return readPositiveIntEnv(name, fallback)
}

function readBooleanEnv(name, fallback) {
	const raw = process.env[name]
	if (raw === undefined || raw.trim() === '') return fallback
	if (/^(1|true|yes|on)$/i.test(raw)) return true
	if (/^(0|false|no|off)$/i.test(raw)) return false
	throw new Error(`${name} must be true/false or 1/0.`)
}

function readChoiceEnv(name, choices, fallback) {
	const value = process.env[name]?.trim() || fallback
	if (!choices.includes(value)) throw new Error(`${name} must be one of: ${choices.join(', ')}.`)
	return value
}

function readViewport(raw) {
	const match = /^(\d+)x(\d+)$/i.exec(raw.trim())
	if (!match) throw new Error('CANVAS_OBS_EVAL_VIEWPORT must look like 1440x1000.')
	const width = Number(match[1])
	const height = Number(match[2])
	if (width < 320 || height < 240) throw new Error('CANVAS_OBS_EVAL_VIEWPORT is too small.')
	return { width, height }
}

function safeId(value) {
	return String(value).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
}

function formatError(error) {
	if (error instanceof Error) return error.stack || error.message
	return typeof error === 'string' ? error : JSON.stringify(error)
}

function log(message) {
	console.log(`[browser-eval] ${redactSensitiveText(message)}`)
}

function printHelp() {
	console.log(`CanvasObservation browser experiment runner

Usage:
  cd frontend
  node scripts/run-browser-observation-experiment.mjs

Profiles:
  CANVAS_OBS_EVAL_PROFILE=pilot  2 repetitions, first rotation per case (default)
  CANVAS_OBS_EVAL_PROFILE=full   20 repetitions, every rotation

Common overrides:
  CANVAS_OBS_EVAL_URL=http://127.0.0.1:5173/?eval=1
  CANVAS_OBS_EVAL_START_SERVERS=1
  CANVAS_OBS_EVAL_MODELS=claude-sonnet-4-5
  CANVAS_OBS_EVAL_REPETITIONS=2
  CANVAS_OBS_EVAL_CASES=viewport-coverage,object-state
  CANVAS_OBS_EVAL_ROTATIONS=editable-top,blue-bottom
  CANVAS_OBS_EVAL_ROTATION_LIMIT=all
  CANVAS_OBS_EVAL_SEED=my-reproducible-seed
  CANVAS_OBS_EVAL_RUN_ID=my-run
  CANVAS_OBS_EVAL_OUTPUT_DIR=/absolute/output/path
  CANVAS_OBS_EVAL_HEADLESS=0
  CANVAS_OBS_EVAL_BROWSER_CHANNEL=chrome
  CANVAS_OBS_EVAL_BROWSER_EXECUTABLE=/absolute/path/to/browser
  CANVAS_OBS_EVAL_SCREENSHOTS=before-after|after|none

The bridge adapter is centralized in BRIDGE_METHODS. The expected global is
window.__canvasObsEval with listCases(), prepareTrial(), prompt(), optional
waitForIdle(), and exportState(). Results append to results.jsonl after every
trial; screenshots and per-trial metadata are saved beside it.`)
}
