<script lang="ts">
	import Modal from '../Modal.svelte';
	import ModalActions from '../ModalActions.svelte';
	import { updateSettings } from '$lib/settings';
	import demoVideo from '$lib/assets/live-preview-demo.mp4';
	import type { ChangelogEntry } from '$lib/whatsNew';
	import { m } from '$lib/paraglide/messages';

	// oldest first; the last one is what the user is now on
	let { open = $bindable(false), entries, onClose }: { open: boolean; entries: ChangelogEntry[]; onClose?: () => void } = $props();

	// a demo clip belongs to the release that introduced the feature, so it only plays for someone
	// who hasn't seen that release yet
	const VIDEOS: Record<string, string> = { '0.13.0': demoVideo };

	const newest = $derived(entries[entries.length - 1]);
	const video = $derived(entries.map((e) => VIDEOS[e.version]).find(Boolean));

	// every way out marks the notes as seen, so they stop reappearing on the next launch
	function markSeen() {
		if (newest) updateSettings({ whatsNewSeen: newest.version });
		onClose?.();
	}

	function close() {
		open = false;
		markSeen();
	}
</script>

{#if newest}
	<Modal bind:open onClose={markSeen} title={m.whatsnew_title({ version: newest.version })} card="flex max-h-full max-w-2xl flex-col p-5">
		<div class="mb-4 min-h-0 overflow-y-auto">
			{#if video}
				<video src={video} class="border-surface-300-700 mb-4 w-full rounded-base border" autoplay loop muted playsinline></video>
			{/if}
			<div class="space-y-3">
				{#each entries as entry (entry.version)}
					<div>
						{#if entries.length > 1}
							<div class="text-surface-500 mb-1 text-xs font-semibold">v{entry.version}</div>
						{/if}
						<ul class="text-surface-600-300 list-disc space-y-1 pl-5 text-sm">
							{#each entry.notes as note (note)}
								<li>{note}</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		</div>
		<ModalActions size="xs" buttons={[{ label: m.whatsnew_got_it(), role: 'primary', onclick: close }]} />
	</Modal>
{/if}
