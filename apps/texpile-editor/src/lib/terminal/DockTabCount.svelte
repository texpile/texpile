<script lang="ts">
	// the count beside a dock tab's name, the same size as Source Control's badge on its sidebar icon
	type Props = { count: number; tone: 'primary' | 'error' | 'warning' };
	const props: Props = $props();

	const TONE = {
		primary: 'bg-primary-500 text-primary-contrast-500',
		error: 'bg-error-500 text-error-contrast-500',
		warning: 'bg-warning-500 text-warning-contrast-500'
	};
</script>

<span class="{TONE[props.tone]} min-w-3.5 self-center rounded-full px-0.5 text-center text-[9px] leading-3.5 font-semibold tabular-nums"
	>{props.count > 99 ? '99+' : props.count}</span
>
