<!-- The one key cap in the app. Renders a shortcut with the right symbols per OS: Mod+Shift+M
     becomes ⌘⇧M on mac, Ctrl+Shift+M on win/linux.

     NOT monospace, which is the whole reason this is a component. ⌘ ⌥ ⇧ are wide glyphs; a mono
     face has to force them into the same advance width as a letter, and some mono faces do not
     carry them at all and fall back mid-string to whatever does. In the UI font they are the same
     glyphs the OS draws in its own menus. Three places used to hand-roll a mono <kbd> instead of
     using this, and the ⌘ in the title bar looked mangled. -->
<script lang="ts">
	import { isMac } from '$lib/platform';

	type Props = {
		/** shortcut string using "Mod" for Cmd/Ctrl, e.g. "Mod+Shift+M". */
		keys?: string;
		/** already-formatted text, for composites the parser cannot express ("F12 / ⌘ Click"). */
		raw?: string;
		/**
		 * Draw it as a bordered key cap. Off by default: as a trailing hint in a menu row a shortcut
		 * is dim text, the way every desktop menu draws it, and capping those would shout. On for
		 * the places that ARE about the keys themselves - the shortcut sheet, the command field.
		 */
		cap?: boolean;
		class?: string;
	};

	let { keys, raw, cap = false, class: className = '' }: Props = $props();

	const macSymbols: Record<string, string> = {
		mod: '⌘',
		ctrl: '⌃',
		alt: '⌥',
		shift: '⇧',
		enter: '↵',
		return: '↵',
		backspace: '⌫',
		delete: '⌦',
		escape: '⎋',
		esc: '⎋',
		tab: '⇥',
		space: '␣',
		up: '↑',
		down: '↓',
		left: '←',
		right: '→'
	};

	const winLabels: Record<string, string> = {
		mod: 'Ctrl',
		ctrl: 'Ctrl',
		alt: 'Alt',
		shift: 'Shift',
		enter: 'Enter',
		return: 'Enter',
		backspace: 'Backspace',
		delete: 'Del',
		escape: 'Esc',
		esc: 'Esc',
		tab: 'Tab',
		space: 'Space',
		up: '↑',
		down: '↓',
		left: '←',
		right: '→'
	};

	function formatShortcut(shortcut: string): string[] {
		return shortcut.split('+').map((part) => {
			const p = part.trim().toLowerCase();
			return (isMac ? macSymbols : winLabels)[p] ?? part.trim().toUpperCase();
		});
	}

	const parts = $derived(raw != null ? null : formatShortcut(keys ?? ''));
	// mac stacks its symbols with no separator, the way the system does; win/linux joins with +
	const gap = $derived(isMac ? 'gap-0' : 'gap-0.5');
	const look = $derived(cap ? 'border-surface-300-700 bg-surface-100-900 rounded-base border px-1.5 py-0.5' : 'text-surface-500');
</script>

<kbd class="inline-flex items-center font-sans text-xs whitespace-nowrap {gap} {look} {className}">
	{#if parts === null}
		{raw}
	{:else}
		{#each parts as key, i (i)}
			<span>{key}</span>{#if !isMac && i < parts.length - 1}<span class="mx-px opacity-60">+</span>{/if}
		{/each}
	{/if}
</kbd>
