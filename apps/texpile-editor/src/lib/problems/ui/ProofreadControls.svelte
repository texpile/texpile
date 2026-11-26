<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { tip } from '$lib/components/tooltip.svelte';
	import { openPreferencesAt } from '$lib/stores/dialogStore';
	import { proofreadOn } from '$lib/editor/spellcheck/review/reviewStore';
	import { reviewsAsked, reviewsAskedError, reviewsAskedTotal, stopAskedReviews } from '$lib/editor/spellcheck/review/reviewQueue';
	import { fileProofreadOffered, projectProofreadOffered } from '../aiProofread/proofreadDocument';
	import ProofreadMenu from './ProofreadMenu.svelte';

	const left = $derived(reviewsAsked.current);
	const total = $derived(reviewsAskedTotal.current);
	const error = $derived(reviewsAskedError.current);
</script>

{#if proofreadOn() && (fileProofreadOffered() || projectProofreadOffered())}
	{#if left > 0}
		<span class="cap-center text-muted">{m.problems_proofreading_progress({ done: total - left, total })}</span>
		<button class="btn btn-sm preset-tonal h-6 px-2" onclick={stopAskedReviews}>
			<span class="cap-center">{m.problems_proofread_stop()}</span>
		</button>
	{:else}
		{#if error}
			<span class="cap-center text-warning-ink max-w-[36rem] truncate" use:tip={error}>{error}</span>
			<button class="btn btn-sm preset-tonal h-6 px-2" onclick={() => openPreferencesAt('ai')}>
				<span class="cap-center">{m.problems_proofread_open_preferences()}</span>
			</button>
		{/if}
		<ProofreadMenu />
	{/if}
{/if}
