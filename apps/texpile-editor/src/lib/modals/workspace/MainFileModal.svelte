<script lang="ts">
	// First-compile prompt: pick which .tex is the project's main entry file.
	import Modal from '../Modal.svelte';
	import ModalActions from '../ModalActions.svelte';
	import { samePath, type TexFile } from '$lib/workspace/fileSystem';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		candidates: TexFile[];
		tooMany: boolean;
		choice: string | null;
		detected: string | null;
		docRoots: Set<string>;
		onConfirm: () => void;
		onDismiss: () => void;
	};
	let { candidates, tooMany, choice = $bindable(), detected, docRoots, onConfirm, onDismiss }: Props = $props();
</script>

<Modal title={m.wsview_mainconfirm_title()} onClose={onDismiss} card="max-h-full max-w-lg overflow-y-auto p-5">
	{#if tooMany}
		<p class="text-muted text-sm">{m.wsview_mainconfirm_too_many()}</p>
	{:else}
		<p class="text-muted mb-3 text-sm">
			{m.wsview_mainconfirm_desc()}
		</p>
		<div class="border-surface-300-700 mb-4 max-h-64 overflow-y-auto rounded-container border">
			{#each candidates as f (f.path)}
				<label
					class="hover:preset-tonal-surface flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm {choice && samePath(choice, f.path)
						? 'preset-tonal-primary'
						: ''}"
				>
					<input
						type="radio"
						class="radio"
						name="main-file-choice"
						value={f.path}
						checked={!!choice && samePath(choice, f.path)}
						onchange={() => (choice = f.path)}
					/>
					<span class="truncate">{f.relPath}</span>
					{#if detected && samePath(f.path, detected)}
						<span class="badge preset-tonal-primary ml-auto shrink-0 text-[10px]">{m.wsview_badge_detected()}</span>
					{:else if docRoots.has(f.path)}
						<span class="badge preset-tonal-surface ml-auto shrink-0 text-[10px]">{m.wsview_badge_document()}</span>
					{/if}
				</label>
			{/each}
		</div>
		<ModalActions size="xs" buttons={[{ label: m.wsview_use_this_file(), role: 'primary', disabled: !choice, onclick: onConfirm }]} />
	{/if}
</Modal>
