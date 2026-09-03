<script lang="ts">
	// Confirm before the formatter rewrites the open file in place: latexindent for .tex,
	// tinymist's built-in typstyle for .typ.
	import { TriangleAlert } from '@lucide/svelte';
	import Modal from '../Modal.svelte';
	import ModalActions from '../ModalActions.svelte';
	import { m } from '$lib/paraglide/messages';

	let {
		open = $bindable(),
		formatting,
		tool,
		onFormat
	}: {
		open: boolean;
		formatting: boolean;
		/** which formatter will run; names the tool and picks the caveat text */
		tool: 'latexindent' | 'typstyle';
		onFormat: () => void;
	} = $props();
</script>

<Modal bind:open title={m.wsview_format_modal_title()} icon={TriangleAlert} iconClass="text-warning-500">
	<p class="text-muted mb-4 text-sm">
		{#if tool === 'typstyle'}
			{m.wsview_format_desc_typst_pre()}
			<code class="bg-surface-200-800 rounded-base px-1">typstyle</code>{m.wsview_format_desc_typst_post()}
		{:else}
			{m.wsview_format_desc_pre()} <code class="bg-surface-200-800 rounded-base px-1">latexindent</code>{m.wsview_format_desc_post()}
		{/if}
	</p>
	<ModalActions
		size="xs"
		buttons={[
			{ label: m.wsview_cancel_label(), role: 'cancel', onclick: () => (open = false) },
			{ label: m.wsview_format_button(), role: 'primary', busy: formatting, onclick: onFormat }
		]}
	/>
</Modal>
