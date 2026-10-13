// scrolls the search box sideways so its caret stays in sight as a long query grows or the caret moves
import type { ActionReturn } from 'svelte/action';

function scroll(caret: HTMLElement): void {
	const line = caret.parentElement;
	if (!line) return;
	const x = caret.getBoundingClientRect().left - line.getBoundingClientRect().left + line.scrollLeft;
	if (x < line.scrollLeft) line.scrollLeft = x;
	else if (x > line.scrollLeft + line.clientWidth - 2) line.scrollLeft = x - line.clientWidth + 2;
}

export function keepInSight(caret: HTMLElement, _box: unknown): ActionReturn<unknown> {
	scroll(caret);
	return { update: () => scroll(caret) };
}
