export function getErrorMessage(error: unknown): string {
	let current = error
	for (let depth = 0; depth < 4; depth++) {
		if (typeof current === 'string' && current.trim()) return current
		if (current instanceof Error && current.message) return current.message
		if (!current || typeof current !== 'object') break

		const record = current as Record<string, unknown>
		if (typeof record.message === 'string' && record.message.trim()) return record.message
		if ('error' in record) {
			current = record.error
			continue
		}
		break
	}
	return 'The model request failed without an error message.'
}
