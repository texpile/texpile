<script lang="ts">
	// a template the user saved, in the starter picker: pick it, or rename or delete it from its menu
	import { FolderGit2, LayoutTemplate, MoreHorizontal } from '@lucide/svelte';
	import { showContextMenu } from '$lib/menus/contextMenu.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import StarterCard from '../StarterCard.svelte';
	import { userTemplateMenu } from './userTemplateMenu';
	import { remoteLabel } from './remoteTemplate';
	import type { UserTemplate } from '../templateBridge.types';
	import { m } from '$lib/paraglide/messages';

	let { template, disabled = false, onPick }: { template: UserTemplate; disabled?: boolean; onPick: () => void } = $props();

	function openMenu(e: MouseEvent): void {
		e.preventDefault();
		e.stopPropagation();
		void showContextMenu(userTemplateMenu(template), { x: e.clientX, y: e.clientY });
	}
</script>

<StarterCard
	icon={template.remote ? FolderGit2 : LayoutTemplate}
	title={template.name}
	description={template.description ||
		(template.remote ? m.starter_template_remote({ address: remoteLabel(template.remote) }) : m.starter_template_no_description())}
	{disabled}
	onclick={onPick}
	oncontextmenu={disabled ? undefined : openMenu}
>
	<button
		class="btn-icon btn-icon-sm hover:preset-tonal absolute top-1.5 right-1.5"
		aria-label={m.starter_template_menu()}
		use:tip={m.starter_template_menu()}
		{disabled}
		onclick={openMenu}
	>
		<MoreHorizontal class="size-4" />
	</button>
</StarterCard>
