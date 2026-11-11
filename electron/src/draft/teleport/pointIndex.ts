// The points a run recorded, in document order, and the source text they were recorded against. A teleport starts
// at the last point before an edit and may stop at any point after it.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LineEdit, LineShift } from './lineEdit';

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

// the first entry that reads the edited lines or comes after them
function firstPast(entries: IndexEntry[], file: string, edit: LineEdit, entered: boolean): number {
	let inFile = entered;
	for (let i = 0; i < entries.length; i++) {
		const e = entries[i];
		if ('enter' in e) {
			if (e.enter === file) inFile = true;
			continue;
		}
		const last = e.point.stack.length - 1;
		const here = e.point.stack.some(([f]) => f === file);
		if (here ? e.point.stack.some(([f, l], k) => f === file && (k === last ? l > edit.from : l >= edit.from)) : inFile) return i;
	}
	return entries.length;
}

/** a point past an edit, at its line after the edit, remembering the moves for the source lines in its record */
function lineMoved(p: Point, file: string, edit: LineEdit, shifts: LineShift[]): Point {
	const by = edit.newTo - edit.oldTo;
	return {
		...p,
		stack: p.stack.map(([f, l]) => [f, f === file && l > edit.oldTo ? l + by : l] as [string, number]),
		...(shifts.length ? { moves: [...(p.moves ?? []), ...shifts.map((s) => ({ f: file, ...s }))] } : {})
	};
}

export class PointIndex {
	/** where each source file's text, as the points saw it, is kept */
	readonly basis = new Map<string, string>();
	/** the fonts the recording loaded after its base, root-relative */
	fontList?: string;
	/** the images graphics kept by the end of the recording, root-relative */
	imageList?: string;

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

	/** a compile's index `fresh` read the same preamble, seed files and images as this one stands on */
	sameGround(fresh: PointIndex, root: string): boolean {
		if (this.seedDir !== fresh.seedDir || this.preStamp !== fresh.preStamp || this.bodyLine !== fresh.bodyLine) return false;
		if (this.preFiles.join('\n') !== fresh.preFiles.join('\n')) return false;
		function images(list?: string): string | null {
			try {
				return list ? fs.readFileSync(path.join(root, list), 'utf8') : null;
			} catch {
				return null;
			}
		}
		return images(this.imageList) === images(fresh.imageList);
	}

	/** the same ground, and the same text of every file */
	standsOn(fresh: PointIndex, root: string): boolean {
		if (this.basis.size !== fresh.basis.size) return false;
		for (const rel of fresh.basis.keys()) {
			const text = this.text(rel);
			if (text === null || text !== fresh.text(rel)) return false;
		}
		return this.sameGround(fresh, root);
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

	/** null when the file is not read after the base, or no point before the edit can be entered. `ship`: pages a cut run
	 * left on screen, which this run must ship again: it starts before the first and stops past the last */
	planFor(file: string, edit: LineEdit, ship?: { from: number; to: number }): TeleportPlan | null {
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
			if (p.refuse || (ship && p.shipped >= ship.from)) continue;
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
			if ('point' in e && !starts.has(keyOf(e.point.stack)) && !(ship && e.point.shipped + 1 < ship.to)) stops.push(e.point);
		}
		return { start: best, chain: chain ?? [], stops };
	}

	/** a run cut short: its points before the edit hold for the old text too, and go in after the start. A point in a
	 * file the run itself opened goes after the old entry into that file, else that file reads as never entered */
	keepBefore(plan: TeleportPlan, file: string, edit: LineEdit, run: IndexEntry[]): void {
		const startStack = plan.chain[plan.chain.length - 1]?.stack ?? [];
		const known = new Set([this.mainRel, ...startStack.map(([f]) => f)]);
		for (const e of this.entries.slice(0, plan.start + 1)) if ('enter' in e) known.add(e.enter);
		const after = new Map<number, IndexEntry[]>();
		const entered = file === this.mainRel || startStack.some(([f]) => f === file);
		for (const e of run.slice(0, firstPast(run, file, edit, entered))) {
			if (!('point' in e)) continue;
			const opened = e.point.stack.map(([f]) => f).filter((f) => !known.has(f));
			const at = opened.length
				? this.entries.findIndex((x, i) => i > plan.start && 'enter' in x && x.enter === opened[opened.length - 1])
				: plan.start;
			if (opened.length && at < 0) continue;
			after.set(at, [...(after.get(at) ?? []), e]);
		}
		this.entries = [...(after.get(-1) ?? []), ...this.entries.flatMap((e, i) => [e, ...(after.get(i) ?? [])])];
	}

	/** after a teleport: the points before its start, the run's own, then from the matched old point on, moved by the edit */
	merge(plan: TeleportPlan, file: string, edit: LineEdit, shifts: LineShift[], run: IndexEntry[], stopRec: string | null): void {
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
				keyOf(last.point.stack) === keyOf(lineMoved((tail[0] as { point: Point }).point, file, edit, shifts).stack)
			)
				tail = tail.slice(1);
		}
		const moved: IndexEntry[] = [];
		for (const e of tail) {
			if ('enter' in e) moved.push(e);
			else if (!e.point.stack.some(([f, l]) => f === file && l >= edit.from && l <= edit.oldTo))
				moved.push({ point: lineMoved(e.point, file, edit, shifts) });
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
		for (const p of [this.fontList, this.imageList]) if (p) add(p);
		return out;
	}
}
