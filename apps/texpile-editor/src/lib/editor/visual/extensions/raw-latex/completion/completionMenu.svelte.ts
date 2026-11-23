// the chip's completion list, mounted once and updated in place, under the word being completed
import { mount, unmount } from 'svelte';
import type { EditorView } from 'prosemirror-view';
import IslandCompletionMenu from './IslandCompletionMenu.svelte';
import type { MatchedOption } from './completionMatch';

const GAP = 2;

let container: HTMLElement | null = null;
let component: ReturnType<typeof mount> | null = null;

const props = $state({
	matches: [] as MatchedOption[],
	selected: 0,
	onPick: (() => {}) as (index: number) => void
});

function place(view: EditorView, pos: number): void {
	const box = container;
	if (!box) return;
	const coords = view.coordsAtPos(pos);
	const win = box.ownerDocument.defaultView ?? window;
	// a frame on, when the list has its size
	win.requestAnimationFrame(() => {
		if (box !== container) return;
		const { height, width } = box.getBoundingClientRect();
		const below = win.innerHeight - coords.bottom;
		const fitsBelow = below >= height + GAP || below >= coords.top;
		box.style.top = `${fitsBelow ? coords.bottom + GAP : coords.top - height - GAP}px`;
		box.style.left = `${Math.max(0, Math.min(coords.left, win.innerWidth - width - 10))}px`;
	});
}

export function showCompletionMenu(view: EditorView, pos: number, matches: MatchedOption[], onPick: (index: number) => void): void {
	const doc = view.dom.ownerDocument;
	if (container && container.ownerDocument !== doc) hideCompletionMenu();
	Object.assign(props, { matches, selected: 0, onPick });
	if (!container) {
		container = doc.createElement('div');
		container.className = 'island-completion';
		container.style.position = 'fixed';
		container.style.zIndex = '50';
		doc.body.appendChild(container);
		component = mount(IslandCompletionMenu, { target: container, props });
	}
	place(view, pos);
}

export function selectCompletionAt(index: number): void {
	props.selected = index;
}

export function hideCompletionMenu(): void {
	if (component) void unmount(component);
	component = null;
	container?.remove();
	container = null;
}
