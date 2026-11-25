// the canvas's own styles: the base, each element's declared style, its state deltas and what it inherits, resolved
import type {
	CanvasStyles,
	ComputedStyle,
	ElementState,
	Rgba,
	RunChain,
	RunChainLevel,
	RunStyle,
	StyleBase,
	StyleLook,
	ThemeToken,
	ThemeTokenText
} from '../contracts/styleTypes';
import { faceMutationCount, FaceElement } from '../tree/faceElement';
import { parseColor, TRANSPARENT } from './resolve/colorValue';
import { DeclaredValues, reportInvalid, substituteTokens, UNSET_TOKEN, type Declaration } from './resolve/declaredValues';
import { StyleValues } from './resolve/internStyle';
import { resolveValues, type ResolveEnvironment } from './resolve/resolveStyle';
import { RunKeys, runStyleOf } from './resolve/runStyle';

export type CanvasStylesOptions = {
	readonly base: StyleBase;
	readonly tokens: ThemeTokenText;
	/** styleEpoch.ts's two epochs */
	readonly epochs?: { readonly epoch: number; readonly paintEpoch: number };
	readonly remPx?: () => number;
	/** for vw and vh; a change needs a layout epoch */
	readonly viewport?: () => { readonly width: number; readonly height: number };
	/** a style read again under new epochs lays out differently (styleEpoch.ts's layout bump) */
	readonly layoutChanged?: () => void;
	/** the scheme a look's light-dark() takes its side from; a switch is a theme bump, which clears the parses */
	readonly dark?: () => boolean;
};

type PseudoPart = 'before' | 'after' | 'marker';
type ElementEntry = {
	readonly epochs: number;
	readonly version: number;
	readonly parent: number;
	readonly states: number;
	readonly selected: boolean;
	readonly node: StyleLook | null;
	readonly deltas: FaceElement['states'];
	readonly style: ComputedStyle;
	/** the stamp it was last checked at */
	checked: number;
};

const STATE_BITS: Record<ElementState, number> = { hover: 1, focusWithin: 2, active: 4 };
const STATE_ORDER: readonly ElementState[] = ['hover', 'focusWithin', 'active'];
const GENERATED: Record<PseudoPart, 'generatedBefore' | 'generatedAfter' | 'generatedMarker'> = {
	before: 'generatedBefore',
	after: 'generatedAfter',
	marker: 'generatedMarker'
};

export class CanvasStyleResolver implements CanvasStyles {
	private readonly values = new StyleValues();
	private readonly declared: DeclaredValues;
	private readonly env: ResolveEnvironment;
	/** by parent style id and declared key: plain paragraphs under one parent resolve once */
	private readonly resolved = new Map<string, ComputedStyle>();
	private readonly elements = new WeakMap<FaceElement, ElementEntry>();
	private readonly stateBits = new WeakMap<FaceElement, number>();
	private readonly selected = new WeakSet<FaceElement>();
	/** a generated part's host: it inherits from the element that wrote it */
	private readonly hosts = new WeakMap<FaceElement, FaceElement>();
	private readonly lookKeys = new WeakMap<StyleLook, string>();
	private readonly runs = new Map<string, RunStyle>();
	private readonly runKeys = new RunKeys();
	private readonly tokens = new Map<string, Rgba>();
	/** where a style or a run was resolved, so a repaint under a new epoch resolves it again */
	private readonly styleSources = new WeakMap<ComputedStyle, FaceElement>();
	private readonly roots = new WeakSet<ComputedStyle>();
	private readonly runSources = new WeakMap<RunStyle, { block: FaceElement; chain: RunChain }>();
	/** what was resolved under the current epochs, which a repaint keeps */
	private resolvedNow = new WeakSet<object>();
	private layoutSeen = -1;
	private paintSeen = -1;
	/** bumped when either epoch moves */
	private generation = 0;
	/** state and selection changes, which mutate no element */
	private changes = 0;
	private stamps = 0;
	private stampedAt = { mutations: -1, changes: -1, generation: -1 };
	private root: ComputedStyle | null = null;

	constructor(private readonly options: CanvasStylesOptions) {
		this.declared = new DeclaredValues(options.tokens, options.dark);
		const viewport = options.viewport ?? (() => ({ width: 1280, height: 800 }));
		const remPx = options.remPx ?? (() => 16);
		this.env = {
			get remPx() {
				return remPx();
			},
			get viewport() {
				return viewport();
			}
		};
	}

	get epoch(): number {
		return this.options.epochs?.epoch ?? 0;
	}

	get paintEpoch(): number {
		return this.options.epochs?.paintEpoch ?? 0;
	}

	rootStyle(): ComputedStyle {
		this.sync();
		if (!this.root) {
			this.root = this.resolve(null, [this.declared.look(this.options.base.root())], 'root');
			this.roots.add(this.root);
			this.resolvedNow.add(this.root);
		}
		return this.root;
	}

	styleOf(el: FaceElement, pseudo?: PseudoPart): ComputedStyle | null {
		if (pseudo) {
			const part = el[GENERATED[pseudo]];
			if (!part) return null;
			this.hosts.set(part, el);
			return this.styleOf(part);
		}
		const epochs = this.sync();
		const known = this.elements.get(el);
		const stamp = this.stamp();
		if (known && known.checked === stamp) return known.style;
		const parent = this.parentStyleOf(el);
		const states = (this.stateBits.get(el) ?? 0) | (el.statesFrom ? (this.stateBits.get(el.statesFrom) ?? 0) : 0);
		const selected = this.selected.has(el);
		const node = this.options.base.node(el);
		const entry = known;
		if (
			entry?.epochs === epochs &&
			entry.version === el.version &&
			entry.parent === parent.id &&
			entry.states === states &&
			entry.selected === selected &&
			entry.node === node &&
			entry.deltas === el.states
		) {
			entry.checked = stamp;
			return entry.style;
		}
		const style = this.elementStyle(el, parent, node, states, selected);
		this.elements.set(el, {
			epochs,
			version: el.version,
			parent: parent.id,
			states,
			selected,
			node,
			deltas: el.states,
			style,
			checked: stamp
		});
		this.styleSources.set(style, el);
		this.resolvedNow.add(style);
		return style;
	}

	runStyle(block: FaceElement, chain: RunChain): RunStyle {
		const blockStyle = this.styleOf(block)!;
		let hovered = '';
		for (const level of chain.levels) hovered += level.hovered ? '1' : '0';
		const key = `${blockStyle.id}|${chain.key}|${hovered}`;
		let run = this.runs.get(key);
		if (!run) {
			this.runs.set(key, (run = runStyleOf(blockStyle, this.levelStyles(blockStyle, chain.levels), this.runKeys)));
			this.runSources.set(run, { block, chain });
			this.resolvedNow.add(run);
		}
		return run;
	}

	/** the style resolved again under the current epochs, from the element it was last resolved for (the painter's
	 *  styles of a layout made before a theme switch); one whose layout half moved calls layoutChanged */
	current(style: ComputedStyle): ComputedStyle {
		this.sync();
		if (this.resolvedNow.has(style)) return style;
		const el = this.styleSources.get(style);
		const fresh = el ? this.styleOf(el) : this.roots.has(style) ? this.rootStyle() : null;
		if (!fresh) return style;
		if (fresh.layoutId !== style.layoutId) this.options.layoutChanged?.();
		return fresh;
	}

	currentRun(run: RunStyle): RunStyle {
		this.sync();
		if (this.resolvedNow.has(run)) return run;
		const source = this.runSources.get(run);
		if (!source) return run;
		const fresh = this.runStyle(source.block, source.chain);
		if (fresh.layoutKey !== run.layoutKey) this.options.layoutChanged?.();
		return fresh;
	}

	/** state chains run up to the root: a hovered element's ancestors are hovered too */
	setState(el: FaceElement, state: ElementState, on: boolean): void {
		this.changes++;
		const bit = STATE_BITS[state];
		for (let at: FaceElement | null = el; at; at = at.parentNode instanceof FaceElement ? at.parentNode : null) {
			const bits = this.stateBits.get(at) ?? 0;
			this.stateBits.set(at, on ? bits | bit : bits & ~bit);
		}
	}

	/** the default selectNode: the base's selected-node look on the view's dom */
	markSelectedNode(el: FaceElement, on: boolean): void {
		this.changes++;
		if (on) this.selected.add(el);
		else this.selected.delete(el);
	}

	token(name: ThemeToken): Rgba {
		this.sync();
		let color = this.tokens.get(name);
		if (!color) {
			const text = substituteTokens(`var(${name})`, this.options.tokens);
			const parsed = text === null || text === UNSET_TOKEN ? null : parseColor(text, this.rootStyle().paint.color);
			if (!parsed && text !== UNSET_TOKEN) reportInvalid(`${name} is not a color`);
			this.tokens.set(name, (color = parsed ?? TRANSPARENT));
		}
		return color;
	}

	/** interned values outlive an epoch, so unchanged styles keep their ids */
	private sync(): number {
		const { epoch, paintEpoch } = this;
		if (epoch !== this.layoutSeen || paintEpoch !== this.paintSeen) {
			this.layoutSeen = epoch;
			this.paintSeen = paintEpoch;
			this.generation++;
			this.declared.clear();
			this.resolved.clear();
			this.runs.clear();
			this.tokens.clear();
			this.root = null;
			this.resolvedNow = new WeakSet();
		}
		return this.generation;
	}

	/** what a style checked at an equal stamp cannot have missed: epochs, element mutations, states, selection */
	private stamp(): number {
		const mutations = faceMutationCount();
		if (
			mutations !== this.stampedAt.mutations ||
			this.changes !== this.stampedAt.changes ||
			this.generation !== this.stampedAt.generation
		) {
			this.stampedAt = { mutations, changes: this.changes, generation: this.generation };
			this.stamps++;
		}
		return this.stamps;
	}

	private parentStyleOf(el: FaceElement): ComputedStyle {
		const parent = el.parentNode instanceof FaceElement ? el.parentNode : this.hosts.get(el);
		const parentStyle = parent ? this.styleOf(parent)! : this.rootStyle();
		return el.marks?.levels.length ? this.levelStyles(parentStyle, el.marks.levels).at(-1)! : parentStyle;
	}

	private elementStyle(el: FaceElement, parent: ComputedStyle, node: StyleLook | null, states: number, selected: boolean): ComputedStyle {
		const { base } = this.options;
		const looks: (StyleLook | null)[] = [base.tag(el.tagName.toLowerCase()), node];
		const inline = el.getAttribute('style') ?? '';
		const deltas: (StyleLook | null)[] = [];
		if (states && el.states) for (const state of STATE_ORDER) if (states & STATE_BITS[state]) deltas.push(el.states[state] ?? null);
		if (selected) deltas.push(base.selectedNode(el));
		const key = [...looks, ...deltas].map((look) => this.lookKey(look)).join('\u0002') + `\u0002${inline}`;
		const declarations = [
			...looks.map((look) => this.lookOf(look)),
			this.declared.inline(inline),
			...deltas.map((look) => this.lookOf(look))
		];
		return this.resolve(parent, declarations, key);
	}

	private levelStyles(outer: ComputedStyle, levels: readonly RunChainLevel[]): ComputedStyle[] {
		const styles: ComputedStyle[] = [];
		let parent = outer;
		for (const level of levels) {
			const tagLook = this.options.base.tag(level.tag.toLowerCase());
			const looks = [tagLook, level.look ?? null, level.hovered ? (level.hoverLook ?? null) : null];
			const inline = level.attrs.style ?? '';
			const key = `${looks.map((look) => this.lookKey(look)).join('\u0002')}\u0002${inline}`;
			const declarations = [this.lookOf(tagLook), this.declared.inline(inline), this.lookOf(looks[1]), this.lookOf(looks[2])];
			styles.push((parent = this.resolve(parent, declarations, key)));
		}
		return styles;
	}

	private resolve(parent: ComputedStyle | null, declarations: readonly (readonly Declaration[])[], key: string): ComputedStyle {
		const cacheKey = `${parent?.id ?? 0}\u0003${key}`;
		let style = this.resolved.get(cacheKey);
		if (!style) {
			const values = resolveValues(declarations, parent && this.values.valuesOf(parent), this.env);
			this.resolved.set(cacheKey, (style = this.values.intern(values)));
		}
		return style;
	}

	private lookOf(look: StyleLook | null): readonly Declaration[] {
		return look ? this.declared.look(look) : [];
	}

	private lookKey(look: StyleLook | null): string {
		if (!look) return '';
		let key = this.lookKeys.get(look);
		if (key === undefined) this.lookKeys.set(look, (key = JSON.stringify(look)));
		return key;
	}
}
