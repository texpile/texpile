<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import IconBookText from '@lucide/svelte/icons/book-text';
	import IconX from '@lucide/svelte/icons/x';
	import IconType from '@lucide/svelte/icons/type';
	import IconMessageSquare from '@lucide/svelte/icons/message-square';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconRepeat from '@lucide/svelte/icons/repeat';
	import IconHelpCircle from '@lucide/svelte/icons/help-circle';
	import IconBookPlus from '@lucide/svelte/icons/book-plus';
	import IconCircleOff from '@lucide/svelte/icons/circle-off';
	import { addWordToDocumentDictionary } from '$lib/editor/spellcheck/harper';
	import { ruleName, SPELLING_RULE } from '$lib/editor/spellcheck/config/grammarRules';
	import { setGrammarRule } from '$lib/editor/spellcheck/config/spellcheckConfig';
	import { settings } from '$lib/settings';
	import { toaster } from '$lib/modals/toaster-svelte';
	import { diffChars } from 'diff';
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { m } from '$lib/paraglide/messages';

	// matches prosemirror-proofread's Problem, minus the from/to offsets the box never reads
	// (the factory positions it; a full Problem is assignable here)
	type Problem = {
		msg: string;
		shortmsg: string;
		type: string;
		replacements: string[];
		text: string; // the error text itself
		rule?: string; // the Harper rule that found it
	};

	type Props = {
		error: Problem;
		position: { x: number; y: number };
		onReplace: (value: string) => void;
		onIgnore: () => void;
		onClose: () => void;
		invalidateCache: () => void; // force re-check after dictionary changes
	};

	let { error, position, onReplace, onIgnore, onClose, invalidateCache }: Props = $props();

	let boxElement: HTMLDivElement;
	let isReady = $state(false);

	const sanitizedType = $derived(() => {
		return error.type?.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'issue';
	});

	const canAddToDictionary = $derived(() => {
		const type = sanitizedType();
		return type === 'spelling' || type === 'typo' || type === 'unknownword';
	});

	// delay the window click handler so the opening click doesn't instantly close the box
	$effect(() => {
		const timer = setTimeout(() => {
			isReady = true;
		}, 100);

		return () => clearTimeout(timer);
	});

	// keep the box within the viewport
	$effect(() => {
		if (boxElement) {
			const rect = boxElement.getBoundingClientRect();
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;

			let adjustedX = position.x;
			let adjustedY = position.y + 5;

			if (adjustedX + rect.width > viewportWidth) {
				adjustedX = viewportWidth - rect.width - 10;
			}
			if (adjustedX < 10) {
				adjustedX = 10;
			}

			// show above if no room below
			if (adjustedY + rect.height > viewportHeight) {
				adjustedY = position.y - rect.height - 5;
			}
			if (adjustedY < 10) {
				adjustedY = 10;
			}

			// whole pixels: from a fractional start its icons and labels round to the pixel grid apart
			boxElement.style.left = `${Math.round(adjustedX)}px`;
			boxElement.style.top = `${Math.round(adjustedY)}px`;
		}
	});

	function handleReplace(value: string) {
		onReplace(value);
		onClose();
	}

	function handleIgnore() {
		onIgnore();
		onClose();
	}

	function formatReplacement(text: string): string {
		if (text === ' ') return m.harper_replacement_space();
		if (text === '') return m.harper_replacement_remove();
		if (text.trim() === '') {
			return text.length === 1
				? m.harper_replacement_whitespace_one({ count: text.length })
				: m.harper_replacement_whitespace_other({ count: text.length });
		}
		return text;
	}

	// short words read better as a whole-word replacement than a char diff
	function getDiffParts(original: string, replacement: string) {
		const maxLength = Math.max(original.length, replacement.length);

		if (maxLength <= 6) {
			return [
				{ removed: true, value: original },
				{ added: true, value: replacement }
			];
		}

		return diffChars(original, replacement);
	}

	async function handleAddToDictionary() {
		const word = error.text;

		if (!word) {
			console.warn('[Harper] No word to add to dictionary');
			return;
		}

		console.log('[Harper] Adding word to dictionary:', word);

		try {
			await addWordToDocumentDictionary(word);

			invalidateCache();

			onClose();
		} catch (error) {
			console.error('[Harper] Failed to add word to dictionary:', error);
		}
	}

	// a grammar rule can be turned off from here; spelling cannot, since one word would take all of them
	const offRule = $derived(error.rule && error.rule !== SPELLING_RULE ? error.rule : null);

	function turnOffRule(rule: string) {
		const before = settings.current.grammarRules?.[rule];
		setGrammarRule(rule, false);
		toaster.success({
			title: m.harper_rule_turned_off({ rule: ruleName(rule) }),
			action: { label: m.menubar_undo(), onClick: () => setGrammarRule(rule, before) }
		});
		onClose();
	}

	function handleClick(e: MouseEvent) {
		e.stopPropagation();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}

	// The box is opened by clicking a word, which leaves focus in the editor - so the handler on the
	// box itself never sees a key. Escape has to be caught at the window to close it at all.
	function handleWindowKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape' || !isReady) return;
		e.stopPropagation();
		onClose();
	}

	function handleWindowClick() {
		if (isReady) {
			onClose();
		}
	}

	function handleScroll() {
		onClose();
	}

	// close on scroll of the editor (either mode) or any scrollable ancestor
	$effect(() => {
		const prosemirror = document.querySelector('.ProseMirror') ?? document.querySelector('.cm-scroller');
		if (prosemirror) {
			const scrollableElements = [prosemirror];
			let parent = prosemirror.parentElement;

			while (parent) {
				const overflow = window.getComputedStyle(parent).overflow;
				const overflowY = window.getComputedStyle(parent).overflowY;
				if (overflow === 'auto' || overflow === 'scroll' || overflowY === 'auto' || overflowY === 'scroll') {
					scrollableElements.push(parent);
				}
				parent = parent.parentElement;
			}

			scrollableElements.forEach((el) => {
				el.addEventListener('scroll', handleScroll, { passive: true });
			});

			return () => {
				scrollableElements.forEach((el) => {
					el.removeEventListener('scroll', handleScroll);
				});
			};
		}
	});
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<div
	bind:this={boxElement}
	class="card border-surface-300-700 bg-surface-50-950 pointer-events-auto fixed z-[999999] max-w-[280px] min-w-[200px] space-y-1.5 border p-2 shadow-2xl"
	onclick={handleClick}
	onkeydown={handleKeydown}
	role="dialog"
	aria-label={m.harper_suggestion_dialog_aria_label()}
	tabindex="-1"
	transition:fly={{ y: 8, duration: 200, easing: quintOut }}
	style="transform-origin: top center;"
>
	<div class="flex items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			{#if sanitizedType() === 'spelling' || sanitizedType() === 'typo'}
				<IconBookText size={14} class="text-primary-ink" />
			{:else if sanitizedType() === 'capitalization'}
				<IconType size={14} class="text-primary-ink" />
			{:else if sanitizedType() === 'wordchoice'}
				<IconMessageSquare size={14} class="text-primary-ink" />
			{:else if sanitizedType() === 'style'}
				<IconSparkles size={14} class="text-primary-ink" />
			{:else if sanitizedType() === 'repetition'}
				<IconRepeat size={14} class="text-primary-ink" />
			{:else}
				<IconHelpCircle size={14} class="text-primary-ink" />
			{/if}
			<span class="cap-center text-xs font-semibold capitalize opacity-75">
				{sanitizedType()}
			</span>
		</div>
		<button class="btn-icon btn-icon-xs hover:preset-tonal" onclick={onClose} aria-label={m.harper_close_button_aria_label()}>
			<IconX size={14} />
		</button>
	</div>

	<div class="space-y-1.5">
		<p class="text-xs [overflow-wrap:anywhere]">
			{error.shortmsg || error.msg}
		</p>

		{#if error.replacements && error.replacements.length > 0}
			{#if error.text}
				{@const diffParts = getDiffParts(error.text, error.replacements[0])}
				<button
					class="bg-surface-100-900 hover:preset-tonal border-surface-300-700 rounded-base w-full cursor-pointer border px-2 py-1.5 text-left transition-colors"
					onclick={() => handleReplace(error.replacements[0])}
					use:tip={m.harper_apply_suggestion_title()}
				>
					<div class="font-mono text-xs [overflow-wrap:anywhere]">
						{#each diffParts as part, i (i)}
							{#if part.removed}
								<del class="text-error-ink line-through opacity-60">{part.value === ' ' ? '␣' : part.value}</del>
							{:else if part.added}
								<ins class="text-success-ink font-bold no-underline">{part.value === ' ' ? '␣' : part.value}</ins>
							{:else}
								<span>{part.value}</span>
							{/if}
						{/each}
					</div>
				</button>
			{/if}

			{#if error.replacements.length > 1}
				<div class="space-y-1">
					<p class="text-[10px] font-semibold tracking-wider uppercase opacity-60">
						{m.harper_additional_suggestions_heading()}
					</p>
					<div class="space-y-1">
						{#each error.replacements.slice(1) as replacement, i (i)}
							<button
								class="btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal w-full justify-start font-mono text-xs"
								onclick={() => handleReplace(replacement)}
							>
								{formatReplacement(replacement)}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<div class="border-surface-200-800 flex items-center gap-1.5 border-t pt-1.5">
		{#if canAddToDictionary()}
			<button
				class="btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal flex-1 justify-center gap-1 text-xs"
				onclick={handleAddToDictionary}
				use:tip={m.harper_add_to_dictionary_title({ word: error.text })}
			>
				<IconBookPlus size={13} />
				<span class="cap-center">{m.harper_add_to_dictionary_button()}</span>
			</button>
		{/if}
		{#if offRule}
			<button
				class="btn btn-xs preset-outlined-surface-200-800 hover:preset-tonal flex-1 justify-center gap-1 text-xs"
				onclick={() => turnOffRule(offRule)}
				use:tip={m.harper_turn_off_rule_title({ rule: ruleName(offRule) })}
			>
				<IconCircleOff size={13} />
				<span class="cap-center">{m.harper_turn_off_rule_button()}</span>
			</button>
		{/if}
		<button class="btn btn-xs preset-tonal hover:preset-filled flex-1 text-xs" onclick={handleIgnore}>
			{m.harper_ignore_button()}
		</button>
	</div>
</div>
