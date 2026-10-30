<script lang="ts">
	// keeps the paper's picture up to date with what the figure tab drew
	import { drawingToSvg } from '$lib/draw/editor/drawing/drawingSvg';
	import { getFigureEditor } from '$lib/draw/editor/figureEditor';
	import { pictureKey, saveDrawing } from './drawingCache';

	const { editor } = getFigureEditor();

	$effect(() => {
		const drawing = editor.render.drawing;
		const source = editor.render.drawnSource;
		const at = editor.language.listPictures(source)[editor.render.drawnIndex];
		if (!drawing || !at) return;
		saveDrawing(pictureKey(source.slice(at.from, at.to)), drawingToSvg(drawing, editor.render.fonts, editor.render.outline));
	});
</script>
