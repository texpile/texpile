// an environment the parser keeps as a container (16.1): its head, then its body, where the children go
import type { Node as PMNode } from 'prosemirror-model';
import type { Decoration } from 'prosemirror-view';
import type { CanvasEvent, CanvasNodeViewConstructor, CanvasViewSet } from '$lib/editor/canvas';
import { gearPlaceAt } from '$lib/editor/visual/extensions/blockHandle/settingsPanelOffer.svelte';
import { faceElement, setLook } from '$lib/editor/canvas';
import { templateFeaturesStore } from '$lib/stores/editorStore';
import { environmentLook } from '../environmentLook';
import { environmentHead } from './environmentHead';
import { ENVIRONMENT_SETTINGS, openEnvironmentHead } from './environmentSettings';
import {
	BODY_AFTER_LOOK,
	BOX_ENVIRONMENT_LOOK,
	CAPTIONED_BODY_LOOK,
	bodyLook,
	ENVIRONMENT_LOOK,
	GEAR_PLACE_LOOK,
	headerLook
} from './environmentStyles';

function numberOf(decorations: readonly Decoration[]): string | null {
	const numbers = decorations.find((d) => (d.spec as { numbers?: string[] }).numbers)?.spec.numbers as string[] | undefined;
	return numbers?.[0] ?? null;
}

function holdsFloatCaption(node: PMNode): boolean {
	let found = false;
	node.forEach((child) => void (found ||= child.type.name === 'float_caption'));
	return found;
}

function environmentView(
	...[node, view, getPos, decorations]: Parameters<CanvasNodeViewConstructor>
): ReturnType<CanvasNodeViewConstructor> {
	const { el, read } = view.canvas.build;
	let current = node;
	const number = numberOf(decorations);
	const name = String(node.attrs.name ?? 'environment');
	const heads = read({ kind: 'store', name: 'drawnInputs' }, () => templateFeaturesStore.current.environmentHeads);
	const look = environmentLook(name, String(node.attrs.args ?? ''), heads);
	const dom = el('div', 'tex-environment');
	dom.setAttribute('data-env', name);
	setLook(dom, look.kind === 'box' ? { ...ENVIRONMENT_LOOK, ...BOX_ENVIRONMENT_LOOK } : ENVIRONMENT_LOOK);
	const header = dom.appendChild(el('div', 'env-header'));
	setLook(header, headerLook(look.kind, view.state.doc.resolve(getPos() ?? 0).depth === 0));
	header.appendChild(environmentHead(look, number, view));
	const body = dom.appendChild(el('div', 'tex-environment-body'));
	setLook(body, bodyLook(look));
	let captioned = holdsFloatCaption(node);
	if (captioned) setLook(body, CAPTIONED_BODY_LOOK);
	const after = faceElement('span');
	after.generated = true;
	setLook(after, BODY_AFTER_LOOK);
	body.generatedAfter = after;
	// where the handle's gear stood, for the panel it opens to keep to
	setLook(dom.appendChild(el('span', 'env-gear-place')), GEAR_PLACE_LOOK);
	return {
		dom,
		contentDOM: body,
		// a new number builds the head again
		update(next, nextDecorations) {
			if (!next.sameMarkup(current) || numberOf(nextDecorations) !== number) return false;
			current = next;
			if (holdsFloatCaption(next) !== captioned) {
				captioned = !captioned;
				if (captioned) setLook(body, CAPTIONED_BODY_LOOK);
				else for (const name of ['display', 'flexDirection'] as const) body.style.removeProperty(name);
			}
			return true;
		},
		// a press on the head opens its first line under it, as the head's button did
		stopEvent(event) {
			const pos = getPos();
			const head = event.target.closest('.env-head, .env-gear, .env-label');
			if (pos === undefined || !head || !view.editable || !pressed(event)) return false;
			const place = gearPlaceAt(view, pos, head.getBoundingClientRect());
			if (place) openEnvironmentHead(view, pos, place);
			return true;
		}
	};
}

function pressed(event: CanvasEvent): boolean {
	return event.type === 'mousedown' && 'button' in event && event.button === 0;
}

export function environmentViews(): CanvasViewSet {
	return { nodeViews: { environment: environmentView }, blockSettings: { environment: ENVIRONMENT_SETTINGS } };
}
