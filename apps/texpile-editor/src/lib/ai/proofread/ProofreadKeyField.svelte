<script lang="ts">
	// the API key a service is sent with: typed here, kept by main, never shown again
	import { m } from '$lib/paraglide/messages';
	import ProofreadField from './ProofreadField.svelte';
	import { proofreadBridge, type KeyProvider, type KeysKept } from './proofreadBridge';

	type Props = { provider: KeyProvider; note?: string };
	const props: Props = $props();

	let kept = $state<KeysKept | null>(null);
	let typed = $state('');
	void proofreadBridge()
		?.keys()
		.then((k) => (kept = k));

	const saved = $derived(!!kept?.[props.provider]);

	async function save(key: string): Promise<void> {
		kept = (await proofreadBridge()?.setKey(props.provider, key)) ?? kept;
		typed = '';
	}
</script>

<ProofreadField
	label={m.prefs_proofread_key()}
	note={kept && !kept.lasting ? m.prefs_proofread_key_session() : props.note}
	value={typed}
	placeholder={saved ? m.prefs_proofread_key_saved() : ''}
	secret
	oninput={(v) => (typed = v)}
>
	{#snippet action()}
		{#if saved && !typed}
			<button class="btn btn-sm preset-tonal shrink-0 px-3" onclick={() => void save('')}>{m.prefs_proofread_key_remove()}</button>
		{:else}
			<button class="btn btn-sm preset-filled-primary-500 shrink-0 px-3" disabled={!typed} onclick={() => void save(typed)}>
				{m.prefs_proofread_key_save()}
			</button>
		{/if}
	{/snippet}
</ProofreadField>
