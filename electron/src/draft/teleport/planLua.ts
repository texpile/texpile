// A teleport plan as the Lua table teleport.lua's serve reads.
import type { LineEdit } from './lineEdit';
import type { Point, TeleportPlan } from './pointIndex';

function luaString(s: string): string {
	let out = '"';
	for (const ch of s) {
		const c = ch.charCodeAt(0);
		if (ch === '\\' || ch === '"') out += '\\' + ch;
		else if (c < 32) out += `\\${c}`;
		else out += ch;
	}
	return out + '"';
}

function luaPoint(p: Point): string {
	const q = p.q ? `,q={${p.q.join(',')}}` : '';
	const moves = p.moves?.length ? `,moves={${p.moves.map((m) => `{f=${luaString(m.f)},after=${m.after},by=${m.by}}`).join(',')}}` : '';
	return `{rec=${luaString(p.rec)},stack={${p.stack.map(([f, l]) => `{f=${luaString(f)},l=${l}}`).join(',')}}${q}${moves}}`;
}

/** `overrides` maps a source file to the root-relative file its text is read from; `stage` is the line where the run
 * records a point for the next edit. `src` is the folder for the run's source snapshots, `cut` the file whose
 * appearance ends the run */
export function planLua(
	plan: TeleportPlan,
	overrides: Map<string, string>,
	file: string,
	edit: LineEdit,
	stage: number,
	srcFiles: string[],
	serve: { src: string; cut: string }
): string {
	const over = [...overrides].map(([rel, from]) => `[${luaString(rel)}]=${luaString(from)}`);
	return (
		`return {chain={${plan.chain.map(luaPoint).join(',')}},stops={${plan.stops.map(luaPoint).join(',')}},` +
		`overrides={${over.join(',')}},edit={f=${luaString(file)},from=${edit.from},oldTo=${edit.oldTo},newTo=${edit.newTo}},` +
		`stage={f=${luaString(file)},l=${stage}},files={${srcFiles.map(luaString).join(',')}},` +
		`src=${luaString(serve.src + '/')},cut=${luaString(serve.cut)}}\n`
	);
}
