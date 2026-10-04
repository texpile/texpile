<script lang="ts">
	// Two saved copies of one file, read-only (twoVersions.svelte.ts): the older on the left, or
	// above in the inline layout, the same way the changes in a version are shown.
	import { onMount } from 'svelte';
	import { Columns2, Rows2, FileDiff, LoaderCircle } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import Modal from '$lib/modals/Modal.svelte';
	import { closeTwoVersions, type TwoVersions } from '$lib/workspace/twoVersions.svelte';
	import { layout as savedLayout } from '$lib/storage/layout';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { pathLabels } from '$lib/workspace/scm/ui/changes/pathLabels';
	import DiffPanel from './diff/DiffPanel.svelte';
	import { m } from '$lib/paraglide/messages';

	let { versions }: { versions: TwoVersions } = $props();

	let before = $state('');
	let after = $state('');
	let reading = $state(true);
	let binary = $state(false);
	let diffLayout = $state<'unified' | 'split'>(savedLayout.current.diffLayout === 'split' ? 'split' : 'unified');
	// the subtitle names the file, and cuts off in a narrow window: its tip gives the whole path
	const where = $derived(workspaceRoot.current ? pathLabels(workspaceRoot.current).relPath(versions.path) : versions.path);

	onMount(async () => {
		const [a, b] = await Promise.all([versions.before(), versions.after()]);
		before = a ?? '';
		after = b ?? '';
		// an image or a PDF: a line diff of its bytes says nothing
		binary = before.includes('\0') || after.includes('\0');
		reading = false;
	});
</script>

<Modal title={versions.title} icon={FileDiff} card="flex h-[85vh] w-[min(1100px,94vw)] max-w-none flex-col p-4" onClose={closeTwoVersions}>
	<div class="-mt-2 mb-3 flex items-center gap-2">
		<p class="text-muted min-w-0 truncate text-xs" use:tip={`${versions.subtitle}\n${where}`}>{versions.subtitle}</p>
		<button
			class="btn-icon btn-icon-xs hover:preset-tonal ml-auto"
			onclick={() => (diffLayout = diffLayout === 'split' ? 'unified' : 'split')}
			use:tip={diffLayout === 'unified' ? m.wsview_switch_to_side_by_side() : m.wsview_switch_to_inline()}
			aria-label={diffLayout === 'unified' ? m.wsview_side_by_side_label() : m.wsview_inline_label()}
		>
			{#if diffLayout === 'split'}<Rows2 class="size-3.5" />{:else}<Columns2 class="size-3.5" />{/if}
		</button>
	</div>
	<div class="border-surface-200-800 rounded-base min-h-0 flex-1 overflow-hidden border">
		{#if reading}
			<!-- nothing for the first 300ms, the app's threshold for announcing a wait -->
			<p class="text-muted reveal-late flex items-center gap-2 p-3 text-sm">
				<LoaderCircle class="size-4 shrink-0 animate-spin" />
				{m.vcs_loading_changes()}
			</p>
		{:else if binary}
			<p class="text-muted p-3 text-sm">{m.vcs_version_changes_binary()}</p>
		{:else}
			<DiffPanel filename={versions.path} original={before} modified={after} layout={diffLayout} readOnly />
		{/if}
	</div>
</Modal>
