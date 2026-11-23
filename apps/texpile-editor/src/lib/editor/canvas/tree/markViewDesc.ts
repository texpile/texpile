// prosemirror-view's MarkViewDesc: a mark's view or its toDOM, as run chain levels from dom down to contentDOM
import type { Mark } from 'prosemirror-model';
import type { CanvasBuildHelpers, CanvasMarkView, CanvasMarkViews } from '../contracts/nodeViewTypes';
import type { RunChain, RunChainLevel } from '../contracts/styleTypes';
import type { VisualView } from '../contracts/viewTypes';
import { inBuild } from '../views/buildScope';
import { renderFaceSpec } from './faceDocument';
import type { FaceElement } from './faceElement';

export type LevelOfChain = { readonly key: string; readonly level: RunChainLevel };

function markKey(mark: Mark): string {
	return `${mark.type.name}${JSON.stringify(mark.attrs)}`;
}

export function levelOfElement(el: FaceElement): RunChainLevel {
	const attrs: Record<string, string> = {};
	for (const name of el.getAttributeNames()) if (name !== 'class') attrs[name] = el.getAttribute(name)!;
	return { tag: el.tagName.toLowerCase(), classes: [...el.classList], attrs, hovered: false };
}

export function chainOf(levels: readonly LevelOfChain[]): RunChain {
	return { key: levels.map((level) => level.key).join('|'), levels: levels.map((level) => level.level) };
}

export class MarkViewDesc {
	/** outermost first */
	readonly levels: readonly LevelOfChain[];

	private constructor(
		readonly mark: Mark,
		/** null: a mark without toDOM, drawn as its text alone */
		readonly dom: FaceElement | null,
		readonly contentDOM: FaceElement | null,
		readonly spec: CanvasMarkView | null
	) {
		const key = markKey(mark);
		const levels: LevelOfChain[] = [];
		for (let at: FaceElement | null = dom; at; at = at === contentDOM ? null : (at.firstElementChild ?? null))
			levels.push({ key: `${key}:${levels.length}`, level: levelOfElement(at) });
		this.levels = levels;
	}

	static create(mark: Mark, inline: boolean, views: MarkViewDescs): MarkViewDesc {
		const custom = views.constructorOf(mark);
		if (custom) {
			const spec = views.build(() => custom(mark, views.view!, inline));
			return new MarkViewDesc(mark, spec.dom, spec.contentDOM ?? null, spec);
		}
		const toDom = mark.type.spec.toDOM;
		if (!toDom) return new MarkViewDesc(mark, null, null, null);
		const { dom, contentDOM } = renderFaceSpec(toDom(mark, inline));
		return new MarkViewDesc(mark, dom, contentDOM, null);
	}

	destroy(): void {
		this.spec?.destroy?.();
	}
}

/** a view's mark views, one per mark (type and attrs) for every run that wears it: a mark view only describes a look */
export class MarkViewDescs {
	private readonly descs = new Map<string, MarkViewDesc>();

	constructor(
		private readonly markViews: CanvasMarkViews = {},
		readonly view: VisualView | null = null,
		private readonly tools: (() => CanvasBuildHelpers) | null = null
	) {}

	/** the same view's mark views from another markViews prop */
	withViews(markViews: CanvasMarkViews | undefined): MarkViewDescs {
		return new MarkViewDescs(markViews, this.view, this.tools);
	}

	constructorOf(mark: Mark) {
		return this.view ? (this.markViews[mark.type.name] ?? null) : null;
	}

	build<T>(run: () => T): T {
		return this.tools ? inBuild(this.tools(), run) : run();
	}

	levelsOf(mark: Mark): readonly LevelOfChain[] {
		const key = markKey(mark);
		let desc = this.descs.get(key);
		if (!desc) this.descs.set(key, (desc = MarkViewDesc.create(mark, true, this)));
		return desc.levels;
	}

	/** the marks around an inline node as prosemirror-view nests them; null without marks */
	chainOf(marks: readonly Mark[]): RunChain | null {
		return marks.length ? chainOf(marks.flatMap((mark) => this.levelsOf(mark))) : null;
	}

	destroy(): void {
		for (const desc of this.descs.values()) desc.destroy();
		this.descs.clear();
	}
}

/** marks drawn from their toDOM alone, for layouts handed no view's mark views */
export const TO_DOM_MARKS = new MarkViewDescs();
