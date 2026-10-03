// Run from the repository root: node tmp/analysis/canvasobs-payload-sizes/measure.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { CanvasObservationPartDefinition } from './frozen-parts.mjs';
import { buildRulesPromptSection } from './frozen-rules.mjs';

const run = 'output/playwright/canvas-observation/full-3models-20260815-v1';
const output = 'reports/canvasobs_payload_sizes';
const bytes = (text) => Buffer.byteLength(text, 'utf8');
const normalize = (text) => text.replace(/\n{3,}/g, '\n\n');
// Shared active-mode flags are enabled; only the observation flag changes.
// The two observation-dependent branches are independent of other edit flags.
const flags = (enabled) => new Proxy({}, {
  get: (_, key) => key === 'hasCanvasObservationPart' ? enabled : true,
});
const systemGuidanceDelta = bytes(normalize(buildRulesPromptSection(flags(true))))
  - bytes(normalize(buildRulesPromptSection(flags(false))));
const schedule = JSON.parse(readFileSync(`${run}/schedule.json`, 'utf8'));
const scheduled = new Map(schedule.trials.map((row) => [row.trialId, row]));
const seen = new Set();
const rows = [];
const sourceHash = createHash('sha256');
const stream = createReadStream(`${run}/results.jsonl`);
stream.on('data', (chunk) => sourceHash.update(chunk));
let preambleBytes;

for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
  const trial = JSON.parse(line);
  assert(!seen.has(trial.trialId), `Duplicate trial: ${trial.trialId}`);
  seen.add(trial.trialId);
  const expected = scheduled.get(trial.trialId);
  assert(expected, `Unscheduled trial: ${trial.trialId}`);
  for (const key of ['modelName', 'variant', 'caseId', 'rotation']) {
    assert.equal(trial[key], expected[key], `${trial.trialId}: ${key}`);
  }
  if (trial.variant !== 'canvasact') continue;
  const trajectories = trial.exportedState?.trajectories;
  assert(trajectories?.length, `Missing CanvasObs trajectory: ${trial.trialId}`);
  for (const [index, trajectory] of trajectories.entries()) {
    const observation = trajectory.initialObservation;
    assert(observation, 'Missing initial observation');
    const content = CanvasObservationPartDefinition.buildContent({
      type: 'canvasObservation', observation,
    });
    assert.equal(content.length, 2);
    const [preamble, serialized] = content;
    preambleBytes ??= bytes(preamble);
    assert.equal(bytes(preamble), preambleBytes);
    const payload = JSON.parse(serialized);
    assert(!('spatialIndex' in payload), 'Diagnostic-only field reached payload');
    assert(!('taskAffordances' in payload), 'Diagnostic-only field reached payload');
    assert.equal(payload.objects.length, observation.objects.length);
    assert.equal(payload.relations.length, observation.relations.length);
    const jsonBytes = bytes(serialized);
    rows.push({
      trial_id: trial.trialId, model: trial.modelName, case: trial.caseId,
      rotation: trial.resolvedRotation, trial_status: trial.status,
      request_index: index + 1, request_source: trajectory.request.source,
      objects: payload.objects.length, relations: payload.relations.length,
      json_bytes: jsonBytes,
      objects_array_bytes: bytes(JSON.stringify(payload.objects)),
      relations_array_bytes: bytes(JSON.stringify(payload.relations)),
      observation_text_bytes: jsonBytes + preambleBytes,
      incremental_text_bytes: jsonBytes + preambleBytes + systemGuidanceDelta,
      payload_sha256: createHash('sha256').update(serialized).digest('hex'),
    });
  }
}
assert.equal(seen.size, scheduled.size);
assert.equal(seen.size, 1200);
const initial = rows.filter((row) => row.request_index === 1);
assert.equal(initial.length, 600);
assert.equal(new Set(initial.map((row) => row.trial_id)).size, 600);

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return { n, mean: values.reduce((a, b) => a + b, 0) / n,
    median: (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2,
    min: sorted[0], max: sorted[n - 1] };
}
function summarize(selected) {
  return Object.fromEntries([
    'json_bytes', 'objects_array_bytes', 'relations_array_bytes',
    'observation_text_bytes', 'incremental_text_bytes', 'objects', 'relations',
  ].map((key) => [key, stats(selected.map((row) => row[key]))]));
}
function grouped(selected, key) {
  return Object.fromEntries([...new Set(selected.map((row) => row[key]))].sort()
    .map((value) => [value, summarize(selected.filter((row) => row[key] === value))]));
}
const summary = {
  run, measurement: 'UTF-8 bytes of compact JSON.stringify model-facing CanvasObs payload',
  method: 'Reconstructed from each saved trajectory initialObservation using the frozen buildContent implementation. Main statistics use the first request in each of 600 CanvasObs trials, including the one network-error trial. Follow-up requests are summarized separately.',
  exclusions: 'Shared baseline context, screenshots, task prompt, action schema, conversation history, generated outputs, provider message wrappers, transport encoding, and caching. These are byte sizes, not token usage or billed cost.',
  units: { bytes: 'UTF-8 bytes', kB: '1000 bytes', KiB: '1024 bytes' },
  provenance: { results_sha256: sourceHash.digest('hex'),
    application_sources_sha256: JSON.parse(readFileSync('tmp/analysis/canvasobs-payload-sizes/source-checksums.json', 'utf8')) },
  guidance: { observation_preamble_bytes: preambleBytes,
    system_prompt_net_additional_bytes: systemGuidanceDelta,
    total_net_additional_guidance_bytes: preambleBytes + systemGuidanceDelta,
    note: 'Sum of text-content bytes; no message-envelope or transport bytes. System guidance is the normalized rules-section byte difference when only hasCanvasObservationPart changes; shared intro/schema are unchanged.' },
  initial_requests: summarize(initial), initial_by_case: grouped(initial, 'case'),
  initial_by_model: grouped(initial, 'model'), initial_by_rotation: grouped(initial, 'rotation'),
  all_requests: summarize(rows), followup_requests: summarize(rows.filter((row) => row.request_index > 1)),
};
mkdirSync(output, { recursive: true });
writeFileSync(`${output}/summary.json`, JSON.stringify(summary, null, 2) + '\n');
const keys = Object.keys(rows[0]);
const csv = (v) => JSON.stringify(String(v));
writeFileSync(`${output}/measurements.csv`, keys.join(',') + '\n'
  + rows.map((row) => keys.map((key) => csv(row[key])).join(',')).join('\n') + '\n');
console.log(JSON.stringify({ guidance: summary.guidance, initial: summary.initial_requests,
  by_case: Object.fromEntries(Object.entries(summary.initial_by_case).map(([k,v]) => [k, v.json_bytes])),
  all_requests: summary.all_requests.json_bytes, followups: summary.followup_requests.json_bytes }, null, 2));
