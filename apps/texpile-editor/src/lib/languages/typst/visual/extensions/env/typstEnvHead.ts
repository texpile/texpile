// a Typst environment's head in the chip panel: its call and label as written, a renamed label taking its references along
import type { Node as PMNode } from 'prosemirror-model';
import type { VisualView } from '$lib/editor/canvas';
import type { GearPlace } from '$lib/editor/visual/extensions/blockHandle/blockSettings';
import { openBlockHeadPanel, type BlockHead } from '$lib/editor/visual/extensions/drawnChips/chipPanel/blockHeadPanel';
import { labelTaken } from '$lib/editor/visual/labelTaken';
import { repointRefs } from '$lib/editor/visual/repointRefs';
import { layoutKindOf } from '../layout/layoutDrawing';
import { envHeadSource, readEnvHead } from './envHeadEdits';

/** a call wrapping content that prints as a card with its name: neither a layout call nor a styled block */
export function isTypstEnvironment(node: PMNode): boolean {
	return node.type.name === 'typ_env' && node.attrs.name !== '' && !layoutKindOf(node);
}

function envHead(view: VisualView, pos: number): BlockHead {
	// a label retyped whole passes through none; its references still point at the one the panel opened on
	const opened = view.state.doc.nodeAt(pos)?.attrs.label ?? null;
	return {
		language: 'typst',
		holds: isTypstEnvironment,
		source: envHeadSource,
		settingsFor: () => null,
		attrsFor(node, next) {
			const head = readEnvHead(next);
			if (!head) return null;
			const { label } = head;
			if (label !== null && label !== node.attrs.label && labelTaken(view.state.doc, label, pos)) return null;
			return { ...node.attrs, name: head.name, args: head.args, label };
		},
		alsoChange(tr, node, attrs) {
			if (attrs.label !== node.attrs.label) repointRefs(tr, tr.before, String(node.attrs.label ?? opened ?? ''), String(attrs.label ?? ''));
		}
	};
}

export function openTypstEnvHead(view: VisualView, pos: number, place: GearPlace): void {
	openBlockHeadPanel(view, pos, place, envHead(view, pos));
}
