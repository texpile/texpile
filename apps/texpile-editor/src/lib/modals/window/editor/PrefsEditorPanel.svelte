<script lang="ts">
	import { prefsFocus } from '../search/prefsFocus.svelte';
	import PrefsEditorGeneral from './PrefsEditorGeneral.svelte';
	import PrefsEditorLatex from './PrefsEditorLatex.svelte';
	import PrefsEditorTypst from './PrefsEditorTypst.svelte';
</script>

{#if prefsFocus.editorSub === 'general'}
	<PrefsEditorGeneral />
{:else if prefsFocus.editorSub === 'latex'}
	<PrefsEditorLatex />
{:else}
	<PrefsEditorTypst />
{/if}
