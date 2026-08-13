export const CANVASACT_WORKSPACE_ROLE_KEY = 'canvasActWorkspaceRole'

export const CANVASACT_WORKSPACE_ROLES = {
	groupContainer: 'group-container',
	groupItem: 'group-item',
	semanticLink: 'semantic-link',
} as const

export type CanvasActWorkspaceRole =
	(typeof CANVASACT_WORKSPACE_ROLES)[keyof typeof CANVASACT_WORKSPACE_ROLES]

export function getCanvasActWorkspaceRole(
	meta: Record<string, unknown>
): CanvasActWorkspaceRole | null {
	const role = meta[CANVASACT_WORKSPACE_ROLE_KEY]
	return Object.values(CANVASACT_WORKSPACE_ROLES).includes(role as CanvasActWorkspaceRole)
		? (role as CanvasActWorkspaceRole)
		: null
}
