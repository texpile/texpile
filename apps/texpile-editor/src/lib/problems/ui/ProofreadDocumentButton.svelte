<script lang="ts">
	import { Sparkles } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import { tip } from '$lib/components/tooltip.svelte';
	import { proofreadOn } from '$lib/editor/spellcheck/review/reviewStore';
	import { reviewsAsked, reviewsAskedTotal, stopAskedReviews } from '$lib/editor/spellcheck/review/reviewQueue';
	import { documentProofreadOffered, proofreadDocument } from '../aiProofread/proofreadDocument';

	const left = $derived(reviewsAsked.current);
	const total = $derived(reviewsAskedTotal.current);
</script>

{#if proofreadOn() && documentProofreadOffered()}
	{#if left > 0}
		<span class="cap-center text-muted">{m.problems_proofreading_progress({ done: total - left, total })}</span>
		<button class="btn btn-sm preset-tonal h-6 px-2" onclick={stopAskedReviews}>
			<span class="cap-center">{m.problems_proofread_stop()}</span>
		</button>
	{:else}
		<button
			class="btn-icon btn-icon-sm hover:preset-tonal"
			onclick={() => void proofreadDocument()}
			use:tip={m.problems_proofread_document()}
			aria-label={m.problems_proofread_document()}
		>
			<Sparkles class="size-4" />
		</button>
	{/if}
{/if}
