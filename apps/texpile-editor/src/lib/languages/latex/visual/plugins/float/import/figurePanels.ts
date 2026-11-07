import {
	bodyOf,
	type ImportCall,
	type Stretch,
	type TreeArg,
	type TreeEnvironment,
	type TreeImport,
	type Unit
} from '$lib/languages/latex/visual/core/document';
import type { Argument } from '$lib/languages/latex/knowledge/types';
import { rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { commonRegistry } from '$lib/languages/latex/knowledge/registries/registries';
import { captionArgOf, isCaptionCall, isLabelCall } from './captionParts';

type Span = { from: number; to: number };

export type FigurePanel = { graphic: ImportCall; caption: TreeArg | null; label: ImportCall | null; box: Span };
export type FigurePanels = { panels: FigurePanel[]; captions: ImportCall[]; labels: ImportCall[] };

const GRAPHIC = 'includegraphics';

class OpenPanel {
	graphic: ImportCall | null = null;
	caption: TreeArg | null = null;
	captions = 0;
	label: ImportCall | null = null;

	constructor(
		readonly subfloat: boolean,
		readonly box: Span
	) {}

	takeGraphic(call: ImportCall): void {
		this.graphic = call;
	}

	takeLabel(call: ImportCall): void {
		this.label ??= call;
	}

	takeCaption(arg: TreeArg | null): void {
		this.caption = arg;
		this.captions++;
	}
}

function signatureOf(im: TreeImport, call: ImportCall): readonly Argument[] {
	return im.readings.argumentsOf(call.name) ?? [];
}

function subfloatsOf(float: string): Set<string> {
	const counter = float.replace(/\*$/, '');
	return new Set(commonRegistry('counters').flatMap((c) => (c.within === counter ? [c.name] : [])));
}

class PanelReader {
	panels: FigurePanel[] = [];
	captions: ImportCall[] = [];
	labels: ImportCall[] = [];
	refused = false;
	private subfloats: Set<string>;

	constructor(
		private im: TreeImport,
		env: TreeEnvironment,
		private graphics: ImportCall[]
	) {
		this.subfloats = subfloatsOf(env.name);
	}

	private count(s: Span): number {
		return this.graphics.filter((g) => g.from >= s.from && g.from < s.to).length;
	}

	private close(open: OpenPanel): void {
		if (!open.graphic || open.captions > 1) this.refused = true;
		else this.panels.push({ graphic: open.graphic, caption: open.caption, label: open.label, box: open.box });
	}

	private visitCall(call: ImportCall, open: OpenPanel | null): void {
		const im = this.im;
		if (call.name === GRAPHIC) {
			if (open?.graphic) this.refused = true;
			else if (open) open.takeGraphic(call);
			else this.panels.push({ graphic: call, caption: null, label: null, box: call });
			return;
		}
		if (isLabelCall(im, call)) {
			if (!open) this.labels.push(call);
			else open.takeLabel(call);
			return;
		}
		const caption = isCaptionCall(im, call);
		const pictures = this.count(call);
		if (caption && open) {
			// a \caption in a minipage numbers a figure of its own
			if (!open.subfloat) this.refused = true;
			open.takeCaption(captionArgOf(im, call));
			return;
		}
		if (caption && pictures !== 1) {
			if (pictures === 0) this.captions.push(call);
			else this.refused = true;
			return;
		}
		if (!caption && !im.readings.tableKnows(call.name)) {
			if (call.args.some((a) => a.present)) this.refused = true;
			return;
		}
		const panel = !open && pictures === 1 ? new OpenPanel(caption, call) : null;
		if (panel && caption) panel.takeCaption(captionArgOf(im, call));
		const signature = signatureOf(im, call);
		// words in a size are no prose, a picture there is a panel's (\resizebox{\linewidth}{!}{\includegraphics...})
		call.args.forEach((a, i) => {
			if (!a.present || !a.body || signature[i]?.part !== undefined || a === panel?.caption) return;
			if (this.count(a.body) > 0 || rolesOf(signature[i] ?? { kind: 'm' }).includes('text')) this.visit(a.body, panel ?? open);
		});
		if (panel) this.close(panel);
	}

	visit(s: Stretch, open: OpenPanel | null): void {
		for (const u of this.im.core.unitsIn(s)) {
			if (this.refused) return;
			if (u.call) this.visitCall(u.call, open);
			else this.visitPiece(u, open);
		}
	}

	private visitPiece(u: Unit, open: OpenPanel | null): void {
		const p = u.piece;
		if (p.kind === 'word') {
			if (/[\p{L}\p{N}]/u.test(this.im.src.slice(p.from, p.to))) this.refused = true;
			return;
		}
		if (p.kind !== 'node') return;
		if (p.node.name === 'Group') this.visit(bodyOf(p.node), open);
		else if (p.node.name === 'Environment') {
			const inner = this.im.core.environment(p.node);
			const panel = !open && this.count(u) === 1 ? new OpenPanel(this.subfloats.has(inner.name), p) : null;
			this.visit(inner.body, panel ?? open);
			if (panel) this.close(panel);
		} else if (!['Comment', 'ParBreak'].includes(p.node.name)) this.refused = true;
	}
}

export function figurePanelsOf(im: TreeImport, env: TreeEnvironment, graphics: ImportCall[]): FigurePanels | null {
	const reader = new PanelReader(im, env, graphics);
	reader.visit(env.body, null);
	return reader.refused ? null : { panels: reader.panels, captions: reader.captions, labels: reader.labels };
}
