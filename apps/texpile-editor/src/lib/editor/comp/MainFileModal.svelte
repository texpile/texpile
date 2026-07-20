<script lang="ts">
	// First-compile prompt: pick which .tex is the project's main entry file.
	import { X } from '@lucide/svelte';
	import { samePath, type TexFile } from '$lib/workspace/fileSystem';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		candidates: TexFile[];
		choice: string | null;
		detected: string | null;
		docRoots: Set<string>;
		onConfirm: () => void;
		onDismiss: () => void;
	}
	let { candidates, choice = $bindable(), detected, docRoots, onConfirm, onDismiss }: Props = $props();
</script>

<div
	class="fixed inset-0 z-1300 flex items-center justify-center bg-black/40 p-4"
	role="presentation"
	onmousedown={(e) => e.target === e.currentTarget && onDismiss()}
>
	<div class="card bg-surface-50-950 border-surface-300-700 w-full max-w-lg border p-5 shadow-2xl">
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-base font-semibold">{m.wsview_mainconfirm_title()}</h2>
			<button class="btn-icon btn-icon-sm hover:preset-tonal" onclick={onDismiss} aria-label={m.wsview_close_aria()}>
				<X class="size-4" />
			</button>
		</div>
		<p class="text-surface-600-300 mb-3 text-sm">
			{m.wsview_mainconfirm_desc()}
		</p>
		<div class="border-surface-300-700 mb-4 max-h-64 overflow-y-auto rounded border">
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
		<div class="flex justify-end">
			<button class="btn btn-sm preset-filled-primary-500" onclick={onConfirm} disabled={!choice}>{m.wsview_use_this_file()}</button>
		</div>
	</div>
</div>
