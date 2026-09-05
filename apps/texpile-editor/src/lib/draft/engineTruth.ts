// Engine-announced facts about the current document, consulted by the decision layer
// (heuristics/) instead of assuming LaTeX defaults. Everything here came from the real
// engine -- the warm daemon's announce or the full compile's sidecars; a missing fact
// falls back to the standard-LaTeX assumption it replaces; the result must still pass
// the same exactness checks and is refused when it does not.

/** one stepcounter/setcounter snapshot: source line, input-file basename, values after */
export type CounterSnap = { l: number; f?: string; s: Record<string, number> };

export type EngineTruth = {
	/** env names carrying a \ftype@ in THIS preamble: the real float set, \newfloat included */
	floats?: ReadonlySet<string>;
	/** catcodes of ASCII 0..127 in the warmed document's table */
	catcodes?: number[];
	/** counter snapshots from the last full compile, in execution order */
	counters?: CounterSnap[];
	/** the line \begin{document} executed at, in the main file */
	bodyLine?: number;
	/** root-relative main file the compile ran on (bodyLine/counters belong to its project) */
	mainRel?: string;
};

let truth: EngineTruth = {};

export function engineTruth(): EngineTruth {
	return truth;
}
export function updateEngineTruth(t: Partial<EngineTruth>): void {
	truth = { ...truth, ...t };
}
export function resetEngineTruth(): void {
	truth = {};
}

/** is env a float in this document? falls back to the two floats every class defines */
export function isFloatEnv(env: string): boolean {
	const name = env.replace(/\*$/, '');
	return truth.floats ? truth.floats.has(name) : name === 'table' || name === 'figure';
}

function baseOf(p: string): string {
	return p.replace(/\\/g, '/').split('/').pop()!.toLowerCase();
}

/** the value `name` had just BEFORE `line` of `file` at the last compile, or null */
export function counterBefore(name: string, line: number, file?: string): number | null {
	const cs = truth.counters;
	if (!cs?.length) return null;
	const want = file ? baseOf(file) : truth.mainRel ? baseOf(truth.mainRel) : undefined;
	let v: number | null = null;
	// execution order: the last snapshot the engine took before reaching this source point
	for (const c of cs) {
		if (want && c.f && c.f !== want) continue;
		if (c.l >= line) continue;
		if (c.s[name] !== undefined) v = c.s[name];
	}
	return v;
}

/** the \begin{document} line, valid only for the file the compile ran on */
export function bodyLineFor(file?: string): number | null {
	if (truth.bodyLine === undefined) return null;
	if (file && truth.mainRel && baseOf(file) !== baseOf(truth.mainRel)) return null;
	return truth.bodyLine;
}

export type LexCats = {
	comment: ReadonlySet<number>;
	bgroup: ReadonlySet<number>;
	egroup: ReadonlySet<number>;
	math: ReadonlySet<number>;
	escape: ReadonlySet<number>;
};
const STANDARD: LexCats = {
	comment: new Set([0x25]),
	bgroup: new Set([0x7b]),
	egroup: new Set([0x7d]),
	math: new Set([0x24]),
	escape: new Set([0x5c])
};
let lexCache: { src: number[] | undefined; cats: LexCats } = { src: undefined, cats: STANDARD };

/** which chars comment/group/math/escape in this document -- the engine's table, not TeX defaults */
export function lexCats(): LexCats {
	const cc = truth.catcodes;
	if (!cc) return STANDARD;
	if (lexCache.src === cc) return lexCache.cats;
	function pick(cat: number) {
		const s = new Set<number>();
		for (let c = 0; c < cc!.length; c++) if (cc![c] === cat) s.add(c);
		return s;
	}
	const cats: LexCats = { escape: pick(0), bgroup: pick(1), egroup: pick(2), math: pick(3), comment: pick(14) };
	lexCache = { src: cc, cats };
	return cats;
}
