<script lang="ts">
	// The window's own title bar, replacing the OS one. VS Code's layout: app icon, then the menus,
	// then the window title, then the window buttons - all on a single 32px row.
	//
	// Two shapes, because the two platforms disagree about whose job this is:
	//
	//   Windows / Linux - the window is frameless, so this row IS the title bar. It carries the icon,
	//   the in-app menus and our own minimise / maximise / close.
	//
	//   macOS - the window keeps its frame (`hiddenInset`), so the traffic lights are real and the
	//   menus belong in the system menu bar at the top of the screen, not here. This row is then just
	//   a drag strip with the title, indented past the lights.
	//
	// The bar itself is NOT one big drag region: a drag region swallows clicks, and the menu triggers
	// and window buttons live inside it. Only the empty stretch in the middle drags.
	import { onMount, untrack, type Snippet } from 'svelte';
	import { Search, Download } from '@lucide/svelte';
	import { isMac } from '$lib/platform';
	import { isDesktop } from '$lib/workspace/fileSystem';
	import { commandPalette } from '$lib/workspace/commandPalette.svelte';
	import { syncWindowOverlay } from './windowOverlay';
	import Kbd from '$lib/components/Kbd.svelte';
	import { titleBarLayout } from './titleBarLayout.svelte';
	import iconUrl from '$branding/Logo-icon.svg';
	import { m } from '$lib/paraglide/messages';

	let {
		menus,
		status,
		/** hide the icon when the caller already shows branding (the start screen) */
		showIcon = true
	}: {
		/** the in-app menu bar, rendered inline. Omitted on macOS, where the menus are native. */
		menus?: Snippet;
		/** trailing status, before the window buttons. Session presence today. */
		status?: Snippet;
		showIcon?: boolean;
	} = $props();

	const desktop = isDesktop();
	// the browser build still needs the bar: the menus live in it, and a guest edits with them.
	// Only the window furniture below is genuinely the desktop shell's.
	const showBar = desktop || __WEB__;

	// Ctrl+K had no affordance anywhere, which makes a palette useless to anyone who was not told
	// about it. VS Code's answer is the command center: the window title becomes a button that opens
	// quick-open. Same trick here, and only where the palette can actually run - the start screen has
	// no workspace actions registered, so there it stays plain text.
	const palettable = $derived(!!commandPalette.actions);

	/*
	 * Keeping the command center centred ON THE WINDOW, and using that as the trigger for everything
	 * else. Centred is the invariant; compacting the menus is what we DO when it is threatened.
	 *
	 * A window-centred box of width W spans [(win-W)/2, (win+W)/2], so it clears both sides only if
	 * each side is narrower than (win-W)/2. That makes the usable width a function of the WIDER side:
	 *
	 *     available = win - 2 * max(leftWidth, rightWidth) - 2 * GAP
	 *
	 * Measured, not guessed at with pixel breakpoints: the left side is eight localized menu labels
	 * plus the app icon, so its width depends on the UI language, and no constant would survive that.
	 *
	 * Three outcomes, in order:
	 *   available >= MIN                   -> centre it, all menus inline
	 *   only true with fewer menus inline  -> move menus into an overflow button, one at a time, then
	 *                                         centre it. Centred is never traded away for menus.
	 *   still too small                    -> drop the command center entirely
	 */
	const GAP = 12; // clearance between the box and whichever side it is closest to
	const MIN_W = 200; // narrower than this the field is not worth showing
	const MAX_W = 460; // a title is short; past this the field is mostly empty however you align it
	const BADGE_FROM = 320; // below this the Ctrl+K badge is dropped so the title keeps its room

	let winWidth = $state(1280);
	let leftW = $state(0); // app icon + menus, AS CURRENTLY RENDERED
	let rightW = $state(0); // window controls

	/**
	 * The widest the left block may be while a MIN_W box can still sit centred, from rearranging the
	 * inequality above. This is the budget the menu bar spends: it drops menus into an overflow button
	 * until it is under it, one at a time, so the bar degrades as `File Edit View ⋯` rather than
	 * collapsing wholesale.
	 */
	const menuBudget = $derived((winWidth - MIN_W) / 2 - GAP);

	/**
	 * One fit step per MEASUREMENT, which is what makes the degradation progressive.
	 *
	 * fit() both reads and writes visibleMenus, so tracking those reads would make this effect a
	 * dependency of its own output: it would re-run the instant fit() wrote - while leftW still held
	 * the PRE-change width, because clientWidth only updates once the DOM has re-rendered. It would
	 * then step again on that stale number, and again, dropping all eight menus in a single flush and
	 * writing the same stale width into every slot of the cache on the way down. That poisons the
	 * grow-back test permanently, which is why the bar collapsed at once and never came back.
	 *
	 * untrack() cuts the cycle: the effect depends only on the two measurements, so each render
	 * produces exactly one step, and the bar sheds one menu at a time.
	 */
	$effect(() => {
		const w = leftW;
		const b = menuBudget;
		untrack(() => titleBarLayout.fit(w, b));
	});

	// width to actually render at, from the CURRENT left side, so the bar gets the room the overflow
	// just freed. 0 means it does not fit even with every menu hidden, and it is dropped entirely -
	// which is the third outcome, and the only one where the command center is not centred: it is gone.
	const centerW = $derived.by(() => {
		const room = winWidth - 2 * Math.max(leftW, rightW) - 2 * GAP;
		return room >= MIN_W ? Math.min(MAX_W, room) : 0;
	});

	// Mirror the document title rather than take it as a prop: it is already computed (in
	// WorkspaceView's <svelte:head>) and threading the same string down two more components to
	// display it in a third would be plumbing for nothing.
	// the bar itself, reported to Chromium so the overlay it paints the window buttons into matches
	// this row's height and colours. See windowOverlay.ts; a no-op on macOS.
	let barEl = $state<HTMLElement | null>(null);
	$effect(() => (barEl ? syncWindowOverlay(barEl) : undefined));

	let title = $state('Texpile');
	onMount(() => {
		const el = document.querySelector('title');
		if (!el) return;
		title = document.title;
		const obs = new MutationObserver(() => (title = document.title));
		obs.observe(el, { childList: true, characterData: true, subtree: true });
		return () => obs.disconnect();
	});
</script>

<svelte:window bind:innerWidth={winWidth} />

<!-- in the dev server there is no frame and no menus worth showing; the hosted guest build gets
     the bar without the window controls -->
{#if showBar}
	<div bind:this={barEl} class="border-surface-200-800 bg-surface-100-900 relative flex h-8 shrink-0 items-stretch border-b text-sm">
		<!-- measured as one block: everything to the left of the centre. On macOS that is the gap the
		     OS draws the traffic lights into; trafficLightPosition in main.ts matches the inset. -->
		<div class="flex shrink-0 items-stretch" bind:clientWidth={leftW}>
			{#if isMac && desktop}
				<div class="app-drag w-[76px] shrink-0"></div>
			{:else if showIcon}
				<!-- decoration, not a trigger. It briefly carried a Preferences / Share session dropdown so
				     both platforms would agree on where those live; they are back in File, which is where
				     Windows puts them and where the OS has not already claimed the click - the title-bar
				     icon is the system menu (Alt+Space). -->
				<div class="app-drag ml-1 flex size-6 shrink-0 items-center justify-center self-center">
					<img src={iconUrl} alt="" class="app-titlebar-icon size-4" draggable="false" />
				</div>
			{/if}

			<!-- Rendered on macOS too, where it deliberately draws nothing. The menu bar component
			     owns the native bridge: it publishes this window's menu state to main and receives
			     the system menu's selections. Main builds the macOS menu FROM that state, so
			     withholding the snippet here meant it never mounted, never published, and the
			     system bar stayed on its no-state fallback of the app menu plus Edit. -->
			{#if menus}
				{@render menus()}
			{/if}
		</div>

		<!-- the draggable stretch; also where a double-click maximises, as on a native bar -->
		<div class="app-drag min-w-0 flex-1"></div>

		<!-- measured with the window buttons, so the command center clears this side too: a session
		     opening mid-edit shrinks the field rather than sliding under the avatars. -->
		<div class="flex shrink-0 items-stretch" bind:clientWidth={rightW}>
			{#if status}
				{@render status()}
			{/if}
			<!-- where the window buttons sit on desktop, which the browser build leaves free -->
			{#if __WEB__}
				<a
					class="app-no-drag text-surface-600-400 hover:text-surface-950-50 hover:bg-surface-200-800 mr-1 flex items-center gap-1.5 self-center rounded px-2 py-1 text-xs whitespace-nowrap"
					href="https://texpile.com/download"
					target="_blank"
					rel="noopener noreferrer"
					title={m.web_get_desktop_note()}
				>
					<Download class="size-3.5 shrink-0" />
					{m.web_get_desktop()}
				</a>
			{/if}
			<!--
				Off macOS this is EMPTY, and that is the point: Chromium draws minimise / maximise /
				close on top of it (main.ts's titleBarOverlay), so all the page owes it is the right
				amount of room. The width is CSS - a constant on Windows, where the button set is
				fixed, and the WCO environment variables on Linux, where the desktop decides how many
				buttons there are and how wide they run.

				bind:clientWidth above still measures it, so the command center's centring is unchanged:
				it only ever asked how wide the right-hand block was, and reserved space answers that
				as well as three buttons did.
			-->
			{#if !isMac && desktop}
				<div class="app-window-controls"></div>
			{/if}
		</div>

		<!-- Centred on the WINDOW, which is the whole point of positioning it absolutely: in flow it
		     would centre in the leftover space and drift right as the menus grew. It can do that safely
		     here only because centerW is computed to clear both sides - it is 0, and this renders
		     nothing, when even a compacted menu bar leaves no room.
		     The layer stays click-through so the drag region underneath still works. -->
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			{#if palettable && centerW > 0}
				<!--
					h-[22px] in a 32px row, so there is 5px of air above and below rather than the 3px a 26px
					box left - at that height the border sat almost on the bar's own edges and the control
					read as a line across the chrome instead of a field inside it.

					It is a filled field, not an outline: surface-50-950 is lighter than the bar in light
					mode and darker in dark mode, so it reads as recessed either way and the border becomes
					an edge rather than the whole design. hover lifts it a step instead of tinting it.
				-->
				<button
					class="app-no-drag border-surface-300-700 bg-surface-50-950 hover:bg-surface-200-800 text-surface-600-400 pointer-events-auto flex h-[22px] items-center gap-2 rounded-md border px-2.5 text-xs"
					style="width: {centerW}px"
					onclick={() => commandPalette.show()}
					title={m.palette_open()}
				>
					<Search class="size-3.5 shrink-0 opacity-60" />
					<!-- centred, not left-aligned: the field is sized to the window rather than to the
					     filename, so a left-aligned title dumps all the slack on the right and looks
					     lopsided. Centring splits it either side and the control reads as deliberate. -->
					<span class="min-w-0 flex-1 truncate text-center">{title}</span>
					<!-- the badge costs ~45px of a box that may only be 200 wide, and a filename truncated to
					     nothing to make room for a hint about a shortcut is the wrong trade. Below this the
					     shortcut lives in Help and the tooltip; the field itself is still clickable. -->
					{#if centerW >= BADGE_FROM}
						<!--
							No key cap here, unlike the shortcut sheet: a box inside this box never sat right. The
							field leaves a couple of pixels above and below a cap against ten to the right edge,
							tight one way and loose the other, and plain text has no second box to be uneven
							against.
							It still goes through Kbd, for the FONT. This was mono with tracking-tight, and
							forcing a wide glyph into a letter's advance width and then pulling it tighter still
							is what made the command symbol look mangled rather than merely small. Kbd draws it
							in the UI font, the one the OS uses in its own menus.
						-->
						<Kbd keys="Mod+K" class="shrink-0" />
					{/if}
				</button>
			{:else if !palettable}
				<span class="text-surface-600-400 max-w-[50%] truncate text-xs">{title}</span>
			{/if}
		</div>
	</div>
{/if}
