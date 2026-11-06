// The points a run recorded, in document order, and the source text they were recorded against. A teleport starts
// at the last point before an edit and may stop at any point after it.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LineEdit } from './lineEdit';

// q: where the page stood, so a stop that cannot match is passed without a diff. moves: the edits that moved the
// point's lines since it was recorded, which the source lines in its record still lack
export type LineMove = { f: string; after: number; by: number };
export type Point = {
	rec: string;
	stack: [string, number][];
	shipped: number;
	open: boolean;
	refuse?: boolean;
	q?: number[];
	moves?: LineMove[];
};
// a body file opened after the point before it
export type IndexEntry = { point: Point } | { enter: string };

export type TeleportPlan = { start: number; chain: Point[]; stops: Point[] };

function keyOf(stack: [string, number][]): string {
	return stack.map(([f, l]) => `${f}:${l}`).join('>');
}

export function readIndexFile(file: string): IndexEntry[] {
	let text: string;
	try {
		text = fs.readFileSync(file, 'utf8');
	} catch {
		return [];
	}
	const out: IndexEntry[] = [];
	for (const line of text.split('\n')) {
		if (!line) continue;
		try {
			const e = JSON.parse(line);
			if (typeof e.enter === 'string') out.push({ enter: e.enter });
			else if (Array.isArray(e.stack))
				out.push({
					point: {
						rec: e.file,
						stack: e.stack,
						shipped: e.shipped,
						open: !!e.open,
						...(e.refuse ? { refuse: true } : {}),
						...(e.q ? { q: e.q } : {})
					}
				});
		} catch {
			/* a line cut off by a killed run */
		}
	}
	return out;
}

/** a point past an edit, at its line after the edit, remembering the move for the source lines in its record */
function lineMoved(p: Point, file: string, edit: LineEdit): Point {
	const by = edit.newTo - edit.oldTo;
	return {
		...p,
		stack: p.stack.map(([f, l]) => [f, f === file && l > edit.oldTo ? l + by : l] as [string, number]),
		...(by ? { moves: [...(p.moves ?? []), { f: file, after: edit.oldTo, by }] } : {})
	};
}

export class PointIndex {
	/** where each source file's text, as the points saw it, is kept */
	readonly basis = new Map<string, string>();
	/** the fonts the recording loaded after its base, root-relative */
	fontList?: string;

	constructor(
		public entries: IndexEntry[],
		readonly mainRel: string,
		/** the main file's \begin{document} line: an edit at or above it changes the base */
		readonly bodyLine: number,
		/** project files read before the base, and their sizes and times when the recording run read them */
		readonly preFiles: string[],
		readonly preStamp: string,
		/** the files the recording run read at \begin{document} (aux, toc, bbl), which every teleport reads too */
		readonly seedDir: string
	) {}

	text(rel: string): string | null {
		const p = this.basis.get(rel);
		if (!p) return null;
		try {
			return fs.readFileSync(p, 'utf8');
		} catch {
			return null;
		}
	}

	/** the source snapshots a run wrote become the basis of the files it read */
	adoptBasis(src: string): void {
		const walk = (dir: string, rel: string): void => {
			let entries: fs.Dirent[];
			try {
				entries = fs.readdirSync(dir, { withFileTypes: true });
			} catch {
				return;
			}
			for (const e of entries) {
				const r = rel ? `${rel}/${e.name}` : e.name;
				if (e.isDirectory()) walk(path.join(dir, e.name), r);
				else this.basis.set(r, path.join(dir, e.name));
			}
		};
		walk(src, '');
	}

	/** null when the file is not read after the base, or no point before the edit can be entered */
	planFor(file: string, edit: LineEdit): TeleportPlan | null {
		const opened = new Map<string, Point>();
		let entered = file === this.mainRel;
		let best = -1;
		let chain: Point[] | null = null;
		// the first entry past the edit: only points from here on can be stops
		let cut = this.entries.length;
		for (let i = 0; i < this.entries.length; i++) {
			const e = this.entries[i];
			if ('enter' in e) {
				if (e.enter === file) entered = true;
				continue;
			}
			const p = e.point;
			const last = p.stack.length - 1;
			const here = p.stack.findIndex(([f]) => f === file) >= 0;
			// a level holding the edited file is fine while it has not read the edited lines: the innermost level is
			// about to read its line, an outer one is in the middle of its line
			if ((here && p.stack.some(([f, l], k) => f === file && (k === last ? l > edit.from : l >= edit.from))) || (!here && entered)) {
				cut = i;
				break;
			}
			if (p.open) opened.set(keyOf(p.stack), p);
			if (p.refuse) continue;
			const c: Point[] = [];
			for (let j = 1; j <= last && c.length === j - 1; j++) {
				const outer = opened.get(keyOf(p.stack.slice(0, j)));
				if (outer && !outer.refuse) c.push(outer);
			}
			if (c.length !== last) continue;
			c.push(p);
			best = i;
			chain = c;
		}
		// a file the run never reads has nothing to show
		if (!entered && file !== this.mainRel) return null;
		// a stop sits after the edit: one before it would match before the edit is read. No point before the edit: the
		// run starts at the base, which is where every engine waits
		const starts = new Set((chain ?? []).map((p) => keyOf(p.stack)));
		const stops: Point[] = [];
		for (let i = cut; i < this.entries.length; i++) {
			const e = this.entries[i];
			if ('point' in e && !starts.has(keyOf(e.point.stack))) stops.push(e.point);
		}
		return { start: best, chain: chain ?? [], stops };
	}

	/** a run cut short: its points before the edit hold for the old text too, and go in after the start */
	keepBefore(plan: TeleportPlan, file: string, edit: LineEdit, run: IndexEntry[]): void {
		const startStack = plan.chain[plan.chain.length - 1]?.stack ?? [];
		let entered = file === this.mainRel || startStack.some(([f]) => f === file);
		const kept: IndexEntry[] = [];
		for (const e of run) {
			if ('enter' in e) {
				if (e.enter === file) entered = true;
				continue;
			}
			const last = e.point.stack.length - 1;
			const here = e.point.stack.some(([f]) => f === file);
			if (here ? e.point.stack.some(([f, l], k) => f === file && (k === last ? l > edit.from : l >= edit.from)) : entered) break;
			kept.push(e);
		}
		this.entries = [...this.entries.slice(0, plan.start + 1), ...kept, ...this.entries.slice(plan.start + 1)];
	}

	/** after a teleport: the points before its start, the run's own, then from the matched old point on, moved by the edit */
	merge(plan: TeleportPlan, file: string, edit: LineEdit, run: IndexEntry[], stopRec: string | null): void {
		const head = this.entries.slice(0, plan.start + 1);
		let tail: IndexEntry[] = [];
		if (stopRec) {
			const k = this.entries.findIndex((e) => 'point' in e && e.point.rec === stopRec);
			if (k >= 0) tail = this.entries.slice(k);
			// a run that matched mid-page wrote the point again, with the edit's line numbers in its nodes
			const last = run[run.length - 1];
			if (
				k >= 0 &&
				last &&
				'point' in last &&
				keyOf(last.point.stack) === keyOf(lineMoved((tail[0] as { point: Point }).point, file, edit).stack)
			)
				tail = tail.slice(1);
		}
		const moved: IndexEntry[] = [];
		for (const e of tail) {
			if ('enter' in e) moved.push(e);
			else if (!e.point.stack.some(([f, l]) => f === file && l >= edit.from && l <= edit.oldTo))
				moved.push({ point: lineMoved(e.point, file, edit) });
		}
		this.entries = [...head, ...run, ...moved];
	}

	/** the engine folders this index still reads from */
	folders(): Set<string> {
		const out = new Set<string>();
		function add(p: string): void {
			const m = /(?:^|\/)_draft\/([^/]+)\//.exec(p.replace(/\\/g, '/'));
			if (m) out.add(m[1]);
		}
		for (const e of this.entries) if ('point' in e) add(e.point.rec);
		for (const p of this.basis.values()) add(p);
		add(this.seedDir + '/');
		return out;
	}
}
