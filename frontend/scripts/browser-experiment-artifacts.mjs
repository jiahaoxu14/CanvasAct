import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

const SENSITIVE_KEY = /^(?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|password|secret|cookie|set-cookie)$/i
const ENV_SECRET_ASSIGNMENT = /\b(?:OPENAI|ANTHROPIC|GOOGLE|AZURE|AWS)[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*[^\s,;]+/gi
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi
const PROVIDER_KEY = /\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{20,})\b/g

/**
 * Durable, append-only artifact storage for the browser experiment.
 *
 * A completed trial is appended to results.jsonl before any aggregate report is
 * rebuilt. That makes a partially completed, expensive run resumable after a
 * browser, model, or machine failure.
 */
export async function createExperimentArtifactWriter({ runDir, runId }) {
	const absoluteRunDir = resolve(runDir)
	const paths = {
		runDir: absoluteRunDir,
		results: resolve(absoluteRunDir, 'results.jsonl'),
		runMetadata: resolve(absoluteRunDir, 'run.json'),
		schedule: resolve(absoluteRunDir, 'schedule.json'),
		summary: resolve(absoluteRunDir, 'summary.json'),
		report: resolve(absoluteRunDir, 'report.md'),
		screenshots: resolve(absoluteRunDir, 'screenshots'),
		trialMetadata: resolve(absoluteRunDir, 'trial-metadata'),
	}

	await Promise.all([
		mkdir(paths.runDir, { recursive: true }),
		mkdir(paths.screenshots, { recursive: true }),
		mkdir(paths.trialMetadata, { recursive: true }),
	])

	return {
		paths,

		async initialize({ config, browser, schedule, startedAt }) {
			const metadata = redactSensitive({
				schemaVersion: 1,
				runId,
				status: 'running',
				startedAt,
				updatedAt: new Date().toISOString(),
				config,
				browser,
				scheduledTrialCount: schedule.length,
			})
			await atomicWriteJson(paths.runMetadata, metadata)
			await atomicWriteJson(paths.schedule, {
				schemaVersion: 1,
				runId,
				trials: redactSensitive(schedule),
			})
			return metadata
		},

		async loadResults() {
			return readJsonLines(paths.results)
		},

		async appendTrial(record) {
			const safeRecord = redactSensitive(record)
			await appendFile(paths.results, `${JSON.stringify(safeRecord)}\n`, {
				encoding: 'utf8',
				mode: 0o600,
			})
			await atomicWriteJson(
				resolve(paths.trialMetadata, `${safeFilename(record.trialId)}.json`),
				safeRecord
			)
			return safeRecord
		},

		async saveScreenshot({ trialId, stage, buffer }) {
			const filename = `${safeFilename(trialId)}--${safeFilename(stage)}.png`
			const absolutePath = resolve(paths.screenshots, filename)
			await writeFile(absolutePath, buffer, { mode: 0o600 })
			return normalizeRelativePath(relative(paths.runDir, absolutePath))
		},

		async finalize({ config, browser, schedule, startedAt, finishedAt }) {
			const records = await readJsonLines(paths.results)
			const summary = summarizeExperiment({ records, schedule })
			const status = summary.failedTrials === 0 ? 'complete' : 'complete-with-errors'
			const metadata = redactSensitive({
				schemaVersion: 1,
				runId,
				status,
				startedAt,
				finishedAt,
				updatedAt: finishedAt,
				config,
				browser,
				scheduledTrialCount: schedule.length,
				completedTrialCount: records.length,
			})

			await Promise.all([
				atomicWriteJson(paths.runMetadata, metadata),
				atomicWriteJson(paths.summary, { schemaVersion: 1, runId, ...summary }),
				writeFile(
					paths.report,
					buildMarkdownReport({ runId, metadata, summary, records }),
					{ encoding: 'utf8', mode: 0o600 }
				),
			])
			return { metadata, records, summary }
		},
	}
}

export function redactSensitive(value, seen = new WeakSet()) {
	if (typeof value === 'string') return redactSensitiveText(value)
	if (value === null || typeof value !== 'object') return value
	if (seen.has(value)) return '[Circular]'
	seen.add(value)

	if (Array.isArray(value)) {
		const result = value.map((item) => redactSensitive(item, seen))
		seen.delete(value)
		return result
	}

	const result = {}
	for (const [key, nestedValue] of Object.entries(value)) {
		result[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactSensitive(nestedValue, seen)
	}
	seen.delete(value)
	return result
}

export function redactSensitiveText(value) {
	return String(value)
		.replace(ENV_SECRET_ASSIGNMENT, (match) => `${match.split('=')[0]}=[REDACTED]`)
		.replace(BEARER_TOKEN, 'Bearer [REDACTED]')
		.replace(PROVIDER_KEY, '[REDACTED]')
}

export async function readJsonLines(path) {
	let text
	try {
		text = await readFile(path, 'utf8')
	} catch (error) {
		if (error?.code === 'ENOENT') return []
		throw error
	}

	const records = []
	for (const [index, line] of text.split(/\r?\n/).entries()) {
		if (!line.trim()) continue
		try {
			records.push(JSON.parse(line))
		} catch (error) {
			throw new Error(`Invalid JSONL at ${path}:${index + 1}: ${redactSensitiveText(error.message)}`)
		}
	}
	return records
}

export function summarizeExperiment({ records, schedule }) {
	const completedIds = new Set(records.map((record) => record.trialId))
	const completeRecords = records.filter((record) => record.status === 'complete')
	const failedRecords = records.filter((record) => record.status === 'failed')
	const byVariant = summarizeGroups(completeRecords, (record) => record.variant)
	const byCaseAndVariant = summarizeGroups(
		completeRecords,
		(record) => `${record.caseId}::${record.variant}`
	)
	const pairMap = new Map()
	for (const record of completeRecords) {
		const pairRecords = pairMap.get(record.pairId) ?? []
		pairRecords.push(record)
		pairMap.set(record.pairId, pairRecords)
	}

	let completePairs = 0
	let scoredPairs = 0
	const pairComparisons = {}
	for (const pairRecords of pairMap.values()) {
		if (pairRecords.length !== 2) continue
		completePairs++
		const [left, right] = pairRecords
		const leftOutcome = extractComparableOutcome(left.exportedState)
		const rightOutcome = extractComparableOutcome(right.exportedState)
		if (leftOutcome === null || rightOutcome === null) continue
		scoredPairs++
		const key = [left.variant, right.variant].sort().join(' vs ')
		const comparison = pairComparisons[key] ?? { ties: 0, wins: {} }
		if (leftOutcome === rightOutcome) comparison.ties++
		else {
			const winner = leftOutcome > rightOutcome ? left.variant : right.variant
			comparison.wins[winner] = (comparison.wins[winner] ?? 0) + 1
		}
		pairComparisons[key] = comparison
	}

	return {
		scheduledTrials: schedule.length,
		recordedTrials: records.length,
		remainingTrials: schedule.filter((trial) => !completedIds.has(trial.trialId)).length,
		completedTrials: completeRecords.length,
		failedTrials: failedRecords.length,
		completePairs,
		scoredPairs,
		pairComparisons,
		byVariant,
		byCaseAndVariant,
	}
}

function summarizeGroups(records, getKey) {
	const groups = {}
	for (const record of records) {
		const key = getKey(record)
		const group = groups[key] ?? {
			trials: 0,
			passed: 0,
			failedOutcome: 0,
			unscored: 0,
			totalDurationMs: 0,
			totalScore: 0,
			scoredTrials: 0,
			components: {
				grounding: { passed: 0, evaluated: 0 },
				geometry: { passed: 0, evaluated: 0 },
				relation: { passed: 0, evaluated: 0 },
				collateral: { passed: 0, evaluated: 0 },
			},
		}
		group.trials++
		group.totalDurationMs += Number(record.durationMs) || 0
		const passed = extractPassed(record.exportedState)
		if (passed === true) group.passed++
		else if (passed === false) group.failedOutcome++
		else group.unscored++
		const score = extractNumericScore(record.exportedState)
		if (score !== null) {
			group.totalScore += score
			group.scoredTrials++
		}
		const evaluation = extractEvaluation(record.exportedState)
		for (const component of ['grounding', 'geometry', 'relation', 'collateral']) {
			if (component === 'relation' && evaluation?.relation?.applicable === false) continue
			const componentPassed = evaluation?.[component]?.passed
			if (typeof componentPassed !== 'boolean') continue
			group.components[component].evaluated++
			if (componentPassed) group.components[component].passed++
		}
		groups[key] = group
	}

	for (const group of Object.values(groups)) {
		group.averageDurationMs =
			group.trials === 0 ? null : Math.round(group.totalDurationMs / group.trials)
		group.averageScore =
			group.scoredTrials === 0
				? null
				: Math.round((group.totalScore / group.scoredTrials) * 1000) / 1000
		delete group.totalDurationMs
		delete group.totalScore
	}
	return groups
}

function extractNumericScore(state) {
	for (const candidate of [state?.score, state?.result?.score, state?.evaluation?.score]) {
		if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate
	}
	return null
}

function extractPassed(state) {
	for (const candidate of [
		state?.evaluation?.overallPassed,
		state?.result?.evaluation?.overallPassed,
		state?.overallPassed,
		state?.passed,
		state?.result?.passed,
		state?.evaluation?.passed,
	]) {
		if (typeof candidate === 'boolean') return candidate
	}
	return null
}

function extractEvaluation(state) {
	for (const candidate of [
		state?.evaluation,
		state?.result?.evaluation,
		state?.score,
		state?.result?.score,
		state,
	]) {
		if (candidate && typeof candidate === 'object' && 'overallPassed' in candidate) {
			return candidate
		}
	}
	return null
}

function extractComparableOutcome(state) {
	const score = extractNumericScore(state)
	if (score !== null) return score
	const passed = extractPassed(state)
	if (passed !== null) return passed ? 1 : 0
	return null
}

function buildMarkdownReport({ runId, metadata, summary, records }) {
	const lines = [
		'# CanvasObservation Browser Experiment',
		'',
		`Run: \`${escapeMarkdown(runId)}\``,
		'',
		`Status: **${escapeMarkdown(metadata.status)}**`,
		'',
		`Started: ${escapeMarkdown(metadata.startedAt)}`,
		'',
		`Finished: ${escapeMarkdown(metadata.finishedAt ?? 'in progress')}`,
		'',
		'## Coverage',
		'',
		`- Scheduled trials: ${summary.scheduledTrials}`,
		`- Completed trials: ${summary.completedTrials}`,
		`- Failed trials: ${summary.failedTrials}`,
		`- Remaining trials: ${summary.remainingTrials}`,
		`- Complete adjacent pairs: ${summary.completePairs}`,
		'',
		'## Conditions',
		'',
		'| Variant | Trials | Overall pass | Grounding | Geometry | Relation | Collateral | Unscored | Mean score | Mean duration |',
		'| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
	]

	for (const [variant, row] of Object.entries(summary.byVariant).sort()) {
		lines.push(
			`| \`${escapeCell(variant)}\` | ${row.trials} | ${row.passed}/${row.passed + row.failedOutcome} | ${formatComponent(row.components.grounding)} | ${formatComponent(row.components.geometry)} | ${formatComponent(row.components.relation)} | ${formatComponent(row.components.collateral)} | ${row.unscored} | ${formatNumber(row.averageScore)} | ${formatDuration(row.averageDurationMs)} |`
		)
	}

	lines.push(
		'',
		'## Cases',
		'',
		'| Case | Variant | Trials | Passed | Mean score | Mean duration |',
		'| --- | --- | ---: | ---: | ---: | ---: |'
	)
	for (const [key, row] of Object.entries(summary.byCaseAndVariant).sort()) {
		const [caseId, variant] = key.split('::')
		lines.push(
			`| \`${escapeCell(caseId)}\` | \`${escapeCell(variant)}\` | ${row.trials} | ${row.passed} | ${formatNumber(row.averageScore)} | ${formatDuration(row.averageDurationMs)} |`
		)
	}

	const failures = records.filter((record) => record.status === 'failed')
	if (failures.length > 0) {
		lines.push(
			'',
			'## Runner failures',
			'',
			'| Trial | Case | Variant | Error |',
			'| --- | --- | --- | --- |'
		)
		for (const record of failures) {
			lines.push(
				`| \`${escapeCell(record.trialId)}\` | \`${escapeCell(record.caseId)}\` | \`${escapeCell(record.variant)}\` | ${escapeCell(record.error ?? 'Unknown error')} |`
			)
		}
	}

	lines.push(
		'',
		'## Artifacts',
		'',
		'- `results.jsonl`: append-only trial records',
		'- `trial-metadata/`: one JSON record per trial',
		'- `screenshots/`: before/after canvas evidence',
		'- `schedule.json`: randomized adjacent-pair order',
		'- `summary.json`: machine-readable aggregate',
		''
	)
	return `${lines.join('\n')}\n`
}

async function atomicWriteJson(path, value) {
	await mkdir(dirname(path), { recursive: true })
	const temporaryPath = `${path}.${randomUUID()}.tmp`
	await writeFile(temporaryPath, `${JSON.stringify(redactSensitive(value), null, 2)}\n`, {
		encoding: 'utf8',
		mode: 0o600,
	})
	await rename(temporaryPath, path)
}

function safeFilename(value) {
	const safe = String(value)
		.normalize('NFKD')
		.replace(/[^A-Za-z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '')
	return safe.slice(0, 180) || 'artifact'
}

function normalizeRelativePath(path) {
	return path.split('\\').join('/')
}

function formatNumber(value) {
	return typeof value === 'number' ? value.toFixed(3).replace(/\.?0+$/, '') : '-'
}

function formatDuration(value) {
	return typeof value === 'number' ? `${value} ms` : '-'
}

function formatComponent(component) {
	return component.evaluated === 0 ? '-' : `${component.passed}/${component.evaluated}`
}

function escapeMarkdown(value) {
	return String(value).replace(/([\\`*_{}[\]()#+.!|>-])/g, '\\$1')
}

function escapeCell(value) {
	return redactSensitiveText(String(value)).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}
