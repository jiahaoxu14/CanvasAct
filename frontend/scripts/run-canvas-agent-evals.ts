import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInitialCanvasAgentEvals } from '../shared/evals/runInitialCanvasAgentEvals'

const run = runInitialCanvasAgentEvals()
const { result, artifacts } = run
const outputPath = join(process.cwd(), '.tsbuild', 'evals', 'canvas-agent-initial.json')
const output = {
	configName: 'p3_chunk_loop',
	gitCommit: getGitCommit(),
	generatedAt: new Date().toISOString(),
	...run,
}

mkdirSync(join(process.cwd(), '.tsbuild', 'evals'), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)

console.log('Canvas agent initial evals')
console.log(
	JSON.stringify(
		{
			summary: result.summary,
			artifacts,
			outputPath,
			results: result.results,
		},
		null,
		2
	)
)

process.exit(result.summary.failedCount === 0 ? 0 : 1)

function getGitCommit() {
	try {
		return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
			cwd: process.cwd(),
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim()
	} catch {
		return 'unknown'
	}
}
