<script lang="ts">
	// What to do about a program a typesetter needs and Texpile could not find: the typesetter's row as Toolchain shows
	// it, the install where Texpile can do it, and the ways to point at one installed elsewhere. Mounted once, at the app
	// root, so it opens wherever the need came up
	import { untrack } from 'svelte';
	import Modal from '$lib/modals/Modal.svelte';
	import ModalActions from '$lib/modals/ModalActions.svelte';
	import TypesetterPanel from './TypesetterPanel.svelte';
	import { toolchainProbe } from '../toolchainProbe.svelte';
	import { distros } from '../distros.svelte';
	import { toolDirs } from '../toolDirs.svelte';
	import { askedProgram, familyOf } from './missingProgram.svelte';
	import { engineRows } from './typesetterStatus.svelte';
	import { openToolchainPrefs } from '$lib/stores/dialogStore';
	import { m } from '$lib/paraglide/messages';

	const program = $derived(askedProgram.current);
	const family = $derived(program ? familyOf(program) : null);
	// a distribution can be there without the one program: BasicTeX, a Linux distribution's own TeX Live packages and
	// MiKTeX can each lack latexindent, latexmk or biber. Then the way out is that distribution's package manager, not
	// another. Only the install Texpile runs counts: one found but not in use would not have been asked
	const distro = $derived(family === 'latex' ? (distros.active('latex') ?? distros.onPath('latex')) : null);
	// so a LaTeX program's dialog opens once the first look at what is installed answers, rather than saying to install a
	// distribution that is there. Each time a program is asked, as one may have been installed since
	const ready = $derived(family === 'typst' || toolchainProbe.checked);
	// installed from the dialog itself, or found on a Check Again
	const found = $derived(!!family && engineRows({ latex: family === 'latex', typst: family === 'typst' }, program ?? undefined).every((e) => e.found));
	$effect(() => {
		if (!program) return;
		untrack(() => {
			void toolDirs.refresh();
			void toolchainProbe.run();
		});
	});

	function close(): void {
		askedProgram.current = null;
	}
</script>

{#if program && family && ready}
	<Modal onClose={close} z="z-1400" card="flex max-h-full w-full max-w-lg flex-col overflow-y-auto p-5">
		<div class="text-base font-semibold">{found ? m.program_found_title({ program }) : m.program_missing_title({ program })}</div>
		<p class="text-muted mt-1.5 mb-4 text-sm leading-relaxed">
			{found
				? m.program_found_note()
				: family === 'typst'
					? m.program_missing_typst()
					: distro
						? m.program_missing_in_distro({ program, distro: distro.name })
						: m.program_missing_latex({ program })}
		</p>
		<TypesetterPanel want={{ latex: family === 'latex', typst: family === 'typst' }} {program} />
		<!-- the way to everything else on the left, the dialog's own buttons on the right -->
		<div class="mt-5 flex items-center gap-3">
			<button
				type="button"
				class="anchor text-xs"
				onclick={() => {
					close();
					openToolchainPrefs();
				}}
			>
				{m.typesetter_more_in_prefs()}
			</button>
			<ModalActions
				class="ml-auto"
				size="xs"
				buttons={[
					{ label: m.prefs_toolchain_recheck(), busy: toolchainProbe.probing, onclick: () => void toolchainProbe.run() },
					{ label: m.modal_close_aria(), role: 'primary', onclick: close }
				]}
			/>
		</div>
	</Modal>
{/if}
