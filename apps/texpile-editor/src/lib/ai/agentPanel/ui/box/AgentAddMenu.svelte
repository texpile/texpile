<script lang="ts">
	// The + at the start of the box's row: what can go with a message besides its text. Images from the computer, for an
	// agent that takes them, and the open file again after its pill was taken off
	import { FileText, ImageUp, Plus } from '@lucide/svelte';
	import { showContextMenu } from '$lib/menus/contextMenu.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { m } from '$lib/paraglide/messages';
	import { IMAGE_TYPES } from '../../attach/pastedImages';

	type Props = {
		agent: string;
		takesImages: boolean;
		/** the open file is there to go with the message and its pill was taken off */
		canAttachFile: boolean;
		onImages: (files: FileList | null) => void;
		onAttachFile: () => void;
	};
	const props: Props = $props();
	let picker = $state<HTMLInputElement>();

	// emptied once read, so picking the same image again still counts as a choice
	function pick(): void {
		if (!picker) return;
		props.onImages(picker.files);
		picker.value = '';
	}

	function open(button: HTMLElement): void {
		const at = button.getBoundingClientRect();
		void showContextMenu(
			[
				{
					label: m.agent_panel_upload(),
					icon: ImageUp,
					onclick: () => picker?.click(),
					disabled: !props.takesImages,
					tip: props.takesImages ? undefined : m.agent_panel_no_images({ agent: props.agent })
				},
				{ label: m.agent_panel_attach_file(), icon: FileText, onclick: props.onAttachFile, disabled: !props.canAttachFile }
			],
			{ x: at.left, y: at.top - 4 },
			{ above: true }
		);
	}
</script>

<button
	class="text-muted hover:bg-surface-200-800 rounded-base flex size-6 shrink-0 items-center justify-center transition-colors"
	aria-label={m.agent_panel_add()}
	use:tip={m.agent_panel_add()}
	onclick={(e) => open(e.currentTarget)}
>
	<Plus class="size-4" />
</button>
<input bind:this={picker} type="file" accept={IMAGE_TYPES.join(',')} multiple hidden onchange={pick} />
