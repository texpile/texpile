// the decorations of a frame's visible range (9.1), as prosemirror-view's viewDecorations finds them
import type { EditorState } from 'prosemirror-state';
import type { Decoration, DecorationAttrs } from 'prosemirror-view';
import type {
	FrameDecorations,
	InlineDecorationView,
	NodeDecorationInput,
	WidgetDecorationView,
	WidgetSpec
} from '../contracts/decorationTypes';
import type { VisualView } from '../contracts/viewTypes';
import { decorationAttrsOf, isInlineDecoration, isWidget, widgetSide } from './decorationAttrs';

const collected = new WeakMap<EditorState, { from: number; to: number; decorations: FrameDecorations }>();

function plainAttrs(attrs: DecorationAttrs): Record<string, string> {
	const plain: Record<string, string> = {};
	for (const [name, value] of Object.entries(attrs)) if (value !== undefined && name !== 'class' && name !== 'style') plain[name] = value;
	return plain;
}

function classesOf(attrs: DecorationAttrs): string[] {
	return (attrs.class ?? '').split(/\s+/).filter(Boolean);
}

function mergeNode(into: NodeDecorationInput | undefined, attrs: DecorationAttrs, spec: unknown): NodeDecorationInput {
	const classes = new Set([...(into?.classes ?? []), ...classesOf(attrs)]);
	const style = [into?.attrs.style, attrs.style].filter(Boolean).join(';');
	const merged: Record<string, string> = { ...plainAttrs(attrs), ...into?.attrs };
	if (style) merged.style = style;
	return { classes, attrs: merged, specs: [...(into?.specs ?? []), spec] };
}

/** the visible range only; memoized on the state object, so several frames of one state collect once */
export function collectDecorations(view: VisualView, from: number, to: number): FrameDecorations {
	const memo = collected.get(view.state);
	if (memo && memo.from === from && memo.to === to) return memo.decorations;
	const found: Decoration[] = [];
	view.someProp('decorations', (f) => {
		f(view.state)?.forEachSet((set) => {
			found.push(...set.find(from, to));
		});
	});
	const inline: InlineDecorationView[] = [];
	const nodes = new Map<number, NodeDecorationInput>();
	const widgets: WidgetDecorationView[] = [];
	for (const decoration of found) {
		const spec = decoration.spec as WidgetSpec & { marks?: WidgetDecorationView['marks'] };
		if (isWidget(decoration))
			widgets.push({
				pos: decoration.from,
				side: widgetSide(decoration),
				key: spec.key,
				spec,
				marks: spec.marks ?? null,
				ignoreSelection: !!spec.ignoreSelection
			});
		else if (isInlineDecoration(decoration)) {
			const attrs = decorationAttrsOf(decoration);
			inline.push({
				from: decoration.from,
				to: decoration.to,
				classes: classesOf(attrs),
				style: attrs.style ?? '',
				attrs: plainAttrs(attrs),
				spec
			});
		} else nodes.set(decoration.from, mergeNode(nodes.get(decoration.from), decorationAttrsOf(decoration), spec));
	}
	const decorations: FrameDecorations = { inline, nodes, widgets };
	collected.set(view.state, { from, to, decorations });
	return decorations;
}
