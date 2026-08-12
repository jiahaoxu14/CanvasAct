import { Box, Editor, getArrowBindings, TLArrowShape, TLShapeId } from 'tldraw'
import {
	ActionContract,
	ActionPostcondition,
	ActionVerificationFailure,
	ActionVerificationResult,
} from '../../shared/types/ActionContract'
import type { SimpleShapeId } from '../../shared/types/ids-schema'
import type { AgentRequest } from '../../shared/types/AgentRequest'

export function verifyActionResult(
	editor: Editor,
	contract: ActionContract,
	request: AgentRequest | null
): ActionVerificationResult {
	const failures: ActionVerificationFailure[] = []

	for (const postcondition of contract.postconditions) {
		switch (postcondition.type) {
			case 'created-shapes-exist':
				failures.push(...verifyCreatedShapesExist(editor, postcondition))
				break
			case 'no-overlap':
				failures.push(...verifyNoOverlap(editor, postcondition))
				break
			case 'text-fits':
				failures.push(...verifyTextFits(editor, postcondition))
				break
			case 'arrow-bindings':
				failures.push(...verifyArrowBindings(editor, postcondition))
				break
			case 'labels-inside-containers':
				failures.push(...verifyLabelsInsideContainers(editor, postcondition))
				break
			case 'objects-inside-containers':
				failures.push(...verifyObjectsInsideContainers(editor, postcondition))
				break
			case 'ordered-layout':
				failures.push(...verifyOrderedLayout(editor, postcondition))
				break
			case 'connection-sequence':
				failures.push(...verifyConnectionSequence(editor, postcondition))
				break
			case 'no-duplicate-arrows':
				failures.push(...verifyNoDuplicateArrows(editor, postcondition))
				break
			case 'objects-visible':
				failures.push(...verifyObjectsVisible(editor, postcondition, request))
				break
		}
	}

	return {
		ok: failures.length === 0,
		failures,
	}
}

function verifyCreatedShapesExist(
	editor: Editor,
	postcondition: Extract<ActionPostcondition, { type: 'created-shapes-exist' }>
): ActionVerificationFailure[] {
	return postcondition.shapeIds
		.filter((id) => !editor.getShape(toTlShapeId(id)))
		.map((id) => failure(postcondition, `Expected created shape "${id}" to exist.`, [id]))
}

function verifyNoOverlap(
	editor: Editor,
	postcondition: Extract<ActionPostcondition, { type: 'no-overlap' }>
): ActionVerificationFailure[] {
	const failures: ActionVerificationFailure[] = []
	const allowedOverlap = postcondition.allowedOverlap ?? 4
	const items = postcondition.shapeIds
		.map((id) => ({ id, bounds: editor.getShapePageBounds(toTlShapeId(id)) }))
		.filter((item): item is { id: SimpleShapeId; bounds: Box } => item.bounds !== undefined)

	for (let i = 0; i < items.length; i++) {
		for (let j = i + 1; j < items.length; j++) {
			const overlapArea = getOverlapArea(items[i].bounds, items[j].bounds)
			if (overlapArea > allowedOverlap) {
				failures.push(
					failure(
						postcondition,
						`Shapes "${items[i].id}" and "${items[j].id}" overlap by ${Math.round(overlapArea)} px.`,
						[items[i].id, items[j].id]
					)
				)
			}
		}
	}
	return failures
}

function verifyTextFits(
	editor: Editor,
	postcondition: Extract<ActionPostcondition, { type: 'text-fits' }>
): ActionVerificationFailure[] {
	const failures: ActionVerificationFailure[] = []
	for (const id of postcondition.shapeIds) {
		const shape = editor.getShape(toTlShapeId(id))
		if (!shape) continue
		const props = shape.props as Record<string, unknown>
		if (typeof props.growY === 'number' && props.growY > 5) {
			failures.push(failure(postcondition, `Shape "${id}" still has overflowing text.`, [id]))
		}
	}
	return failures
}

function verifyArrowBindings(
	editor: Editor,
	postcondition: Extract<ActionPostcondition, { type: 'arrow-bindings' }>
): ActionVerificationFailure[] {
	const failures: ActionVerificationFailure[] = []
	for (const id of postcondition.shapeIds) {
		const shape = editor.getShape(toTlShapeId(id))
		if (!shape || shape.type !== 'arrow') continue
		const bindings = getArrowBindings(editor, shape as TLArrowShape)
		if (!bindings.start || !bindings.end) {
			failures.push(
				failure(postcondition, `Arrow "${id}" is missing a start or end binding.`, [id])
			)
		}
	}
	return failures
}

function verifyLabelsInsideContainers(
	editor: Editor,
	postcondition: Extract<ActionPostcondition, { type: 'labels-inside-containers' }>
): ActionVerificationFailure[] {
	const failures: ActionVerificationFailure[] = []
	for (const pair of postcondition.pairs) {
		const labelBounds = editor.getShapePageBounds(toTlShapeId(pair.labelId))
		const containerBounds = editor.getShapePageBounds(toTlShapeId(pair.containerId))
		if (!labelBounds || !containerBounds) continue
		if (!containerBounds.includes(labelBounds)) {
			failures.push(
				failure(
					postcondition,
					`Label "${pair.labelId}" is not inside container "${pair.containerId}".`,
					[pair.labelId, pair.containerId]
				)
			)
		}
	}
	return failures
}

function verifyObjectsInsideContainers(
	editor: Editor,
	postcondition: Extract<ActionPostcondition, { type: 'objects-inside-containers' }>
): ActionVerificationFailure[] {
	const failures: ActionVerificationFailure[] = []
	for (const pair of postcondition.pairs) {
		const objectBounds = editor.getShapePageBounds(toTlShapeId(pair.objectId))
		const containerBounds = editor.getShapePageBounds(toTlShapeId(pair.containerId))
		if (!objectBounds || !containerBounds) continue
		const padding = Math.max(0, pair.padding ?? 0)
		const isInside =
			objectBounds.minX >= containerBounds.minX + padding &&
			objectBounds.minY >= containerBounds.minY + padding &&
			objectBounds.maxX <= containerBounds.maxX - padding &&
			objectBounds.maxY <= containerBounds.maxY - padding
		if (!isInside) {
			failures.push(
				failure(
					postcondition,
					`Object "${pair.objectId}" is not inside container "${pair.containerId}" with ${padding}px padding.`,
					[pair.objectId, pair.containerId]
				)
			)
		}
	}
	return failures
}

function verifyOrderedLayout(
	editor: Editor,
	postcondition: Extract<ActionPostcondition, { type: 'ordered-layout' }>
): ActionVerificationFailure[] {
	const items = postcondition.shapeIds
		.map((id) => ({ id, bounds: editor.getShapePageBounds(toTlShapeId(id)) }))
		.filter((item): item is { id: SimpleShapeId; bounds: Box } => item.bounds !== undefined)
	if (items.length !== postcondition.shapeIds.length) {
		return [
			failure(
				postcondition,
				'One or more shapes in the ordered layout no longer exist.',
				postcondition.shapeIds
			),
		]
	}

	const tolerance = Math.max(0, postcondition.tolerance ?? 2)
	for (let index = 0; index < items.length - 1; index++) {
		const current = items[index]
		const next = items[index + 1]
		const actualGap =
			postcondition.direction === 'horizontal'
				? next.bounds.minX - current.bounds.maxX
				: next.bounds.minY - current.bounds.maxY
		const crossAxisError =
			postcondition.direction === 'horizontal'
				? Math.abs(next.bounds.midY - current.bounds.midY)
				: Math.abs(next.bounds.midX - current.bounds.midX)
		const gapError =
			postcondition.gap === undefined ? 0 : Math.abs(actualGap - postcondition.gap)
		if (actualGap < -tolerance || crossAxisError > tolerance || gapError > tolerance) {
			return [
				failure(
					postcondition,
					`Shapes "${current.id}" and "${next.id}" do not satisfy the requested ${postcondition.direction} order and spacing.`,
					[current.id, next.id]
				),
			]
		}
	}
	return []
}

function verifyConnectionSequence(
	editor: Editor,
	postcondition: Extract<ActionPostcondition, { type: 'connection-sequence' }>
): ActionVerificationFailure[] {
	const stepSet = new Set(postcondition.shapeIds)
	const expectedKeys = new Set(
		postcondition.shapeIds.slice(0, -1).map((sourceId, index) => {
			const targetId = postcondition.shapeIds[index + 1]
			return `${sourceId}->${targetId}`
		})
	)
	const arrowsByKey = new Map<string, SimpleShapeId[]>()

	for (const shape of editor.getCurrentPageShapesSorted()) {
		if (shape.type !== 'arrow') continue
		const bindings = getArrowBindings(editor, shape as TLArrowShape)
		if (!bindings.start || !bindings.end) continue
		const sourceId = fromTlShapeId(bindings.start.toId)
		const targetId = fromTlShapeId(bindings.end.toId)
		if (!stepSet.has(sourceId) || !stepSet.has(targetId)) continue
		const key = `${sourceId}->${targetId}`
		const arrowIds = arrowsByKey.get(key) ?? []
		arrowIds.push(fromTlShapeId(shape.id))
		arrowsByKey.set(key, arrowIds)
	}

	const failures: ActionVerificationFailure[] = []
	for (const key of expectedKeys) {
		const [sourceId, targetId] = key.split('->') as [SimpleShapeId, SimpleShapeId]
		const arrowIds = arrowsByKey.get(key) ?? []
		if (arrowIds.length !== 1) {
			failures.push(
				failure(
					postcondition,
					`Expected exactly one bound arrow from "${sourceId}" to "${targetId}", found ${arrowIds.length}.`,
					[sourceId, targetId, ...arrowIds]
				)
			)
		}
	}
	for (const [key, arrowIds] of arrowsByKey) {
		if (expectedKeys.has(key)) continue
		const [sourceId, targetId] = key.split('->') as [SimpleShapeId, SimpleShapeId]
		failures.push(
			failure(
				postcondition,
				`Unexpected flow arrow connects "${sourceId}" to "${targetId}".`,
				[sourceId, targetId, ...arrowIds]
			)
		)
	}
	return failures
}

function verifyNoDuplicateArrows(
	editor: Editor,
	postcondition: Extract<ActionPostcondition, { type: 'no-duplicate-arrows' }>
): ActionVerificationFailure[] {
	const seen = new Map<string, SimpleShapeId>()
	const failures: ActionVerificationFailure[] = []

	for (const shape of editor.getCurrentPageShapesSorted()) {
		if (shape.type !== 'arrow') continue
		const bindings = getArrowBindings(editor, shape as TLArrowShape)
		if (!bindings.start || !bindings.end) continue
		const fromId = fromTlShapeId(bindings.start.toId)
		const toId = fromTlShapeId(bindings.end.toId)
		const key = `${fromId}->${toId}`
		const arrowId = fromTlShapeId(shape.id)
		const existing = seen.get(key)
		if (existing) {
			failures.push(
				failure(
					postcondition,
					`Duplicate arrows "${existing}" and "${arrowId}" connect ${fromId} to ${toId}.`,
					[existing, arrowId, fromId, toId]
				)
			)
		} else {
			seen.set(key, arrowId)
		}
	}
	return failures
}

function verifyObjectsVisible(
	editor: Editor,
	postcondition: Extract<ActionPostcondition, { type: 'objects-visible' }>,
	request: AgentRequest | null
): ActionVerificationFailure[] {
	if (!request) return []
	const viewport = Box.From(request.bounds)
	return postcondition.shapeIds
		.filter((id) => {
			const bounds = editor.getShapeMaskedPageBounds(toTlShapeId(id))
			return bounds ? !Box.Collides(viewport, bounds) : false
		})
		.map((id) => failure(postcondition, `Shape "${id}" is not visible in the active viewport.`, [id]))
}

function failure(
	postcondition: ActionPostcondition,
	message: string,
	shapeIds: SimpleShapeId[]
): ActionVerificationFailure {
	return { postcondition, message, shapeIds }
}

function toTlShapeId(id: SimpleShapeId): TLShapeId {
	return `shape:${id}` as TLShapeId
}

function fromTlShapeId(id: TLShapeId): SimpleShapeId {
	return id.slice(6) as SimpleShapeId
}

function getOverlapArea(a: Box, b: Box) {
	const x1 = Math.max(a.x, b.x)
	const y1 = Math.max(a.y, b.y)
	const x2 = Math.min(a.x + a.w, b.x + b.w)
	const y2 = Math.min(a.y + a.h, b.y + b.h)
	if (x2 <= x1 || y2 <= y1) return 0
	return (x2 - x1) * (y2 - y1)
}
