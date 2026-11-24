import { describe, expect, it } from 'vitest';
import type { FrameDecorations, InlineDecorationView, StyleLook, WidgetDecorationView } from '$lib/editor/canvas';
import { decorationSignature } from '$lib/editor/canvas/decorations/decorationSignature';
import { fixedStyles } from '../testing/fixedStyles';

const styles = fixedStyles();
const LOOKS: Record<string, StyleLook> = { mention: { padding: '0px 2px' }, 'pm-comment': { backgroundColor: 'rgb(255 204 0 / 0.14)' } };

function inline(from: number, to: number, classes: string[]): InlineDecorationView {
	const look = classes.map((name) => LOOKS[name]).find(Boolean);
	return { from, to, classes, style: '', attrs: {}, spec: look ? { canvasLook: { look } } : {} };
}

function caret(pos: number): WidgetDecorationView {
	const spec = { key: 'caret:7', canvas: { kind: 'caret' as const, peer: { name: 'Ada', color: '#f06292', arrival: 1 } } };
	return { pos, side: 0, key: spec.key, spec, marks: null, ignoreSelection: true };
}

function signatureOf(decorations: Partial<FrameDecorations>): string {
	return decorationSignature({ inline: [], nodes: new Map(), widgets: [], ...decorations }, 0, 40, styles);
}

describe('decorationSignature (9.5)', () => {
	// a peer typing next door relaid the paragraph its caret sat in on every move
	it('leaves a peer caret and a comment tint out of the layout key', () => {
		expect(signatureOf({ widgets: [caret(5)], inline: [inline(2, 9, ['pm-range', 'pm-comment'])] })).toBe('');
	});

	it('keys the layout on a decoration that pads its words', () => {
		expect(signatureOf({ inline: [inline(2, 9, ['mention'])] })).not.toBe(signatureOf({ inline: [inline(2, 10, ['mention'])] }));
	});
});
