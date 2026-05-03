import {
	Box,
	createShapeId,
	type Editor,
	type TLNoteShape,
	type TLShapeId,
	type TLTextShape,
	toRichText,
} from 'tldraw'

type NoteOptions = {
	id: string
	text: string
	x: number
	y: number
	color?: TLNoteShape['props']['color']
}

type TextOptions = {
	id: string
	text: string
	x: number
	y: number
	w: number
	color?: TLTextShape['props']['color']
	size?: TLTextShape['props']['size']
}

function toTlShapeId(id: string): TLShapeId {
	return createShapeId(id)
}

export function loadShowcaseDemoCanvas(editor: Editor) {
	editor.run(() => {
		editor.deleteShapes(editor.getCurrentPageShapes())

		createTitle(editor)
		createNotes(editor)

		editor.selectNone()
		editor.setCurrentTool('select')
		editor.zoomToBounds(new Box(40, -60, 820, 680), {
			inset: 40,
			animation: { duration: 220 },
		})
	})
}

function createTitle(editor: Editor) {
	createText(editor, {
		id: 'demo-title',
		text: 'Simple Notes Demo',
		x: 130,
		y: -42,
		w: 420,
		color: 'black',
		size: 'm',
	})
	createText(editor, {
		id: 'demo-subtitle',
		text: 'A small canvas with several notes, ready for one simple organization task.',
		x: 132,
		y: -8,
		w: 520,
		color: 'grey',
		size: 's',
	})
}

function createNotes(editor: Editor) {
	createNote(editor, {
		id: 'demo-note-agenda',
		text: 'Draft agenda',
		x: 70,
		y: 90,
		color: 'yellow',
	})
	createNote(editor, {
		id: 'demo-note-speakers',
		text: 'Email speakers',
		x: 330,
		y: 90,
		color: 'light-blue',
	})
	createNote(editor, {
		id: 'demo-note-budget',
		text: 'Confirm budget',
		x: 550,
		y: 90,
		color: 'light-red',
	})
	createNote(editor, {
		id: 'demo-note-venue',
		text: 'Book venue',
		x: 70,
		y: 360,
		color: 'light-green',
	})
	createNote(editor, {
		id: 'demo-note-page',
		text: 'Publish page',
		x: 330,
		y: 360,
		color: 'light-violet',
	})
	createNote(editor, {
		id: 'demo-note-badges',
		text: 'Order badges',
		x: 550,
		y: 360,
		color: 'yellow',
	})
}

function createNote(editor: Editor, options: NoteOptions) {
	editor.createShape<TLNoteShape>({
		id: toTlShapeId(options.id),
		type: 'note',
		x: options.x,
		y: options.y,
		props: {
			align: 'middle',
			color: options.color ?? 'yellow',
			font: 'draw',
			fontSizeAdjustment: 0,
			growY: 0,
			labelColor: 'black',
			richText: toRichText(options.text),
			scale: 1,
			size: 's',
			url: '',
			verticalAlign: 'middle',
		},
	})
}

function createText(editor: Editor, options: TextOptions) {
	editor.createShape<TLTextShape>({
		id: toTlShapeId(options.id),
		type: 'text',
		x: options.x,
		y: options.y,
		props: {
			autoSize: false,
			color: options.color ?? 'black',
			font: 'draw',
			richText: toRichText(options.text),
			scale: 1,
			size: options.size ?? 's',
			textAlign: 'start',
			w: options.w,
		},
	})
}
