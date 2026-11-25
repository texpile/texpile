// a Typst environment as P0 drew it: the call's name, or the head its maker prints, and its label over the body
import type { Node as PMNode } from 'prosemirror-model';
import { faceElement, FaceElement, setLook, type CanvasEvent, type CanvasNodeViewConstructor, type StyleLook } from '$lib/editor/canvas';
import { gearPlaceAt } from '$lib/editor/visual/extensions/blockHandle/settingsPanelOffer.svelte';
import { HEAD_HOVER_LOOKS, HEAD_LOOKS } from '$lib/editor/visual/extensions/drawnChips/looks/headLooks';
import { TYPST_BODY_AFTER_LOOK, TYPST_LOOKS } from '../../core/looks/typstLooks';
import { drawTheoremHead, theoremHead } from '../../core/own/theoremHead';
import { typstScopeNow } from '../../core/scope/fileScopeNow.svelte';
import { openTypstEnvHead } from './typstEnvHead';

const LOOKS = TYPST_LOOKS.looks;
const LABEL_LOOK: StyleLook = {
	fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
	fontSize: '0.75rem',
	color: 'var(--faint-text)'
};

function printedHead(node: PMNode, own: ReturnType<NonNullable<typeof typstScopeNow.current>['own']> | undefined): FaceElement | null {
	const printed = theoremHead(own, typeof node.attrs.args === 'string' ? node.attrs.args : null);
	const drawn = printed ? drawTheoremHead(printed) : null;
	return drawn instanceof FaceElement ? drawn : null;
}

function pressed(event: CanvasEvent): boolean {
	return event.type === 'mousedown' && 'button' in event && event.button === 0;
}

export function typstEnvView(...[node, view, getPos]: Parameters<CanvasNodeViewConstructor>): ReturnType<CanvasNodeViewConstructor> {
	const { el, read } = view.canvas.build;
	const name = String(node.attrs.name ?? '');
	const own = read({ kind: 'store', name: 'typstNames' }, () => typstScopeNow.current?.own(name));
	const head = printedHead(node, own);
	const dom = el('div', 'typ-environment');
	dom.setAttribute('data-typ-env', name);
	setLook(dom, { ...LOOKS['typ-environment'], ...(head ? LOOKS['typ-environment-theorem'] : {}) });
	const header = dom.appendChild(el('div', 'typ-env-header'));
	setLook(header, { ...LOOKS['typ-env-header'], ...(head ? LOOKS['typ-env-header-theorem'] : {}) });
	const kind = head ? 'env-head' : 'env-label';
	const button = header.appendChild(el('button', kind, head ? undefined : name));
	setLook(button, HEAD_LOOKS[kind]);
	button.states = { hover: HEAD_HOVER_LOOKS[kind] };
	if (head) {
		button.dataset.look = 'theorem';
		button.appendChild(head);
	}
	if (node.attrs.label) setLook(header.appendChild(el('span', 'typ-env-label', `<${String(node.attrs.label)}>`)), LABEL_LOOK);
	const body = dom.appendChild(el('div', 'typ-environment-body'));
	if (head) {
		const after = faceElement('span');
		after.generated = true;
		setLook(after, TYPST_BODY_AFTER_LOOK);
		body.generatedAfter = after;
	}
	let current = node;
	return {
		dom,
		contentDOM: body,
		update(next) {
			if (!next.sameMarkup(current)) return false;
			current = next;
			return true;
		},
		// a press on the name opens the call and label in the chip panel, as P0's header button did
		stopEvent(event) {
			const pos = getPos();
			const target = event.target.closest('.env-head, .env-label');
			if (pos === undefined || !target || !view.editable || !pressed(event)) return false;
			const place = gearPlaceAt(view, pos, target.getBoundingClientRect());
			if (place) openTypstEnvHead(view, pos, place);
			return true;
		}
	};
}
