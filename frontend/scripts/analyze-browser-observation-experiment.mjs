#!/usr/bin/env node

import { readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

const VARIANT_LABELS = {
	canvasact: 'CanvasObs',
	'original-tldraw': 'Original tldraw',
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
	console.log(`Usage:
  node scripts/analyze-browser-observation-experiment.mjs <run-directory>
  node scripts/analyze-browser-observation-experiment.mjs --run-dir <run-directory>

Reads <run-directory>/results.jsonl without modifying it and writes:
  paired-analysis.json
  paired-analysis.md`)
	process.exit(0)
}

if (process.argv.includes('--self-test')) {
	runSelfTest()
	process.exit(0)
}

await main().catch((error) => {
	console.error(`[paired-analysis] ${formatError(error)}`)
	process.exitCode = 1
})

async function main() {
	const runDir = resolve(readRunDirectory(process.argv.slice(2)))
	const resultsPath = resolve(runDir, 'results.jsonl')
	const runPath = resolve(runDir, 'run.json')
	const [records, runMetadata] = await Promise.all([
		readJsonLines(resultsPath),
		readOptionalJson(runPath),
	])
	if (records.length === 0) throw new Error(`No trial records found in ${resultsPath}.`)

	const analysis = buildAnalysis({ records, runMetadata, runDir })
	const jsonPath = resolve(runDir, 'paired-analysis.json')
	const markdownPath = resolve(runDir, 'paired-analysis.md')
	await Promise.all([
		atomicWrite(jsonPath, `${JSON.stringify(analysis, null, 2)}\n`),
		atomicWrite(markdownPath, buildMarkdown(analysis)),
	])

	console.log(`Wrote paired analysis: ${jsonPath}`)
	console.log(`Wrote paired report: ${markdownPath}`)
	console.log(analysis.sample.label)
}

function buildAnalysis({ records, runMetadata, runDir }) {
	const completeRecords = records.filter((record) => record.status === 'complete')
	const failedRecords = records.filter((record) => record.status !== 'complete')
	const variantIds = orderVariants(unique(records.map((record) => record.variant)))
	const caseIds = unique(records.map((record) => record.caseId))
	const modelNames = unique(completeRecords.map((record) => record.modelName))
	const rotations = unique(
		completeRecords.map((record) => record.resolvedRotation ?? record.rotation),
	)
	const paired = summarizePairs(records, variantIds, caseIds)
	const profile = runMetadata?.config?.profile ?? 'unknown'
	const isPilot = profile === 'pilot'
	const configuredRepetitions = finiteOrNull(runMetadata?.config?.repetitions)
	const runId =
		runMetadata?.runId ?? records.find((record) => typeof record.runId === 'string')?.runId ?? basename(runDir)

	const byVariant = Object.fromEntries(
		variantIds.map((variant) => [
			variant,
			summarizeRecords(completeRecords.filter((record) => record.variant === variant)),
		]),
	)
	const byCase = Object.fromEntries(
		caseIds.map((caseId) => [
			caseId,
			{
				trials: completeRecords.filter((record) => record.caseId === caseId).length,
				variants: Object.fromEntries(
					variantIds.map((variant) => [
						variant,
						summarizeRecords(
							completeRecords.filter(
								(record) => record.caseId === caseId && record.variant === variant,
							),
						),
					]),
				),
				paired: paired.byCase[caseId],
			},
		]),
	)

	const label = `${isPilot ? 'Pilot' : titleCase(profile)}: n=${paired.completeMatchedPairs} matched pairs (${completeRecords.length} complete trials)`
	return {
		schemaVersion: 1,
		analysisType: 'paired-observation-experiment',
		generatedAt: new Date().toISOString(),
		runId,
		profile,
		isPilot,
		source: {
			runDirectory: runDir,
			resultsFile: 'results.jsonl',
			trialDataModified: false,
		},
		sample: {
			label,
			recordedTrials: records.length,
			completeTrials: completeRecords.length,
			failedOrIncompleteTrials: failedRecords.length,
			matchedPairs: paired.completeMatchedPairs,
			configuredRepetitions,
			models: modelNames,
			cases: caseIds,
			rotations,
			variants: variantIds,
		},
		metricDefinitions: {
			grounding: 'Exact target grounding reported by the final evaluator.',
			geometryConditionalOnGrounding:
				'Geometry pass rate only among trials with correct grounding; its denominator is not all trials.',
			overall: 'Final evaluator overall pass (grounding, geometry, relation, and collateral).',
			collateral: 'No disallowed additions, updates, or removals.',
			modelCalls: 'Sum of trajectory modelCallCount values within each trial.',
			trialLatencyMs: 'Runner wall-clock duration for the complete trial.',
			latencyToFirstActionMs:
				'Elapsed trajectory time through the first recorded action, including earlier no-action trajectories when available.',
		},
		byVariant,
		byCase,
		paired: {
			variants: paired.variants,
			totalPairIds: paired.totalPairIds,
			completeMatchedPairs: paired.completeMatchedPairs,
			incompleteOrInvalidPairs: paired.incompleteOrInvalidPairs,
			grounding: paired.grounding,
			overall: paired.overall,
		},
		interpretation: isPilot
			? 'This is a small pilot used to validate the protocol and analysis pipeline. Rates and exact p-values are descriptive and should not be treated as confirmatory evidence.'
			: 'Report effect sizes, denominators, and paired uncertainty before drawing conclusions; exact McNemar tests address only paired binary discordance.',
	}
}

function summarizeRecords(records) {
	const grounding = summarizeBinary(records, (record) => getEvaluation(record)?.grounding?.passed)
	const geometryConditionalOnGrounding = summarizeBinary(
		records.filter((record) => getEvaluation(record)?.grounding?.passed === true),
		(record) => getEvaluation(record)?.geometry?.passed,
	)
	const overall = summarizeBinary(records, (record) => getOverallPassed(getEvaluation(record)))
	const collateral = summarizeBinary(records, (record) => getEvaluation(record)?.collateral?.passed)
	const modelCallValues = records.map(getModelCallCount).filter(isFiniteNumber)
	const trialLatencyValues = records.map((record) => Number(record.durationMs)).filter(isFiniteNumber)
	const firstActionLatencyValues = records.map(getLatencyToFirstAction).filter(isFiniteNumber)

	return {
		trials: records.length,
		grounding,
		geometryConditionalOnGrounding: {
			...geometryConditionalOnGrounding,
			correctlyGroundedTrials: grounding.passed,
		},
		overall,
		collateral,
		modelCalls: summarizeNumeric(modelCallValues),
		trialLatencyMs: summarizeNumeric(trialLatencyValues),
		latencyToFirstActionMs: summarizeNumeric(firstActionLatencyValues),
	}
}

function summarizePairs(records, variantIds, caseIds) {
	const variants = chooseComparisonVariants(variantIds)
	const pairMap = new Map()
	for (const record of records) {
		if (typeof record.pairId !== 'string') continue
		const entries = pairMap.get(record.pairId) ?? []
		entries.push(record)
		pairMap.set(record.pairId, entries)
	}

	const completePairs = []
	let incompleteOrInvalidPairs = 0
	for (const [pairId, entries] of pairMap) {
		const leftRecords = entries.filter((record) => record.variant === variants.left)
		const rightRecords = entries.filter((record) => record.variant === variants.right)
		if (
			leftRecords.length !== 1 ||
			rightRecords.length !== 1 ||
			leftRecords[0].status !== 'complete' ||
			rightRecords[0].status !== 'complete' ||
			!samePairBlock(leftRecords[0], rightRecords[0])
		) {
			incompleteOrInvalidPairs++
			continue
		}
		completePairs.push({ pairId, left: leftRecords[0], right: rightRecords[0] })
	}

	const summarizeOutcome = (pairs, getOutcome) => {
		let bothPass = 0
		let leftOnlyPass = 0
		let rightOnlyPass = 0
		let bothFail = 0
		let unscoredPairs = 0
		for (const pair of pairs) {
			const left = getOutcome(pair.left)
			const right = getOutcome(pair.right)
			if (typeof left !== 'boolean' || typeof right !== 'boolean') {
				unscoredPairs++
				continue
			}
			if (left && right) bothPass++
			else if (left) leftOnlyPass++
			else if (right) rightOnlyPass++
			else bothFail++
		}
		const exact = exactTwoSidedMcnemar(leftOnlyPass, rightOnlyPass)
		return {
			eligiblePairs: pairs.length - unscoredPairs,
			unscoredPairs,
			bothPass,
			bothFail,
			[`${variants.left}OnlyPass`]: leftOnlyPass,
			[`${variants.right}OnlyPass`]: rightOnlyPass,
			discordantPairs: leftOnlyPass + rightOnlyPass,
			exactTwoSidedMcnemar: exact,
		}
	}

	const grounding = summarizeOutcome(
		completePairs,
		(record) => getEvaluation(record)?.grounding?.passed,
	)
	const overall = summarizeOutcome(completePairs, (record) => getOverallPassed(getEvaluation(record)))
	const byCase = Object.fromEntries(
		caseIds.map((caseId) => {
			const casePairs = completePairs.filter((pair) => pair.left.caseId === caseId)
			return [
				caseId,
				{
					matchedPairs: casePairs.length,
					grounding: summarizeOutcome(
						casePairs,
						(record) => getEvaluation(record)?.grounding?.passed,
					),
					overall: summarizeOutcome(
						casePairs,
						(record) => getOverallPassed(getEvaluation(record)),
					),
				},
			]
		}),
	)

	return {
		variants,
		totalPairIds: pairMap.size,
		completeMatchedPairs: completePairs.length,
		incompleteOrInvalidPairs,
		grounding,
		overall,
		byCase,
	}
}

/** Exact two-sided McNemar test: doubled lower binomial tail under p=0.5. */
export function exactTwoSidedMcnemar(leftOnlyPass, rightOnlyPass) {
	const discordant = leftOnlyPass + rightOnlyPass
	if (discordant === 0) {
		return {
			pValue: 1,
			exactFraction: '1/1',
			method: 'exact two-sided binomial McNemar',
		}
	}
	const tail = Math.min(leftOnlyPass, rightOnlyPass)
	let coefficient = 1n
	let cumulative = 1n
	for (let index = 1; index <= tail; index++) {
		coefficient =
			(coefficient * BigInt(discordant - index + 1)) / BigInt(index)
		cumulative += coefficient
	}
	const denominator = 1n << BigInt(discordant)
	let numerator = cumulative * 2n
	if (numerator > denominator) numerator = denominator
	const divisor = greatestCommonDivisor(numerator, denominator)
	const reducedNumerator = numerator / divisor
	const reducedDenominator = denominator / divisor
	return {
		pValue: divideBigInts(numerator, denominator),
		exactFraction: `${reducedNumerator}/${reducedDenominator}`,
		method: 'exact two-sided binomial McNemar',
	}
}

function summarizeBinary(records, getValue) {
	let passed = 0
	let evaluated = 0
	for (const record of records) {
		const value = getValue(record)
		if (typeof value !== 'boolean') continue
		evaluated++
		if (value) passed++
	}
	return {
		passed,
		evaluated,
		failed: evaluated - passed,
		rate: evaluated === 0 ? null : passed / evaluated,
	}
}

function summarizeNumeric(values) {
	if (values.length === 0) {
		return { evaluated: 0, total: null, mean: null, median: null, min: null, max: null }
	}
	const sorted = [...values].sort((left, right) => left - right)
	const total = values.reduce((sum, value) => sum + value, 0)
	const middle = Math.floor(sorted.length / 2)
	const median =
		sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
	return {
		evaluated: values.length,
		total,
		mean: total / values.length,
		median,
		min: sorted[0],
		max: sorted.at(-1),
	}
}

function getEvaluation(record) {
	return (
		record?.exportedState?.evaluation ??
		record?.idleResult?.evaluation ??
		record?.promptResult?.evaluation ??
		null
	)
}

function getOverallPassed(evaluation) {
	if (typeof evaluation?.overallPassed === 'boolean') return evaluation.overallPassed
	if (typeof evaluation?.endToEnd?.passed === 'boolean') return evaluation.endToEnd.passed
	return null
}

function getModelCallCount(record) {
	const trajectories = record?.exportedState?.trajectories
	if (!Array.isArray(trajectories)) return null
	let total = 0
	for (const trajectory of trajectories) {
		const rawCalls = trajectory?.metrics?.modelCallCount
		if (typeof rawCalls !== 'number' || !Number.isFinite(rawCalls)) return null
		const calls = rawCalls
		total += calls
	}
	return total
}

function getLatencyToFirstAction(record) {
	const trajectories = record?.exportedState?.trajectories
	if (!Array.isArray(trajectories)) return null
	let elapsedMs = 0
	for (const trajectory of trajectories) {
		const latency = trajectory?.metrics?.latencyToFirstActionMs
		if (typeof latency === 'number' && Number.isFinite(latency)) return elapsedMs + latency
		const totalLatency = trajectory?.metrics?.totalLatencyMs
		if (typeof totalLatency === 'number' && Number.isFinite(totalLatency)) {
			elapsedMs += totalLatency
		}
	}
	return null
}

function samePairBlock(left, right) {
	return (
		left.pairId === right.pairId &&
		left.caseId === right.caseId &&
		left.modelName === right.modelName &&
		left.repetition === right.repetition &&
		(left.resolvedRotation ?? left.rotation) === (right.resolvedRotation ?? right.rotation)
	)
}

function chooseComparisonVariants(variantIds) {
	if (variantIds.includes('canvasact') && variantIds.includes('original-tldraw')) {
		return { left: 'canvasact', right: 'original-tldraw' }
	}
	if (variantIds.length !== 2) {
		throw new Error(`Paired analysis requires exactly two variants; found ${variantIds.join(', ')}.`)
	}
	return { left: variantIds[0], right: variantIds[1] }
}

function orderVariants(variantIds) {
	return [...variantIds].sort((left, right) => {
		const priority = { canvasact: 0, 'original-tldraw': 1 }
		return (priority[left] ?? 10) - (priority[right] ?? 10) || left.localeCompare(right)
	})
}

function buildMarkdown(analysis) {
	const leftVariant = analysis.paired.variants.left
	const rightVariant = analysis.paired.variants.right
	const lines = [
		`# ${analysis.isPilot ? 'Pilot ' : ''}paired analysis: ${analysis.runId}`,
		'',
		`> **${analysis.sample.label}.** ${analysis.interpretation}`,
		'',
		`Profile: \`${analysis.profile}\`. Models: ${analysis.sample.models.map(code).join(', ')}. Rotations: ${analysis.sample.rotations.map(code).join(', ')}.`,
		'',
		'Geometry is reported only among correctly grounded trials. Consequently, its denominator can differ by variant and it should not be read as an all-trial success rate.',
		'',
		'## Per-variant results',
		'',
		'| Variant | Trials | Grounding | Geometry given grounding | Overall | Collateral | Model calls / trial | Trial latency | First-action latency |',
		'|---|---:|---:|---:|---:|---:|---:|---:|---:|',
	]
	for (const [variant, summary] of Object.entries(analysis.byVariant)) {
		lines.push(summaryRow(variant, summary))
	}

	lines.push(
		'',
		'## Per-case results',
		'',
		'| Case | Variant | Trials | Grounding | Geometry given grounding | Overall | Collateral | Model calls / trial | Trial latency | First-action latency |',
		'|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
	)
	for (const [caseId, caseSummary] of Object.entries(analysis.byCase)) {
		for (const [variant, summary] of Object.entries(caseSummary.variants)) {
			lines.push(`| ${code(caseId)} |${summaryRow(variant, summary).slice(1)}`)
		}
	}

	lines.push(
		'',
		'## Matched-pair analysis',
		'',
		`${analysis.paired.completeMatchedPairs} of ${analysis.paired.totalPairIds} pair IDs were complete and valid; ${analysis.paired.incompleteOrInvalidPairs} were incomplete or invalid.`,
		'',
		`| Outcome | Eligible pairs | Both pass | ${variantLabel(leftVariant)} only | ${variantLabel(rightVariant)} only | Both fail | Discordant | Exact two-sided McNemar p |`,
		'|---|---:|---:|---:|---:|---:|---:|---:|',
		pairedRow('Grounding', analysis.paired.grounding, leftVariant, rightVariant),
		pairedRow('Overall', analysis.paired.overall, leftVariant, rightVariant),
		'',
		'### Pair counts by case',
		'',
		'| Case | Outcome | Pairs | Both pass | CanvasObs only | Original only | Both fail | Exact p |',
		'|---|---|---:|---:|---:|---:|---:|---:|',
	)
	for (const [caseId, caseSummary] of Object.entries(analysis.byCase)) {
		for (const outcome of ['grounding', 'overall']) {
			const pairedSummary = caseSummary.paired[outcome]
			lines.push(
				`| ${code(caseId)} | ${titleCase(outcome)} | ${pairedSummary.eligiblePairs} | ${pairedSummary.bothPass} | ${pairedSummary[`${leftVariant}OnlyPass`]} | ${pairedSummary[`${rightVariant}OnlyPass`]} | ${pairedSummary.bothFail} | ${formatP(pairedSummary.exactTwoSidedMcnemar)} |`,
			)
		}
	}

	lines.push(
		'',
		'## Interpretation',
		'',
		analysis.interpretation,
		'',
		'The exact McNemar tests use only discordant matched pairs. With this pilot sample, large observed rate differences can still yield coarse p-values; the full counterbalanced run is required for inferential claims.',
		'',
	)
	return lines.join('\n')
}

function summaryRow(variant, summary) {
	return `| ${variantLabel(variant)} | ${summary.trials} | ${formatRate(summary.grounding)} | ${formatRate(summary.geometryConditionalOnGrounding)} | ${formatRate(summary.overall)} | ${formatRate(summary.collateral)} | ${formatMean(summary.modelCalls)} | ${formatDuration(summary.trialLatencyMs)} | ${formatDuration(summary.latencyToFirstActionMs)} |`
}

function pairedRow(label, summary, leftVariant, rightVariant) {
	return `| ${label} | ${summary.eligiblePairs} | ${summary.bothPass} | ${summary[`${leftVariant}OnlyPass`]} | ${summary[`${rightVariant}OnlyPass`]} | ${summary.bothFail} | ${summary.discordantPairs} | ${formatP(summary.exactTwoSidedMcnemar)} |`
}

function formatRate(summary) {
	if (summary.evaluated === 0 || summary.rate === null) return '0/0 (n/a)'
	return `${summary.passed}/${summary.evaluated} (${formatPercent(summary.rate)})`
}

function formatMean(summary) {
	return summary.mean === null ? 'n/a' : `${round(summary.mean, 2)} (n=${summary.evaluated})`
}

function formatDuration(summary) {
	return summary.mean === null ? 'n/a' : `${round(summary.mean / 1000, 2)} s (n=${summary.evaluated})`
}

function formatP(exact) {
	return `${round(exact.pValue, 6)} (${exact.exactFraction})`
}

function formatPercent(value) {
	return `${round(value * 100, 1)}%`
}

function round(value, digits) {
	const scale = 10 ** digits
	return Math.round(value * scale) / scale
}

function divideBigInts(numerator, denominator) {
	const scale = 1_000_000_000_000_000n
	return Number((numerator * scale) / denominator) / Number(scale)
}

function greatestCommonDivisor(first, second) {
	let left = first
	let right = second
	while (right !== 0n) {
		const remainder = left % right
		left = right
		right = remainder
	}
	return left
}

function readRunDirectory(args) {
	const flagIndex = args.indexOf('--run-dir')
	if (flagIndex >= 0) {
		const value = args[flagIndex + 1]
		if (!value) throw new Error('--run-dir requires a directory path.')
		return value
	}
	const positional = args.find((argument) => !argument.startsWith('-'))
	if (!positional) throw new Error('Provide a run directory. Use --help for usage.')
	return positional
}

async function readJsonLines(path) {
	const text = await readFile(path, 'utf8')
	const records = []
	for (const [index, line] of text.split(/\r?\n/).entries()) {
		if (!line.trim()) continue
		try {
			records.push(JSON.parse(line))
		} catch (error) {
			throw new Error(`Invalid JSONL at ${path}:${index + 1}: ${formatError(error)}`)
		}
	}
	return records
}

async function readOptionalJson(path) {
	try {
		return JSON.parse(await readFile(path, 'utf8'))
	} catch (error) {
		if (error?.code === 'ENOENT') return null
		throw error
	}
}

async function atomicWrite(path, contents) {
	const temporaryPath = resolve(dirname(path), `.${basename(path)}.${process.pid}.tmp`)
	await writeFile(temporaryPath, contents, { encoding: 'utf8', mode: 0o600 })
	await rename(temporaryPath, path)
}

function unique(values) {
	return [...new Set(values.filter((value) => value !== null && value !== undefined))]
}

function isFiniteNumber(value) {
	return typeof value === 'number' && Number.isFinite(value)
}

function finiteOrNull(value) {
	const number = Number(value)
	return Number.isFinite(number) ? number : null
}

function variantLabel(variant) {
	return VARIANT_LABELS[variant] ?? code(variant)
}

function code(value) {
	return `\`${String(value)}\``
}

function titleCase(value) {
	const text = String(value ?? 'unknown').replace(/[-_]/g, ' ')
	return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatError(error) {
	return error instanceof Error ? error.message : String(error)
}

function runSelfTest() {
	const checks = [
		{ left: 0, right: 0, pValue: 1, fraction: '1/1' },
		{ left: 4, right: 0, pValue: 0.125, fraction: '1/8' },
		{ left: 2, right: 0, pValue: 0.5, fraction: '1/2' },
		{ left: 1, right: 1, pValue: 1, fraction: '1/1' },
	]
	for (const check of checks) {
		const result = exactTwoSidedMcnemar(check.left, check.right)
		if (result.pValue !== check.pValue || result.exactFraction !== check.fraction) {
			throw new Error(
				`McNemar self-test failed for (${check.left}, ${check.right}): ${JSON.stringify(result)}`,
			)
		}
	}
	console.log(`Paired-analysis self-test passed (${checks.length} exact McNemar cases).`)
}
