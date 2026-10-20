<script lang="ts">
	import IconTextCursorInput from '@lucide/svelte/icons/text-cursor-input';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		title: string;
		name: string;
		/** why the name cannot be used, null when it can */
		problemOf: (name: string) => string | null;
		onRename: (name: string) => void;
		onCancel: () => void;
	};

	const props: Props = $props();
	let draft = $state<string | null>(null);
	let problem = $state<string | null>(null);
	const value = $derived(draft ?? props.name);

	function submit() {
		problem = props.problemOf(value);
		if (!problem) props.onRename(value);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			props.onCancel();
		} else if (event.key === 'Enter') {
			event.preventDefault();
			submit();
		}
	}

	function handleFocusout(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (!next || !(event.currentTarget as HTMLElement).contains(next)) props.onCancel();
	}
</script>

<div
	class="card border-surface-300-700 bg-surface-50-950 pointer-events-auto w-[240px] space-y-1.5 border p-2 shadow-2xl"
	role="dialog"
	tabindex="-1"
	aria-label={props.title}
	onkeydown={handleKeydown}
	onfocusout={handleFocusout}
>
	<div class="flex items-center gap-2">
		<IconTextCursorInput size={14} class="text-primary-ink" />
		<span class="cap-center text-xs font-semibold opacity-75">{props.title}</span>
	</div>
	<input
		type="text"
		class="input w-full px-2 py-1 font-mono text-xs"
		aria-label={m.typst_rename_prompt()}
		aria-invalid={problem !== null}
		{value}
		oninput={(event) => {
			draft = event.currentTarget.value;
			problem = null;
		}}
	/>
	{#if problem}
		<p class="text-error-ink text-xs [overflow-wrap:anywhere]" role="alert">{problem}</p>
	{/if}
	<div class="flex justify-end">
		<button type="button" class="btn btn-xs preset-filled-primary-500 text-xs" onclick={submit}>{m.typst_rename_submit()}</button>
	</div>
</div>
