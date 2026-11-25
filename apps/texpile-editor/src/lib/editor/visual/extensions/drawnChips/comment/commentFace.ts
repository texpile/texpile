// a comment folded to one quiet line: its first words and how many lines follow, the rest in the hint
import { sourceHint, type ChipFace } from '../chipFace';
import { chipElement } from '../looks/chipLooks';

/** `lines` without their comment markers; `marker` is the language's own, shown faint in front */
export function commentFace(lines: string[], marker: string): ChipFace {
	const dom = chipElement('span', 'drawn-comment');
	const shown = lines.find((line) => line.trim()) ?? '';
	dom.appendChild(chipElement('span', 'drawn-comment-marker', marker));
	dom.append(' ' + shown.trim());
	const rest = lines.length - 1;
	if (rest > 0) dom.appendChild(chipElement('span', 'drawn-comment-more', `+${rest} ${rest === 1 ? 'line' : 'lines'}`));
	const hint = sourceHint(lines.join('\n'));
	if (hint.trim() && hint.trim() !== shown.trim()) dom.hint = hint;
	return { dom, line: true };
}
