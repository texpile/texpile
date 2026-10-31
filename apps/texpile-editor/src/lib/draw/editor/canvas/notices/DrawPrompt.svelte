<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import CanvasPrompt from './CanvasPrompt.svelte';
	import type { FigureEditorState } from '../../state/editorState.svelte';
	import type { CanvasGesture } from '../../state/gesture/canvasGesture.svelte';
	import { drawModeEntry, familyOf } from '../../state/drawModes/drawModes';
	import { inSentence } from '../../figure/inSentence';

	type Props = { editor: FigureEditorState; gesture: CanvasGesture };
	const props: Props = $props();

	// what the next click places, as CAD's prompt line says it
	const prompt = $derived.by(() => {
		const family = familyOf(props.editor.tool);
		if (!family) return null;
		const entry = drawModeEntry(props.editor.drawModes[family], family);
		const p = props.gesture.preview;
		const placed = p && p.tool === props.editor.tool ? p.points.length - 1 : 0;
		const step = inSentence(entry.steps[Math.min(placed, entry.steps.length - 1)]());
		const typed = placed && props.gesture.typed.fields.length;
		return typed ? m.figure_prompt_typed({ mode: entry.label(), step }) : m.figure_prompt({ mode: entry.label(), step });
	});
</script>

{#if prompt}
	<CanvasPrompt text={prompt} />
{/if}
