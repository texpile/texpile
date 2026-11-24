// the one reader of prosemirror-view's decoration internals, pinned to 1.42.9 (decorationAttrs.test.ts)
import type { Node as PMNode } from 'prosemirror-model';
import type { Decoration, DecorationAttrs, DecorationSource } from 'prosemirror-view';

type DecorationInternals = Decoration & {
	readonly inline: boolean;
	readonly widget: boolean;
	readonly type: { attrs?: DecorationAttrs; side?: number; eq(other: unknown): boolean };
	copy(from: number, to: number): Decoration;
};
type SourceInternals = DecorationSource & {
	locals(node: PMNode): readonly Decoration[];
	eq(other: DecorationSource): boolean;
};

function internalsOf(decoration: Decoration): DecorationInternals {
	return decoration as DecorationInternals;
}

function sourceInternals(source: DecorationSource): SourceInternals {
	return source as SourceInternals;
}

export function isWidget(decoration: Decoration): boolean {
	return internalsOf(decoration).widget;
}

export function isInlineDecoration(decoration: Decoration): boolean {
	return internalsOf(decoration).inline;
}

export function widgetSide(decoration: Decoration): number {
	return internalsOf(decoration).type.side ?? 0;
}

/** the attrs an inline or node decoration was made with; a widget has none */
export function decorationAttrsOf(decoration: Decoration): DecorationAttrs {
	return internalsOf(decoration).type.attrs ?? {};
}

/** the same decoration over another range, as prosemirror-view's own splits make it */
export function copyDecoration(decoration: Decoration, from: number, to: number): Decoration {
	return internalsOf(decoration).copy(from, to);
}

export function sameDecorationType(a: Decoration, b: Decoration): boolean {
	return internalsOf(a).type.eq(internalsOf(b).type);
}

/** the decorations a source holds directly on a node, not on its descendants */
export function localDecorations(source: DecorationSource, node: PMNode): readonly Decoration[] {
	return sourceInternals(source).locals(node);
}

export function sameDecorationSource(a: DecorationSource, b: DecorationSource): boolean {
	return a === b || sourceInternals(a).eq(b);
}
