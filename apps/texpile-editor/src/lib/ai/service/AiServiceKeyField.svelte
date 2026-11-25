<script lang="ts">
	// the custom service's API key: typed here, kept by main, never shown again
	import { m } from '$lib/paraglide/messages';
	import AiServiceField from './AiServiceField.svelte';
	import { aiServiceBridge, type ServiceKeyKept } from './aiServiceBridge';

	type Props = { note?: string };
	const props: Props = $props();

	let kept = $state<ServiceKeyKept | null>(null);
	let typed = $state('');
	void aiServiceBridge()
		?.serviceKey()
		.then((k) => (kept = k));

	async function save(key: string): Promise<void> {
		kept = (await aiServiceBridge()?.setServiceKey(key)) ?? kept;
		typed = '';
	}
</script>

<AiServiceField
	label={m.prefs_proofread_key()}
	note={kept && !kept.lasting ? m.prefs_proofread_key_session() : props.note}
	value={typed}
	placeholder={kept?.saved ? m.prefs_proofread_key_saved() : ''}
	secret
	oninput={(v) => (typed = v)}
>
	{#snippet action()}
		{#if kept?.saved && !typed}
			<button class="btn btn-sm preset-tonal shrink-0 px-3" onclick={() => void save('')}>{m.prefs_proofread_key_remove()}</button>
		{:else}
			<button class="btn btn-sm preset-filled-primary-500 shrink-0 px-3" disabled={!typed} onclick={() => void save(typed)}>
				{m.prefs_proofread_key_save()}
			</button>
		{/if}
	{/snippet}
</AiServiceField>
