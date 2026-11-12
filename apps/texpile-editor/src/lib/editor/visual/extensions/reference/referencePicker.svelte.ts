// the @ menu, mounted once and updated in place: mounted again at every arrow key, its list went back to the top
import { mount, unmount } from 'svelte';
import type { EditorView } from 'prosemirror-view';
import ReferencePickerDropdown from './ReferencePickerDropdown.svelte';
import type { ReferenceItem } from './referenceItems';

const GAP = 4;
const WIDTH = 384;

let container: HTMLElement | null = null;
let component: ReturnType<typeof mount> | null = null;

const props = $state({
	items: [] as ReferenceItem[],
	selectedIndex: 0,
	query: '',
	onSelect: (() => {}) as (item: ReferenceItem) => void
});

// below the place when there is room or more room than above, and inside the window's right edge
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
		const wide = width || WIDTH;
		box.style.left = `${coords.left + wide > win.innerWidth ? win.innerWidth - wide - 10 : coords.left}px`;
	});
}

/** the menu under the place `pos` of `view`, its first item selected */
export function showReferencePicker(
	view: EditorView,
	pos: number,
	items: ReferenceItem[],
	query: string,
	onSelect: (item: ReferenceItem) => void
): void {
	// in the window the editor is in, which may be one of its own
	const doc = view.dom.ownerDocument;
	if (container && container.ownerDocument !== doc) hideReferencePicker();
	Object.assign(props, { items, selectedIndex: 0, query, onSelect });
	if (!container) {
		container = doc.createElement('div');
		container.className = 'reference-picker-container';
		container.style.position = 'fixed';
		container.style.zIndex = '50';
		doc.body.appendChild(container);
		component = mount(ReferencePickerDropdown, { target: container, props });
	}
	place(view, pos);
}

export function selectReferenceAt(index: number): void {
	props.selectedIndex = index;
}

export function hideReferencePicker(): void {
	if (component) void unmount(component);
	component = null;
	container?.remove();
	container = null;
}
