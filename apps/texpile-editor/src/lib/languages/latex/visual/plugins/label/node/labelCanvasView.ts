// a \label drawn as LabelDisplay drew it: a tag and the name on a light tint, red when two anchors share the name;
// a click opens the name in its field
import type { Node as PMNode } from 'prosemirror-model';
import type { Decoration } from 'prosemirror-view';
import type { CanvasNodeViewConstructor, StyleLook, ViewElementRef, VisualView } from '$lib/editor/canvas';
import { decorationAttrsOf, setLook } from '$lib/editor/canvas';
import { liveRefProblems, openFieldPanel, placedHost, refProblemText } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';
import { announceLabelMove, readLabelName, setLabelName } from './renameLabel';

const GLUE = 'calc(1em * 0.25)';
const CHIP_LOOK: StyleLook = {
	display: 'inline-flex',
	alignItems: 'baseline',
	gap: '0.25em',
	padding: '0 0.3em',
	borderRadius: 'calc(var(--radius-base) * 0.5)',
	backgroundColor: 'color-mix(in oklab, currentColor 8%, transparent)',
	cursor: 'pointer'
};
const HEADING_LOOK: StyleLook = { fontSize: '1rem', fontWeight: '400' };
const ICON_LOOK: StyleLook = { flex: 'none', alignSelf: 'center', width: '0.75em', height: '0.75em', color: 'var(--muted-text)' };
const NAME_LOOK: StyleLook = { fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85em' };
const TWICE: StyleLook = { color: 'var(--color-ref-broken-fg)' };

function gluedOf(decorations: readonly Decoration[]): string {
	return decorations.map((decoration) => decorationAttrsOf(decoration)['data-glued'] ?? '').join(' ');
}

function openNamePanel(view: VisualView, getPos: () => number | undefined): void {
	const pos = getPos();
	const box = pos === undefined ? null : (view.nodeDOM(pos) as ViewElementRef | null)?.getBoundingClientRect();
	const node = pos === undefined ? null : view.state.doc.nodeAt(pos);
	if (!box || !node) return;
	const opened = String(node.attrs.name ?? '');
	const placed = placedHost(view, () => ({ x: box.left, y: box.top, width: box.width, height: box.height }));
	openFieldPanel({
		anchor: placed.host,
		source: `\\label{${opened}}`,
		view,
		write(next) {
			const name = readLabelName(next);
			const at = getPos();
			if (name && at !== undefined) setLabelName(view, at, name);
		},
		onClose(how) {
			placed.remove();
			const at = getPos();
			announceLabelMove(opened, String((at === undefined ? null : view.state.doc.nodeAt(at))?.attrs.name ?? opened));
			if (how !== 'away') view.focus();
		}
	});
}

export function labelCanvasView(
	...[node, view, getPos, decorations]: Parameters<CanvasNodeViewConstructor>
): ReturnType<CanvasNodeViewConstructor> {
	const { el, read, icon } = view.canvas.build;
	const name = String(node.attrs.name ?? '');
	const twice = read(
		{ kind: 'store', name: 'drawnInputs' },
		() => liveRefProblems.current?.problems.find((p) => p.kind === 'label-twice' && p.name === name) ?? null
	);
	const glued = gluedOf(decorations);
	// sized 0 so the template's whitespace takes no room, its chip at the text's size
	const dom = el('span', 'chip-host');
	dom.setAttribute('data-label', name);
	setLook(dom, {
		...(glued.includes('before') ? { marginLeft: GLUE } : {}),
		...(glued.includes('after') ? { marginRight: GLUE } : {})
	});
	const chip = dom.appendChild(el('span', 'text-chip'));
	const inHeading = view.state.doc.resolve(getPos() ?? 0).parent.type.name === 'heading';
	setLook(chip, inHeading ? { ...CHIP_LOOK, ...HEADING_LOOK } : CHIP_LOOK);
	chip.states = { hover: { backgroundColor: 'color-mix(in oklab, currentColor 14%, transparent)' } };
	chip.hint = twice ? refProblemText(twice) : m.label_chip_title({ name });
	const tag = chip.appendChild(icon('tag', 16));
	setLook(tag, twice ? { ...ICON_LOOK, ...TWICE } : ICON_LOOK);
	const shown = chip.appendChild(el('span', 'text-chip-name', name));
	setLook(shown, twice ? { ...NAME_LOOK, ...TWICE } : NAME_LOOK);
	chip.on.click = () => {
		openNamePanel(view, getPos);
		return true;
	};
	const drawn = JSON.stringify([name, glued]);
	return {
		dom,
		update: (next: PMNode, nextDecorations) =>
			next.type === node.type && JSON.stringify([String(next.attrs.name ?? ''), gluedOf(nextDecorations)]) === drawn
	};
}
