<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { reviewsAsked, reviewsAskedTotal } from '$lib/editor/spellcheck/review/reviewQueue';

	const left = $derived(reviewsAsked.current);
	const total = $derived(reviewsAskedTotal.current);
</script>

<div class="h-0.5 shrink-0">
	{#if left > 0 && total > 0}
		<div
			class="bg-primary-500 h-full transition-[width]"
			style:width="{((total - left) / total) * 100}%"
			role="progressbar"
			aria-label={m.problems_proofread_with_ai()}
			aria-valuemin={0}
			aria-valuemax={total}
			aria-valuenow={total - left}
		></div>
	{/if}
</div>
