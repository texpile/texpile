<script lang="ts">
	import IconBookText from '@lucide/svelte/icons/book-text';
	import IconX from '@lucide/svelte/icons/x';
	import IconType from '@lucide/svelte/icons/type';
	import IconMessageSquare from '@lucide/svelte/icons/message-square';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconRepeat from '@lucide/svelte/icons/repeat';
	import IconHelpCircle from '@lucide/svelte/icons/help-circle';
	import IconBookPlus from '@lucide/svelte/icons/book-plus';
	import { addWordToDocumentDictionary } from '$lib/editor/extensions/harper';
	import { diffChars } from 'diff';
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	// matches prosemirror-proofread's Problem
	interface Problem {
		from: number;
		to: number;
		msg: string;
		shortmsg: string;
		type: string;
		replacements: string[];
		text: string; // the error text itself
	}

	interface Props {
		error: Problem;
		errors: Problem[]; // all errors in this segment
		position: { x: number; y: number };
		onReplace: (value: string) => void;
		onIgnore: () => void;
		onClose: () => void;
		invalidateCache: () => void; // force re-check after dictionary changes
	}

	// errors is accepted for the factory contract but not rendered yet
	let { error, errors: _errors, position, onReplace, onIgnore, onClose, invalidateCache }: Props = $props();

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

			boxElement.style.left = `${adjustedX}px`;
			boxElement.style.top = `${adjustedY}px`;
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
		if (text === ' ') return '(space)';
		if (text === '') return '(remove)';
		if (text.trim() === '') return `(${text.length} spaces)`;
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

	function handleClick(e: MouseEvent) {
		e.stopPropagation();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
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

<svelte:window onclick={handleWindowClick} />

<div
	bind:this={boxElement}
	class="card preset-tonal-surface-100-900 border-surface-300-700 bg-surface-50-950 pointer-events-auto fixed z-[999999] min-w-[280px] max-w-[360px] space-y-3 border p-4 shadow-2xl"
	onclick={handleClick}
	onkeydown={handleKeydown}
	role="dialog"
	aria-label="Spelling suggestion"
	tabindex="-1"
	transition:fly={{ y: 8, duration: 200, easing: quintOut }}
	style="transform-origin: top center;"
>
	<div class="flex items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			{#if sanitizedType() === 'spelling' || sanitizedType() === 'typo'}
				<IconBookText size={18} class="text-primary-500" />
			{:else if sanitizedType() === 'capitalization'}
				<IconType size={18} class="text-primary-500" />
			{:else if sanitizedType() === 'wordchoice'}
				<IconMessageSquare size={18} class="text-primary-500" />
			{:else if sanitizedType() === 'style'}
				<IconSparkles size={18} class="text-primary-500" />
			{:else if sanitizedType() === 'repetition'}
				<IconRepeat size={18} class="text-primary-500" />
			{:else}
				<IconHelpCircle size={18} class="text-primary-500" />
			{/if}
			<span class="text-sm font-semibold capitalize opacity-75">
				{sanitizedType()}
			</span>
		</div>
		<button class="btn-icon btn-icon-sm hover:preset-tonal" onclick={onClose} aria-label="Close">
			<IconX size={16} />
		</button>
	</div>

	<div class="space-y-2">
		<p class="text-sm leading-relaxed">
			{error.shortmsg || error.msg}
		</p>

		{#if error.replacements && error.replacements.length > 0}
			{#if error.text}
				{@const diffParts = getDiffParts(error.text, error.replacements[0])}
				<button
					class="bg-surface-100-900 hover:preset-tonal border-surface-300-700 w-full cursor-pointer rounded border p-3 text-left transition-colors"
					onclick={() => handleReplace(error.replacements[0])}
					title="Click to apply this suggestion"
				>
					<div class="font-mono text-sm leading-relaxed">
						{#each diffParts as part}
							{#if part.removed}
								<del class="text-error-700-300 line-through opacity-60">{part.value === ' ' ? '␣' : part.value}</del>
							{:else if part.added}
								<ins class="text-success-700-300 font-bold no-underline">{part.value === ' ' ? '␣' : part.value}</ins>
							{:else}
								<span>{part.value}</span>
							{/if}
						{/each}
					</div>
				</button>
			{/if}

			{#if error.replacements.length > 1}
				<div class="space-y-2">
					<p class="text-xs font-semibold uppercase tracking-wider opacity-60">Additional Suggestions</p>
					<div class="space-y-1">
						{#each error.replacements.slice(1) as replacement}
							<button
								class="btn preset-tonal hover:preset-filled-primary-500 w-full justify-start font-mono text-sm"
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

	<div class="border-surface-200-800 flex flex-col gap-2 border-t pt-2">
		{#if canAddToDictionary()}
			<button
				class="btn preset-tonal-primary hover:preset-filled-primary-500 w-full justify-center gap-1.5"
				onclick={handleAddToDictionary}
				title="Add '{error.text}' to dictionary"
			>
				<IconBookPlus size={16} />
				<span>Add to Dictionary</span>
			</button>
		{/if}
		<button class="btn preset-tonal hover:preset-filled w-full" onclick={handleIgnore}> Ignore </button>
	</div>
</div>
