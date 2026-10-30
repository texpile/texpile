<script lang="ts">
	import FigureMenuBar from '../../../chrome/menubar/FigureMenuBar.svelte';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	const { editor } = getFigureEditor();
</script>

<FigureMenuBar {editor} />
