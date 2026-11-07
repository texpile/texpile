<script lang="ts">
	import { onMount } from 'svelte';
	import type { Node } from 'prosemirror-model';
	import { keysForEnv } from '$lib/languages/latex/knowledge/keyCompletions';
	import { m } from '$lib/paraglide/messages';
	import { frameOptionParts, frameOptionsText, keyName, type FrameOptionParts } from './frameOptions';

	const props: { node: Node; updateAttrs: (attrs: Record<string, unknown>) => void } = $props();

	const options = $derived(String(props.node.attrs.options ?? ''));
	const parts = $derived(frameOptionParts(options));

	let known = $state<string[]>([]);
	onMount(async () => {
		const found = await keysForEnv('frame', ['[]'], []);
		known = (found?.keys ?? []).filter((k) => k.bare).map((k) => k.key);
	});

	function write(next: FrameOptionParts) {
		props.updateAttrs({ options: frameOptionsText(next) });
	}

	function toggle(key: string) {
		if (!parts) return;
		const has = parts.keys.some((k) => keyName(k) === key);
		write({ ...parts, keys: has ? parts.keys.filter((k) => keyName(k) !== key) : [...parts.keys, key] });
	}
</script>

<div class="frame-settings">
	{#if parts}
		<label class="frame-settings-row">
			<span class="frame-settings-label">{m.slide_overlays()}</span>
			<input
				class="input frame-settings-input"
				value={parts.overlay}
				placeholder="<2->"
				spellcheck="false"
				onchange={(e) => write({ ...parts, overlay: (e.currentTarget as HTMLInputElement).value.trim() })}
			/>
		</label>
		<label class="frame-settings-row">
			<span class="frame-settings-label">{m.slide_options()}</span>
			<input
				class="input frame-settings-input"
				value={parts.keys.join(',')}
				placeholder="fragile,t"
				spellcheck="false"
				onchange={(e) =>
					write({
						...parts,
						keys: (e.currentTarget as HTMLInputElement).value
							.split(',')
							.map((k) => k.trim())
							.filter(Boolean)
					})}
			/>
		</label>
		{#if known.length > 0}
			<div class="frame-settings-keys">
				{#each known as key (key)}
					<button
						type="button"
						class="chip frame-settings-key {parts.keys.some((k) => keyName(k) === key) ? 'preset-filled-primary-500' : 'preset-tonal'}"
						onclick={() => toggle(key)}>{key}</button
					>
				{/each}
			</div>
		{/if}
	{:else}
		<label class="frame-settings-row">
			<span class="frame-settings-label">{m.slide_options()}</span>
			<input
				class="input frame-settings-input"
				value={options}
				spellcheck="false"
				onchange={(e) => props.updateAttrs({ options: (e.currentTarget as HTMLInputElement).value })}
			/>
		</label>
	{/if}
</div>

<style>
	.frame-settings {
		display: flex;
		flex-direction: column;
		gap: calc(var(--spacing) * 3);
		padding: calc(var(--spacing) * 3);
		width: 18rem;
	}
	.frame-settings-row {
		display: flex;
		flex-direction: column;
		gap: calc(var(--spacing) * 1);
	}
	.frame-settings-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--muted-text);
	}
	.frame-settings-input {
		padding: calc(var(--spacing) * 1) calc(var(--spacing) * 2);
		font-size: 0.8rem;
		font-family: var(--font-mono, monospace);
	}
	.frame-settings-keys {
		display: flex;
		flex-wrap: wrap;
		gap: calc(var(--spacing) * 1);
	}
	.frame-settings-key {
		font-family: var(--font-mono, monospace);
		font-size: 0.7rem;
	}
</style>
