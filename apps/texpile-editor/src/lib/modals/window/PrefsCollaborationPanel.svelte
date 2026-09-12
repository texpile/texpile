<script lang="ts">
	// The Collaboration category: the name and the color the other people in a session see.
	import { tip } from '$lib/components/tooltip.svelte';
	import { userData, updateUserData } from '$lib/storage/userData';
	import { collabHost } from '$lib/collab/hostStore.svelte';
	import { collabGuest } from '$lib/collab/guestStore.svelte';
	import { PRESENCE_COLORS } from '$lib/collab/identity';
	import { isDesktop, nativeBridge } from '$lib/workspace/fileSystem';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { m } from '$lib/paraglide/messages';

	const ROW = 'border-surface-200-800 flex items-start justify-between gap-6 border-b py-4 last:border-b-0';
	const PICKED = 'ring-primary-500 ring-offset-surface-50-950 ring-2 ring-offset-2';
	const HOVER = 'hover:ring-muted hover:ring-offset-surface-50-950 hover:ring-2 hover:ring-offset-2';

	let gitId = $state<{ name: string | null; email: string | null } | null>(null);
	const root = workspaceRoot.current;
	if (isDesktop() && root)
		void nativeBridge()
			?.gitIdentity?.(root)
			.then((r) => (gitId = { name: r.name, email: r.email }))
			.catch(() => undefined);

	const live = $derived(collabHost.active || collabGuest.joined);
	const chosen = $derived(userData.current.collabColor);
	const spectrum = 'linear-gradient(135deg, #e11d48, #d97706, #0891b2, #7c3aed)';

	function write(patch: { collabName?: string; collabColor?: string }) {
		updateUserData(patch);
		collabHost.refreshIdentity();
		collabGuest.refreshIdentity();
	}
</script>

{#snippet label(text: string, hint = '')}
	<div class="min-w-0">
		<div class="text-sm font-medium">{text}</div>
		{#if hint}<p class="text-muted mt-1 text-xs leading-relaxed">{hint}</p>{/if}
	</div>
{/snippet}

{#if live}
	<p class="text-muted pt-3 text-xs">{m.prefs_collab_live_note()}</p>
{/if}

<div class={ROW}>
	{@render label(m.prefs_collab_name(), m.prefs_collab_name_note())}
	<input
		class="input w-48 shrink-0 text-sm"
		maxlength={40}
		value={userData.current.collabName}
		oninput={(e) => write({ collabName: e.currentTarget.value })}
	/>
</div>

<div class={ROW}>
	{@render label(m.prefs_collab_color(), m.prefs_collab_color_note())}
	<div class="grid shrink-0 grid-cols-5 gap-2">
		<button
			type="button"
			class="border-surface-300-700 size-5 rounded-full border {chosen ? HOVER : PICKED}"
			style="background: {spectrum}"
			aria-pressed={!chosen}
			aria-label={m.prefs_collab_color_auto()}
			use:tip={m.prefs_collab_color_auto()}
			onclick={() => write({ collabColor: '' })}
		></button>
		{#each PRESENCE_COLORS as color, i (color)}
			<button
				type="button"
				class="border-surface-300-700 size-5 rounded-full border {chosen === color ? PICKED : HOVER}"
				style="background-color: {color}"
				aria-pressed={chosen === color}
				aria-label={m.prefs_collab_color_option({ index: i + 1 })}
				onclick={() => write({ collabColor: color })}
			></button>
		{/each}
	</div>
</div>

{#if gitId}
	<h3 class="text-muted pt-5 text-xs font-semibold tracking-wide uppercase">{m.prefs_collab_git()}</h3>
	<p class="text-muted pt-1 pb-1 text-xs leading-relaxed">{m.prefs_collab_git_note()}</p>
	<div class="{ROW} pl-4">
		{@render label(m.prefs_collab_git_name())}
		<span class="text-muted max-w-64 shrink-0 truncate text-sm">{gitId.name ?? m.prefs_collab_git_none()}</span>
	</div>
	<div class="{ROW} pl-4">
		{@render label(m.prefs_collab_git_email())}
		<span class="text-muted max-w-64 shrink-0 truncate text-sm" use:tip={gitId.email ?? ''}>{gitId.email ?? m.prefs_collab_git_none()}</span
		>
	</div>
{/if}
