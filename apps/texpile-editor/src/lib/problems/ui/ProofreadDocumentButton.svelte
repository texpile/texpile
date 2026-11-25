<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { proofreadOn } from '$lib/editor/spellcheck/review/reviewStore';
	import { reviewsAsked } from '$lib/editor/spellcheck/review/reviewQueue';
	import { documentProofreadOffered, proofreadDocument } from '../aiProofread/proofreadDocument';

	const left = $derived(reviewsAsked.current);
</script>

{#if proofreadOn() && documentProofreadOffered()}
	{#if left > 0}
		<span class="cap-center text-muted">
			{left === 1 ? m.problems_proofreading_one({ count: left }) : m.problems_proofreading_other({ count: left })}
		</span>
	{:else}
		<button class="btn btn-sm preset-tonal h-6 px-2" onclick={() => void proofreadDocument()}>
			<span class="cap-center">{m.problems_proofread_document()}</span>
		</button>
	{/if}
{/if}
