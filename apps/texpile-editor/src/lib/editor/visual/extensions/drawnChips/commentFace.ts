// a comment folded to one quiet line: its first words and how many lines follow, the rest in the hint
import { tip } from '$lib/components/tooltip.svelte';
import { faceElement, sourceHint, type ChipFace } from './chipFace';

/** `lines` without their comment markers; `marker` is the language's own, shown faint in front */
export function commentFace(lines: string[], marker: string): ChipFace {
	const dom = faceElement('span', 'drawn-comment');
	const shown = lines.find((line) => line.trim()) ?? '';
	dom.appendChild(faceElement('span', 'drawn-comment-marker', marker));
	dom.appendChild(document.createTextNode(' ' + shown.trim()));
	const rest = lines.length - 1;
	if (rest > 0) {
		dom.appendChild(faceElement('span', 'drawn-comment-more', `+${rest} ${rest === 1 ? 'line' : 'lines'}`));
	}
	const hint = sourceHint(lines.join('\n'));
	const tipped = hint.trim() && hint.trim() !== shown.trim() ? tip(dom, hint) : null;
	return { dom, line: true, destroy: () => tipped?.destroy() };
}
