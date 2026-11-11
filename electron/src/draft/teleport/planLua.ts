// A teleport plan as the Lua table teleport.lua's serve reads.
import type { LineEdit } from './lineEdit';
import type { Point, TeleportPlan } from './pointIndex';

function luaString(s: string): string {
	let out = '"';
	for (const ch of s) {
		const c = ch.charCodeAt(0);
		if (ch === '\\' || ch === '"') out += '\\' + ch;
		// three digits: Lua reads up to three, so `\9` before a digit would take it in
		else if (c < 32) out += `\\${String(c).padStart(3, '0')}`;
		else out += ch;
	}
	return out + '"';
}

/** a source file read from another file, or from its text as the plan carries it */
export type PlanOverride = string | { text: string };

function luaPoint(p: Point): string {
	const q = p.q ? `,q={${p.q.join(',')}}` : '';
	const moves = p.moves?.length ? `,moves={${p.moves.map((m) => `{f=${luaString(m.f)},after=${m.after},by=${m.by}}`).join(',')}}` : '';
	return `{rec=${luaString(p.rec)},stack={${p.stack.map(([f, l]) => `{f=${luaString(f)},l=${l}}`).join(',')}}${q}${moves}}`;
}

/** `overrides` maps a source file to the root-relative file its text is read from, or to the text; `stage` is the line
 * where the run records a point for the next edit. `src` is the folder for the run's source snapshots, `cut` the file
 * whose appearance ends the run, `reship` the first page a cut run left on screen. One line, sent on the engine's stdin */
export function planLua(
	plan: TeleportPlan,
	overrides: Map<string, PlanOverride>,
	file: string,
	edit: LineEdit,
	stage: number,
	srcFiles: string[],
	serve: { src: string; cut: string; reship?: number },
	images?: string
): string {
	const over = [...overrides].map(
		([rel, from]) => `[${luaString(rel)}]=${typeof from === 'string' ? luaString(from) : `{text=${luaString(from.text)}}`}`
	);
	return (
		`return {chain={${plan.chain.map(luaPoint).join(',')}},stops={${plan.stops.map(luaPoint).join(',')}},` +
		`overrides={${over.join(',')}},edit={f=${luaString(file)},from=${edit.from},oldTo=${edit.oldTo},newTo=${edit.newTo}},` +
		`stage={f=${luaString(file)},l=${stage}},files={${srcFiles.map(luaString).join(',')}},` +
		`src=${luaString(serve.src + '/')},cut=${luaString(serve.cut)}${serve.reship === undefined ? '' : `,reship=${serve.reship}`}` +
		`${images ? `,images=${luaString(images)}` : ''}}`
	);
}
