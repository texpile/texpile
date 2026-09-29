<script lang="ts">
	// Test fixture: gives DiffPanel reactive props so a test can change one the way the workspace
	// does. mount() hands the exports back, so the test drives it through these setters.
	import DiffPanel from '../../../../src/views/workspace/diff/DiffPanel.svelte';

	type Props = { readOnly?: boolean; onModifiedInput?: (v: string) => void };
	let { readOnly = false, onModifiedInput }: Props = $props();

	let original = $state('one\ntwo\n');
	let modified = $state('one\ntwo\n');
	let layout = $state<'unified' | 'split'>('unified');

	export function setOriginal(v: string) {
		original = v;
	}
	export function setModified(v: string) {
		modified = v;
	}
	export function setLayout(v: 'unified' | 'split') {
		layout = v;
	}
</script>

<DiffPanel filename="/ws/main.tex" {original} {modified} {layout} {readOnly} {onModifiedInput} />
