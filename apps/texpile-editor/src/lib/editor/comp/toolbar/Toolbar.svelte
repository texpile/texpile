<script lang="ts">
	import { preventDefault } from 'svelte/legacy';

	import { Search, Undo, Redo, Bold, Underline, Italic, Code, BoxSelect, Eye } from '@lucide/svelte';
	import { selectParentNode } from 'prosemirror-commands';
	import ToolbarTable from './ToolbarTable.svelte';
	import TextColorDropdown from './TextColorDropdown.svelte';
	import HighlightDropdown from './HighlightDropdown.svelte';
	import { markIsActive, activeMarkColor } from './markState';
	import { displaySearchBarStore, editorViewStore, rawEditorActiveStore } from '../../../stores/editorStore';
	import { previewStore } from '$lib/stores/previewStore';
	import { schema } from '$lib/schema/schema';
	import { setHeadingLevel } from '../../helperCommands';
	import HeadingDropdown from './HeadingDropdown.svelte';
	import SupSubDropdown from './SupSubDropdown.svelte';
	import { createCodeBlock } from '../../extensions/codemirrorbridge/cmcommands';
	import { toggleMark } from 'prosemirror-commands';
	import MathDropdown from './MathDropdown.svelte';
	import MathToolbar, { mathToolbarState } from './MathToolbar.svelte';
	import { undo, redo } from 'prosemirror-history';
	import { currentlyCompilingStore } from '$lib/stores/pdfStore';
	import { isReadOnly } from '$lib/stores/permissionStore';
	import { onMount } from 'svelte';
	import MobileActionBar from './MobileActionBar.svelte';
	import 'swiper/css';

	interface Props {
		// hides the Preview/Compile buttons
		minimal?: boolean;
	}

	let { minimal = false }: Props = $props();

	let isCompiling = $derived($currentlyCompilingStore);
	let isPreviewVisible = $derived($previewStore.isVisible);

	let isMathfieldActive = $state(false);

	type ActiveCommandsType = { strong?: boolean; em?: boolean; u?: boolean; sup?: boolean; sub?: boolean };
	let activeCommands: ActiveCommandsType = $state({});
	let currentHeadingLevel = $state(0);
	let currentHeadingNumbered = $state(true);

	function updateMathfieldState() {
		setTimeout(() => {
			isMathfieldActive = document.activeElement instanceof window.MathfieldElement;
		}, 0);
	}

	onMount(() => {
		window.addEventListener('focusin', updateMathfieldState);
		// custom event, see the monkey patch in mlview.ts
		window.addEventListener('ml:focusin', updateMathfieldState);
		window.addEventListener('focusout', updateMathfieldState);
		return () => {
			window.removeEventListener('focusin', updateMathfieldState);
			window.removeEventListener('ml:focusin', updateMathfieldState);
			window.removeEventListener('focusout', updateMathfieldState);
		};
	});

	function keepEditorFocus(cmd: (state, dispatch) => boolean) {
		return (e: MouseEvent) => {
			e.preventDefault();
			cmd($editorViewStore.state, $editorViewStore.dispatch);
			$editorViewStore.focus();
		};
	}

	let activeTextColor = $state<string | null>(null);
	let activeHighlightColor = $state<string | null>(null);

	$effect(() => {
		if ($editorViewStore) {
			activeCommands = {
				strong: markIsActive($editorViewStore.state, schema.marks.strong),
				em: markIsActive($editorViewStore.state, schema.marks.em),
				u: markIsActive($editorViewStore.state, schema.marks.u),
				sup: markIsActive($editorViewStore.state, schema.marks.sup),
				sub: markIsActive($editorViewStore.state, schema.marks.sub)
			};

			activeTextColor = activeMarkColor($editorViewStore.state, schema.marks.textcolor);
			activeHighlightColor = activeMarkColor($editorViewStore.state, schema.marks.highlight);

			const node = $editorViewStore.state.selection.$from.node($editorViewStore.state.selection.$from.depth);
			const inHeading = node?.type?.name === 'heading';
			currentHeadingLevel = inHeading ? node.attrs.level : 0;
			currentHeadingNumbered = inHeading ? node.attrs.numbered !== false : true;
		}
	});

	function applyHeading(level: number, numbered: boolean) {
		setHeadingLevel(level, numbered)($editorViewStore.state, $editorViewStore.dispatch);
		$editorViewStore.focus();
	}

	// read breakpoints from CSS variables so logic stays in sync with the Tailwind config
	function getCssBreakpoint(name: string, fallback: number): number {
		if (typeof window === 'undefined') return fallback;
		const v = getComputedStyle(document.documentElement).getPropertyValue(name)?.trim();
		const px = v?.endsWith('px') ? parseFloat(v) : Number(v);
		return Number.isFinite(px) && px! > 0 ? (px as number) : fallback;
	}
	const mdBp = getCssBreakpoint('--breakpoint-md', 768);
	// preview only at >= md; the mobile action bar handles smaller screens
	function isPreviewAllowed() {
		if (typeof window === 'undefined') return true;
		return window.matchMedia(`(min-width: ${mdBp}px)`).matches;
	}

	function togglePreview() {
		if (!isPreviewAllowed()) return; // keep behavior in sync with visibility
		previewStore.update((state) => ({ ...state, isVisible: !state.isVisible }));
		const element = document.querySelector('.wrapper');
		if ($previewStore.isVisible) {
			element?.classList.add('moble-box');
			element?.classList.remove('box-show');
		} else {
			element?.classList.add('box-show');
			element?.classList.remove('moble-box');
		}
	}

	function showPreview() {
		if (!isPreviewAllowed()) return; // no preview below sm breakpoint
		previewStore.update((state) => ({ ...state, isVisible: true }));
		const element = document.querySelector('.wrapper');
		element?.classList.add('moble-box');
		element?.classList.remove('box-show');
	}

	function handleCompile() {
		if (isCompiling) return;

		if (isPreviewAllowed()) showPreview();
		currentlyCompilingStore.set(true);

		// EditorView.svelte listens for this event
		window.dispatchEvent(new CustomEvent('compile'));
	}

	// preventDefault on mousedown anywhere in the toolbar so clicks never steal focus from
	// PM/mathfield; otherwise Skeleton's Popover loses the focus race on close and the next
	// keystroke goes nowhere. click handlers still fire.
	function preventEditorFocusLoss(e: MouseEvent) {
		e.preventDefault();
	}
</script>

<div class="flex items-center gap-4 sm:gap-6" data-keep-caret role="presentation" onmousedown={preventEditorFocusLoss}>
	<div class="swiper toolbarSwiper flex-shrink-0">
		<div class="swiper-wrapper">
			<div class="swiper-slide !w-auto">
				<!-- item gaps and divider padding use the same step per breakpoint, so the border sits centered in its gap -->
				<div class="text-surface-800-200 flex min-h-9 items-center gap-2.5 sm:gap-4 xl:w-auto 2xl:gap-6">
					<ul class="border-surface-300-700 flex items-center gap-2.5 border-r pr-2.5 sm:gap-4 sm:pr-4 2xl:gap-6 2xl:pr-6">
						<li class="toolbarButton hover:preset-tonal">
							<button
								onclick={() => {
									displaySearchBarStore.set(!$displaySearchBarStore);
								}}
								class="flex items-center p-1"
							>
								<Search class="h-5 w-5" />
							</button>
						</li>
					</ul>

					{#if $isReadOnly}
						<div class="text-surface-500 flex items-center gap-1.5">
							<Eye class="size-4" />
							<span class="text-sm font-medium">Read-only</span>
						</div>
					{:else}
						<ul class="border-surface-300-700 flex items-center gap-2.5 border-r pr-2.5 sm:gap-4 sm:pr-4 2xl:gap-6 2xl:pr-6">
							<li class="toolbarButton hover:preset-tonal">
								<button onclick={keepEditorFocus(undo)} class="flex items-center p-1" aria-label="Undo">
									<Undo class="h-5 w-5" />
								</button>
							</li>
							<li class="toolbarButton hover:preset-tonal">
								<button onclick={keepEditorFocus(redo)} class="flex items-center p-1" aria-label="Redo">
									<Redo class="h-5 w-5" />
								</button>
							</li>
						</ul>

						{#if $rawEditorActiveStore}
							<!-- a raw-LaTeX CM block is focused: prose formatting doesn't apply, show a minimal bar -->
							<div class="text-surface-600-300 flex min-h-9 items-center gap-2 text-sm">
								<Code class="size-4" />
								<span class="font-medium">LaTeX code</span>
								<span class="text-surface-500 hidden sm:inline">write LaTeX code directly here</span>
							</div>
						{:else if isMathfieldActive || mathToolbarState.aiInputActive}
							<MathToolbar />
						{:else}
							<ul class="flex items-center gap-4 2xl:gap-6">
								<li>
									<HeadingDropdown level={currentHeadingLevel} numbered={currentHeadingNumbered} onSelect={applyHeading} />
								</li>

								<li class={`toolbarButton ${activeCommands.strong ? 'preset-tonal-primary' : 'hover:preset-tonal'}`}>
									<button
										onclick={keepEditorFocus((s, d) => toggleMark(schema.marks.strong)(s, d))}
										class="flex items-center p-1"
										aria-label="Bold"
									>
										<Bold class="h-5 w-5" />
									</button>
								</li>

								<li class={`toolbarButton ${activeCommands.u ? 'preset-tonal-primary' : 'hover:preset-tonal'}`}>
									<button
										onclick={keepEditorFocus((s, d) => toggleMark(schema.marks.u)(s, d))}
										class="flex items-center p-1"
										aria-label="Underline"
									>
										<!-- nudged down 1.5px, lucide's U glyph rides high of the other icons' center line -->
										<Underline class="h-5 w-5 translate-y-[1.5px]" />
									</button>
								</li>

								<li class={`toolbarButton ${activeCommands.em ? 'preset-tonal-primary' : 'hover:preset-tonal'}`}>
									<button
										onclick={keepEditorFocus((s, d) => toggleMark(schema.marks.em)(s, d))}
										class="flex items-center p-1"
										aria-label="Italic"
									>
										<Italic class="h-5 w-5" />
									</button>
								</li>

								<li>
									<SupSubDropdown
										sup={!!activeCommands.sup}
										sub={!!activeCommands.sub}
										onToggle={(which) => {
											toggleMark(schema.marks[which])($editorViewStore.state, $editorViewStore.dispatch);
											$editorViewStore.focus();
										}}
									/>
								</li>

								<li>
									<TextColorDropdown {activeTextColor} />
								</li>

								<li>
									<HighlightDropdown {activeHighlightColor} />
								</li>

								<li>
									<MathDropdown />
								</li>

								<li>
									<ToolbarTable />
								</li>
								<li class="toolbarButton hover:preset-tonal">
									<button
										class="flex items-center p-1"
										onclick={() => {
											createCodeBlock()($editorViewStore.state, $editorViewStore.dispatch);
										}}
										aria-label="Insert code block"
									>
										<Code class="h-5 w-5" />
									</button>
								</li>

								<li class="toolbarButton hover:preset-tonal">
									<button
										class="flex items-center p-1"
										onclick={keepEditorFocus(selectParentNode)}
										aria-label="Select block"
										title="Select parent block"
									>
										<BoxSelect class="h-5 w-5" />
									</button>
								</li>
							</ul>
						{/if}
					{/if}
				</div>
			</div>
		</div>
	</div>

	{#if !minimal}
		<div class="flex-1"></div>

		<ul class="mt-4 flex items-center gap-4 sm:mt-0">
			<li class="hidden md:block">
				<button
					class="text-blue border-blue hover:bg-blue font-Work-Sans flex h-9 w-full items-center justify-center rounded border text-sm font-semibold transition-all duration-500 ease-in-out hover:text-white sm:w-[83px]"
					onclick={preventDefault(togglePreview)}
				>
					{isPreviewVisible ? 'Hide' : 'Preview'}
				</button>
			</li>
			<li class="hidden md:block">
				<button
					data-tour="compile-button"
					data-compiling={isCompiling}
					onclick={preventDefault(handleCompile)}
					disabled={isCompiling}
					class="border-blue bg-blue hover:text-blue font-Work-Sans flex h-9 w-full items-center justify-center rounded border text-sm font-semibold text-white transition-all duration-500 ease-in-out hover:bg-transparent disabled:cursor-not-allowed disabled:opacity-50 sm:w-[125px]"
				>
					{#if isCompiling}
						<span class="loader"></span>
						Compiling...
					{:else}
						Compile
					{/if}
				</button>
			</li>
		</ul>
	{/if}
</div>

{#if !minimal}
	<MobileActionBar />
{/if}

<style lang="postcss">
	@reference "../../../../app.css";

	.toolbarButton {
		@apply rounded-base transition-all ease-in-out;
	}

	.loader {
		border: 2px solid #f3f3f3;
		border-top: 2px solid #3498db;
		border-radius: 50%;
		width: 14px;
		height: 14px;
		animation: spin 1s linear infinite;
		margin-right: 8px;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.no-scrollbar {
		/* Firefox */
		scrollbar-width: none;
		/* IE/Edge */
		-ms-overflow-style: none;
	}
	.no-scrollbar::-webkit-scrollbar {
		display: none; /* Chrome/Safari */
	}

	/* no Swiper JS: keep the toolbar at natural width and let the parent's overflow-x-auto scroll it.
	   higher specificity so it wins over swiper/css's .swiper { overflow: hidden }. */
	:global(.swiper.toolbarSwiper) {
		flex-shrink: 0;
		overflow: visible;
		width: max-content;
	}
	:global(.toolbarSwiper .swiper-wrapper) {
		justify-content: flex-start !important;
	}
</style>
