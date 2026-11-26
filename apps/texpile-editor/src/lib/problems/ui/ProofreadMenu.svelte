<script lang="ts">
	import { FileText, FolderOpen, Sparkles } from '@lucide/svelte';
	import { Menu, Portal } from '@skeletonlabs/skeleton-svelte';
	import { m } from '$lib/paraglide/messages';
	import { tip } from '$lib/components/tooltip.svelte';
	import { menuContentClass, menuItemClass } from '$lib/menus/menuStyles';
	import { fileProofreadOffered, projectProofreadOffered, proofreadOpenFile, proofreadProject } from '../aiProofread/proofreadDocument';

	function runPicked(value: string) {
		void (value === 'project' ? proofreadProject() : proofreadOpenFile());
	}
</script>

<Menu positioning={{ placement: 'bottom-end' }} onSelect={(d) => runPicked(d.value)}>
	<Menu.Trigger class="btn-icon btn-icon-sm hover:preset-tonal" aria-label={m.problems_proofread_with_ai()}>
		{#snippet element(attributes)}
			<button {...attributes} use:tip={m.problems_proofread_with_ai()}><Sparkles class="size-4" /></button>
		{/snippet}
	</Menu.Trigger>
	<Portal>
		<Menu.Positioner>
			<Menu.Content class={menuContentClass}>
				<Menu.Item value="file" class={menuItemClass} disabled={!fileProofreadOffered()}>
					<FileText class="size-4 shrink-0" />
					<span class="cap-center"><Menu.ItemText>{m.problems_proofread_file()}</Menu.ItemText></span>
				</Menu.Item>
				<!-- disabled rather than hidden with no main file, so it is discoverable -->
				<Menu.Item value="project" class={menuItemClass} disabled={!projectProofreadOffered()}>
					<FolderOpen class="size-4 shrink-0" />
					<span class="cap-center"><Menu.ItemText>{m.problems_proofread_project()}</Menu.ItemText></span>
				</Menu.Item>
			</Menu.Content>
		</Menu.Positioner>
	</Portal>
</Menu>
