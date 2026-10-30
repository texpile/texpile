import { drawingToSvg } from '../drawing/drawingSvg';
import type { FigureEditorState } from '../state/editorState.svelte';

// a saved svg stands alone, so its images go in as data
async function embedded(editor: FigureEditorState, paths: string[]) {
	const urls = new Map<string, string>();
	const url = editor.render.imageUrl;
	if (!url) return urls;
	for (const path of new Set(paths)) {
		const blob = await (await fetch(url(path))).blob();
		urls.set(
			path,
			await new Promise<string>((done) => {
				const reader = new FileReader();
				reader.onload = () => done(String(reader.result));
				reader.readAsDataURL(blob);
			})
		);
	}
	return urls;
}

/** the drawing on the canvas as an svg file, as the engine drew it */
export async function saveSvg(editor: FigureEditorState) {
	const drawing = editor.render.drawing;
	if (!drawing) return;
	const images = await embedded(
		editor,
		drawing.parts.flatMap((p) => (p.kind === 'image' ? [p.path] : []))
	);
	const svg = drawingToSvg(drawing, editor.render.fonts, editor.render.outline, images.size ? (path) => images.get(path) ?? '' : undefined);
	const a = document.createElement('a');
	a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
	a.download = `picture-${editor.shownIndex + 1}.svg`;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
