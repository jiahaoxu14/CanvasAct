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
