<script lang="ts">
	import { FIELD_LABEL, TEXT_FIELD } from '../../ui/panelStyles';
	// commits on Enter or leaving the field, so a word typed is one undo step, not one per letter; the canvas
	// previews it as it is typed
	type Props = {
		label: string;
		value: string;
		mono?: boolean;
		/** why the text cannot be written yet; it stays in the field until it can */
		check?: (value: string) => string | null;
		/** the text as it is typed, not yet committed; null when the field lets go of it */
		onpreview?: (value: string | null) => void;
		oncommit: (value: string) => void;
	};
	const props: Props = $props();
	const mono = $derived(props.mono ?? false);

	let draft = $state<string | null>(null);
	let problem = $state<string | null>(null);

	function commit(leaving = false) {
		if (draft === null || draft === props.value) {
			if (draft !== null) props.onpreview?.(null);
			draft = null;
			return;
		}
		problem = props.check?.(draft) ?? null;
		if (problem) {
			if (leaving) props.onpreview?.(null);
			return;
		}
		props.oncommit(draft);
		draft = null;
	}

	function giveUp() {
		draft = null;
		problem = null;
		props.onpreview?.(null);
	}
</script>

<label class="block px-3 pt-2.5">
	<span class="{FIELD_LABEL} block">{props.label}</span>
	<input
		class="{TEXT_FIELD} {mono ? 'font-mono' : ''} {problem ? 'border-error-500 text-error-ink' : ''}"
		value={draft ?? props.value}
		aria-invalid={!!problem}
		oninput={(e) => {
			draft = e.currentTarget.value;
			problem = null;
			props.onpreview?.(draft);
		}}
		onblur={() => commit(true)}
		onkeydown={(e) => {
			if (e.key === 'Enter') commit();
			if (e.key === 'Escape') giveUp();
		}}
	/>
	{#if problem}<span class="text-error-ink mt-1 block text-xs" role="alert">{problem}. Esc puts back the old text.</span>{/if}
</label>
