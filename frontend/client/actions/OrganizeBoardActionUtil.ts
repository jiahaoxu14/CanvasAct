import { createShapeId, getArrowBindings, TLArrowShape, TLShapeId } from 'tldraw'
import { OrganizeBoardAction } from '../../shared/schema/AgentActionSchemas'
import { SimpleShapeId } from '../../shared/types/ids-schema'
import { Streaming } from '../../shared/types/Streaming'
import {
	CANVASACT_WORKSPACE_ROLES,
	getCanvasActWorkspaceRole,
} from '../../shared/workspaceSemantics'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { repairDashboardLayout } from './resolveSemanticActions'
import { scheduleTargetResolutionFailure } from './resolveTargets'

export const OrganizeBoardActionUtil = registerActionUtil(
	class OrganizeBoardActionUtil extends AgentActionUtil<OrganizeBoardAction> {
		static override type = 'organizeBoard' as const

		override getInfo(action: Streaming<OrganizeBoardAction>) {
			return { icon: 'cursor' as const, description: action.intent ?? '' }
		}

		override sanitizeAction(action: Streaming<OrganizeBoardAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const structuredContainerIds = new Set(
				this.editor
					.getCurrentPageShapesSorted()
					.filter(
						(shape) =>
							shape.type !== 'arrow' &&
							shape.isLocked &&
							getCanvasActWorkspaceRole(shape.meta) ===
								CANVASACT_WORKSPACE_ROLES.groupContainer
					)
					.map((shape) => fromTldrawShapeId(shape.id))
			)
			const structuredItemIds = new Set(
				this.editor
					.getCurrentPageShapesSorted()
					.filter(
						(shape) =>
							shape.type !== 'arrow' &&
							!shape.isLocked &&
							getCanvasActWorkspaceRole(shape.meta) === CANVASACT_WORKSPACE_ROLES.groupItem
					)
					.map((shape) => fromTldrawShapeId(shape.id))
			)
			const hasStructuredWorkspace =
				structuredContainerIds.size >= 2 && structuredItemIds.size >= 4
			const movableIds = new Set<SimpleShapeId>()
			const usedContainerIds = new Set<SimpleShapeId>()
			for (const group of action.groups) {
				const [containerShapeId] = helpers.ensureShapeIdsExist([group.containerShapeId])
				const shapeIds = helpers.ensureShapeIdsExist(group.shapeIds)
				const container = containerShapeId
					? this.editor.getShape(createShapeId(containerShapeId))
					: undefined
				if (
					!containerShapeId ||
					!container ||
					!container.isLocked ||
					container.type === 'arrow' ||
					shapeIds.length !== group.shapeIds.length
				) {
					return this.reject(
						'Every board group must reference one existing fixed container and existing movable objects.'
					)
				}
				if (usedContainerIds.has(containerShapeId)) {
					return this.reject('Each fixed board container must occur in exactly one group.')
				}
				if (hasStructuredWorkspace && !structuredContainerIds.has(containerShapeId)) {
					return this.reject('Use only the fixed group containers identified by the workspace.')
				}
				if (shapeIds.includes(containerShapeId)) {
					return this.reject('A fixed board container cannot also be a movable group object.')
				}
				usedContainerIds.add(containerShapeId)

				const containerGroup = getWorkspaceGroup(container.meta)
				const expectedLayout = getWorkspaceLayout(container.meta)
				if (expectedLayout && group.layout !== expectedLayout) {
					return this.reject(
						`Container "${containerShapeId}" requires a ${expectedLayout} reading layout.`
					)
				}
				for (const id of shapeIds) {
					const shape = this.editor.getShape(createShapeId(id))
					if (!shape || shape.type === 'arrow' || shape.isLocked || movableIds.has(id)) {
						return this.reject(
							'Movable board objects must be existing, unlocked, non-arrow shapes that occur in exactly one group.'
						)
					}
					if (hasStructuredWorkspace && !structuredItemIds.has(id)) {
						return this.reject('Use only the movable artifacts identified by the workspace.')
					}
					const itemGroup = getWorkspaceGroup(shape.meta)
					if (containerGroup && itemGroup && containerGroup !== itemGroup) {
						return this.reject(
							`Artifact "${id}" belongs in the ${itemGroup} container, not ${containerGroup}.`
						)
					}
					movableIds.add(id)
				}

				const itemOrders = shapeIds.map((id) =>
					getWorkspaceOrder(this.editor.getShape(createShapeId(id))?.meta)
				)
				if (
					itemOrders.every((order): order is number => order !== null) &&
					itemOrders.some((order, index) => index > 0 && order <= itemOrders[index - 1]!)
				) {
					return this.reject(
						`Artifacts in container "${containerShapeId}" must follow their semantic reading order.`
					)
				}

				group.containerShapeId = containerShapeId
				group.shapeIds = shapeIds
				group.gap = clamp(group.gap ?? 14, 8, 48)
				group.padding = clamp(group.padding ?? 18, 12, 48)
				group.headerHeight = clamp(group.headerHeight ?? 58, 52, 100)
			}

			if (
				hasStructuredWorkspace &&
				(!setsEqual(movableIds, structuredItemIds) ||
					!setsEqual(usedContainerIds, structuredContainerIds))
			) {
				return this.reject(
					'The organization plan must use every fixed group container and include every movable research artifact exactly once.'
				)
			}

			const itemPositions = new Map<SimpleShapeId, { containerId: SimpleShapeId; index: number }>()
			for (const group of action.groups) {
				group.shapeIds.forEach((id, index) => {
					itemPositions.set(id, { containerId: group.containerShapeId, index })
				})
			}
			for (const shape of this.editor.getCurrentPageShapesSorted()) {
				if (shape.type !== 'arrow') continue
				const bindings = getArrowBindings(this.editor, shape)
				if (!bindings.start || !bindings.end) continue
				const sourceId = fromTldrawShapeId(bindings.start.toId)
				const targetId = fromTldrawShapeId(bindings.end.toId)
				const sourcePosition = itemPositions.get(sourceId)
				const targetPosition = itemPositions.get(targetId)
				if (!sourcePosition || !targetPosition) continue
				if (
					sourcePosition.containerId !== targetPosition.containerId ||
					sourcePosition.index >= targetPosition.index
				) {
					return this.reject(
						'Every bound research chain must remain in one group and follow arrow direction.'
					)
				}
			}

			// Text fit is a local invariant for every movable artifact, not an optional model choice.
			action.textShapeIds = Array.from(movableIds).filter((id) => {
				const shape = this.editor.getShape(createShapeId(id))
				if (!shape) return false
				try {
					return Boolean(this.editor.getShapeUtil(shape).getText(shape)?.trim())
				} catch {
					return false
				}
			})
			const requestedArrowIds = helpers.ensureShapeIdsExist(action.preservedArrowIds ?? [])
			const incidentArrowIds = this.editor
				.getCurrentPageShapesSorted()
				.filter((shape): shape is TLArrowShape => shape.type === 'arrow')
				.filter((shape) => {
					const bindings = getArrowBindings(this.editor, shape)
					if (!bindings.start || !bindings.end) return false
					return (
						movableIds.has(fromTldrawShapeId(bindings.start.toId)) ||
						movableIds.has(fromTldrawShapeId(bindings.end.toId))
					)
				})
				.map((shape) => fromTldrawShapeId(shape.id))
			action.preservedArrowIds = Array.from(new Set([...requestedArrowIds, ...incidentArrowIds]))
			const expectedConnections: NonNullable<OrganizeBoardAction['expectedConnections']> = []
			for (const arrowId of action.preservedArrowIds) {
				const shape = this.editor.getShape(createShapeId(arrowId))
				if (!shape || shape.type !== 'arrow') {
					return this.reject(`Preserved relationship "${arrowId}" is not an existing arrow.`)
				}
				const bindings = getArrowBindings(this.editor, shape as TLArrowShape)
				if (!bindings.start || !bindings.end) {
					return this.reject(`Preserved relationship "${arrowId}" is not bound at both ends.`)
				}
				expectedConnections.push({
					arrowId,
					sourceId: fromTldrawShapeId(bindings.start.toId),
					targetId: fromTldrawShapeId(bindings.end.toId),
				})
			}
			action.expectedConnections = expectedConnections

			return action
		}

		override applyAction(action: Streaming<OrganizeBoardAction>) {
			if (!action.complete) return
			repairDashboardLayout(this.editor, {
				sections: action.groups,
				textShapeIds: action.textShapeIds,
				uniformColumnItems: true,
			})
		}
		reject(message: string) {
			scheduleTargetResolutionFailure(this.agent, 'organizeBoard', message)
			return null
		}
	}
)

function fromTldrawShapeId(shapeId: TLShapeId): SimpleShapeId {
	return shapeId.slice(6) as SimpleShapeId
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value))
}

function getWorkspaceGroup(meta: Record<string, unknown> | undefined) {
	return typeof meta?.canvasActWorkspaceGroup === 'string'
		? meta.canvasActWorkspaceGroup
		: null
}

function getWorkspaceOrder(meta: Record<string, unknown> | undefined) {
	return typeof meta?.canvasActWorkspaceOrder === 'number'
		? meta.canvasActWorkspaceOrder
		: null
}

function getWorkspaceLayout(meta: Record<string, unknown> | undefined) {
	const layout = meta?.canvasActWorkspaceLayout
	return layout === 'row' || layout === 'column' ? layout : null
}

function setsEqual<T>(a: Set<T>, b: Set<T>) {
	return a.size === b.size && Array.from(a).every((value) => b.has(value))
}
