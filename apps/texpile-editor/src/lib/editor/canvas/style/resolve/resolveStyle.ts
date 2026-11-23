// declarations in cascade order plus the parent's computed values into one element's computed values, CSS's way
import { parseColor } from './colorValue';
import { computeValue, reportDropped, type ComputeContext, type Declaration } from './declaredValues';
import { isCssWide } from './shorthands';
import { LONGHAND_INDEX, LONGHANDS } from './styleProperties';

/** one computed string per longhand, in LONGHANDS order */
export type ComputedValues = readonly string[];
export type ResolveEnvironment = Pick<ComputeContext, 'remPx' | 'viewport'>;

function at(name: string): number {
	return LONGHAND_INDEX.get(name)!;
}

const FONT_SIZE = at('fontSize');
const COLOR = at('color');
const FONT_WEIGHT = at('fontWeight');
const DISPLAY = at('display');
const POSITION = at('position');
const FLOAT = at('float');
const MIN_SIZES = [at('minWidth'), at('minHeight')];
const BORDERS = (['Top', 'Right', 'Bottom', 'Left'] as const).map((side) => [at(`border${side}Width`), at(`border${side}Style`)]);
const OUTLINE = [at('outlineWidth'), at('outlineStyle')];
/** font size first (em), then color (currentColor), then the rest */
const ORDER = [FONT_SIZE, COLOR, ...LONGHANDS.keys()].filter((index, i, all) => all.indexOf(index) === i);
const BLACK = { r: 0, g: 0, b: 0, a: 1 };

const INITIAL: ComputedValues = LONGHANDS.map((spec) => spec.initial);

const BLOCKIFIED: Record<string, string> = {
	inline: 'block',
	'inline-block': 'block',
	'inline-flex': 'flex',
	'inline-grid': 'grid',
	'inline-table': 'table',
	'table-row-group': 'block',
	'table-header-group': 'block',
	'table-footer-group': 'block',
	'table-row': 'block',
	'table-cell': 'block',
	'table-caption': 'block',
	'table-column': 'block',
	'table-column-group': 'block'
};

function winners(declarations: readonly (readonly Declaration[])[]): (string | undefined)[] {
	const won = new Array<string | undefined>(LONGHANDS.length);
	for (const list of declarations) for (const [index, value] of list) won[index] = value;
	return won;
}

/** float, absolute position and a flex or grid parent make the box a block, as the engines compute display */
function blockify(draft: string[], parent: ComputedValues | null): void {
	const parentDisplay = parent?.[DISPLAY] ?? 'block';
	const item = /flex|grid/.test(parentDisplay);
	const out = draft[FLOAT] !== 'none' || draft[POSITION] === 'absolute' || draft[POSITION] === 'fixed';
	if (item || out) draft[DISPLAY] = BLOCKIFIED[draft[DISPLAY]] ?? draft[DISPLAY];
}

/** what the engines compute from other values: no border or outline without a style, min sizes of a hidden subtree */
function finish(draft: string[], parent: ComputedValues | null): void {
	blockify(draft, parent);
	for (const [width, style] of [...BORDERS, OUTLINE]) if (draft[style] === 'none' || draft[style] === 'hidden') draft[width] = '0px';
	for (const index of MIN_SIZES) if (draft[index] === 'auto') draft[index] = '0px';
}

export function resolveValues(
	declarations: readonly (readonly Declaration[])[],
	parent: ComputedValues | null,
	env: ResolveEnvironment
): string[] {
	const won = winners(declarations);
	const base = parent ?? INITIAL;
	const parentFontPx = parseFloat(base[FONT_SIZE]);
	const ctx: ComputeContext = {
		...env,
		parentFontPx,
		fontPx: parentFontPx,
		parentColor: parseColor(base[COLOR]) ?? BLACK,
		parentWeight: parseFloat(base[FONT_WEIGHT])
	};
	const values = new Array<string>(LONGHANDS.length);
	for (const index of ORDER) {
		const spec = LONGHANDS[index];
		let text = won[index];
		if (text === undefined || text === 'unset' || text === 'revert' || text === 'revert-layer')
			text = spec.inherited ? 'inherit' : 'initial';
		if (text === 'inherit') values[index] = parent ? parent[index] : INITIAL[index];
		else if (text === 'initial' || isCssWide(text)) values[index] = INITIAL[index];
		else {
			const computed = computeValue(spec, text, ctx);
			if (computed === null) reportDropped(`${spec.css}: ${text}, outside the canvas value set,`);
			values[index] = computed ?? (spec.inherited && parent ? parent[index] : INITIAL[index]);
		}
		if (index === FONT_SIZE) ctx.fontPx = parseFloat(values[index]);
	}
	finish(values, parent);
	return values;
}
