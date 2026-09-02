// mounts the link tooltip ONCE and updates it in place: remounting on every change replayed the
// entrance animation, which read as a flash while typing in a link
import { mount, unmount } from 'svelte';
import LinkTooltip from './LinkTooltip.svelte';

type Position = {
	x: number;
	y: number;
};

export type LinkTooltipOptions = {
	href: string;
	/** the link's display text in the document, which the form edits directly */
	text: string;
	position: Position;
	onUpdate: (href: string, text: string) => void;
	onRemove: () => void;
	onClose: () => void;
	/** open interception: true = handled in-app (md workspace link), else browser fallback */
	onOpen?: (href: string) => boolean;
};

let container: HTMLDivElement | null = null;
let component: ReturnType<typeof mount> | null = null;

// a $state proxy handed to mount(), so later calls re-render the live component instead of remounting
const props = $state({
	href: '',
	text: '',
	position: { x: 0, y: 0 },
	onUpdate: (() => {}) as LinkTooltipOptions['onUpdate'],
	onRemove: (() => {}) as LinkTooltipOptions['onRemove'],
	onClose: (() => {}) as LinkTooltipOptions['onClose'],
	onOpen: undefined as LinkTooltipOptions['onOpen']
});

export function createLinkTooltip(options: LinkTooltipOptions): void {
	Object.assign(props, { onOpen: undefined, ...options });
	if (component) return;

	container = document.createElement('div');
	container.id = 'link-tooltip-container';
	container.style.position = 'fixed';
	container.style.zIndex = '999999';
	container.style.pointerEvents = 'none';
	container.style.top = '0';
	container.style.left = '0';
	container.style.width = '100%';
	container.style.height = '100%';
	document.body.appendChild(container);

	try {
		component = mount(LinkTooltip, { target: container, props });
	} catch (error) {
		console.error('[LinkTooltip] Error mounting component:', error);
		destroyLinkTooltip();
	}
}

export function destroyLinkTooltip(): void {
	if (component) {
		try {
			unmount(component);
		} catch (error) {
			console.error('[LinkTooltip] Error unmounting component:', error);
		}
		component = null;
	}
	if (container?.parentNode) container.parentNode.removeChild(container);
	container = null;
}
