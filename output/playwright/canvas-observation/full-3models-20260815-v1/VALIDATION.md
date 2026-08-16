# Pre-launch validation

All ten semantic rotations were prepared and exported successfully before the
first paid trial. Expected target mappings were:

- viewport coverage: `canonical -> n7q4`, `r1 -> k2m9`, `r2 -> r8v3`;
- object state: `canonical -> m4q8`, `r1 -> v7p2`, `r2 -> c9r5`;
- workspace structure: `canonical -> b6k4+t4v8`, `r1 -> u2c7+r9m1`;
- explicit relations: `canonical -> q4w8`, `r1 -> l7n3`.

Camera, zoom, and candidate page bounds remained unchanged. Provider-free
1090-by-1000 canvas screenshots were perceptually matched within each probe.
Relative to each probe's canonical rotation, changed-pixel fractions were:

- viewport coverage: 0%;
- object state: at most 0.035%;
- workspace structure: at most 0.044%;
- explicit relations: at most 0.009%.

The small differences come from antialiasing at occluded SVG edges, text edges
after frame reparenting, and a subpixel arrow endpoint after rebinding. Thus the
rotations are not claimed to be byte-for-byte pixel identical. Every matched
CanvasObs--Original pair nevertheless receives the same initial store, camera,
viewport, and rendered screenshot. Any residual visual cue is available to
both variants and can only weaken the intended observation contrast.

Pre-launch checks passed: 103 experiment-scorer assertions, 11 observation-case
tests, seven lifecycle regressions, and the agent-variant parity check. The
GPT-5.4-mini two-trial systems preflight completed with real trajectories and
no authentication, transport, or browser error.
