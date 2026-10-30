<script lang="ts">
	import LayoutMenu from '../../../chrome/LayoutMenu.svelte';
	import { getFigureEditor } from '../../figureEditorContext.svelte';

	const { editor } = getFigureEditor();
</script>

<LayoutMenu {editor} />
