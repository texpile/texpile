<script lang="ts">
	// A changed file as Source Control lists it: its icon, its name in the color of the change, and its
	// folder. The agent panel lists the files a turn changed through this too, so the two read the same
	import FileIcon from '$lib/filetree/FileIcon.svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { STATUS_COLOR, STATUS_DECOR, STATUS_TITLE } from '$lib/filetree/treeBadges';
	import type { GitBadge } from '$lib/workspace/scm/git';

	type Props = {
		name: string;
		dir: string;
		badge: GitBadge;
		/** a note follows the name, and the name keeps its room */
		keepName?: boolean;
	};
	const props: Props = $props();
</script>

<FileIcon name={props.name} class="size-4 shrink-0" />
<span
	class="truncate {STATUS_COLOR[props.badge]} {STATUS_DECOR[props.badge] ?? ''} {props.keepName ? 'max-w-[60%] shrink-0' : ''}"
	use:tip={STATUS_TITLE[props.badge]}>{props.name}</span
>
{#if props.dir}<span class="text-muted truncate text-xs">{props.dir}</span>{/if}
