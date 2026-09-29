// Local History, as VS Code keeps it (workbench.localHistory): every save of a file puts a copy of
// it under the app's own data, so the work between two versions is not protected only by undo.
// Same layout as VS Code's User/History: a folder per file, named by a hash of its path, holding
// the copies and an entries.json that lists them.
//
// VS Code's rules assume saving by hand. Texpile saves 1.5 s after typing stops, so they are tuned
// for that, as writing tools keep history (Obsidian: a snapshot at most every 5 minutes, kept 7
// days):
// - saves from the same source go into the current copy until it is 5 minutes old, then a new one
//   starts: an hour of writing is about twelve copies, however often it paused. A copy kept before
//   a Reload, Discard or Restore, and one the author named, stays as it is
// - copies are kept by age: every one for 7 days, then the last of each day for 30 days. A copy the
//   author named is kept until they delete it
// - files up to 1 MB (a long .bib is well over VS Code's 256 KB), and all of it together under a cap
//   that removes the oldest first
// A rename or move carries the entries along.
//
// A portable Texpile files a project on its own drive by the path from that drive's root, so the
// history travels with the drive whatever letter it is given on the next computer, and stays put
// when the app's folder is moved about on it.
//
// Nothing here reads the file being tracked: the window hands over what it saved, so a path can
// never be used to pull an arbitrary file into the history and read it back out.
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, normalize, parse, resolve, sep } from 'node:path';

export type LocalHistoryEntry = {
	/** the copy's file name in the history folder: four characters and the file's extension */
	id: string;
	/** the last save that went into it */
	timestamp: number;
	/** the first save that went into it; the 5-minute window counts from here */
	started?: number;
	/** 'restored', 'renamed', 'moved', 'before-discard', 'before-restore', 'before-reload', 'shared',
	 *  or a name the author gave it; absent for an ordinary save */
	source?: string;
	/** for a rename or move, where the file was before */
	sourceDescription?: string;
};

type Model = { version: 1; resource: string; entries: LocalHistoryEntry[] };

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const LOCAL_HISTORY_LIMITS = {
	mergeWindowMs: 5 * MINUTE,
	maxFileSize: 1024 * 1024,
	keepAllMs: 7 * DAY,
	keepDailyMs: 30 * DAY,
	/** a backstop for a file saved without pause for weeks; age decides long before this */
	maxEntries: 1000,
	maxTotalBytes: 300 * 1024 * 1024
};
export type LocalHistoryLimits = typeof LOCAL_HISTORY_LIMITS;

/** what Texpile records on its own; any other source is a name the author gave the copy */
const RECORDED = new Set([undefined, 'restored', 'renamed', 'moved', 'before-discard', 'before-restore', 'before-reload', 'shared']);

function named(entry: LocalHistoryEntry): boolean {
	return !RECORDED.has(entry.source);
}

const ENTRIES_FILE = 'entries.json';
const ID_RE = /^[A-Za-z0-9]{4}(\.[^\\/]{1,32})?$/;

/** four characters and the file's extension, as VS Code names a copy; never one the file already
 *  has, compared as macOS's and Windows's disks do, without case: "aB3d" there is "Ab3D", and the
 *  new copy would be written over an older one */
function randomId(resource: string, taken: { id: string }[]): string {
	const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	const ext = extname(resource);
	const used = new Set(taken.map((e) => e.id.toLowerCase()));
	for (;;) {
		const stem = [...randomBytes(4)].map((b) => alphabet[b % alphabet.length]).join('');
		// an extension load() would not recognise (too long, or a name ending in ".") is left off:
		// a copy it cannot list is never shown, trimmed or removed
		const id = ID_RE.test(stem + ext) ? stem + ext : stem;
		if (!used.has(id.toLowerCase())) return id;
	}
}

/** the calendar day a time falls on, where the author is */
function dayOf(timestamp: number): string {
	return new Date(timestamp).toDateString();
}

export class LocalHistory {
	// one operation at a time: a save, a move and a restore can arrive together, and each rewrites
	// entries.json from what it read
	private chain: Promise<unknown> = Promise.resolve();
	private limits: LocalHistoryLimits;

	/** `base`: the portable app's folder; a project on its drive is filed from the drive's root */
	constructor(
		private home: string,
		limits: Partial<LocalHistoryLimits> = {},
		private base?: string
	) {
		this.limits = { ...LOCAL_HISTORY_LIMITS, ...limits };
	}

	private queue<T>(op: () => Promise<T>): Promise<T> {
		const next = this.chain.then(op, op);
		this.chain = next.catch(() => undefined);
		return next;
	}

	/** how a path is written down: from the root of the portable app's drive when it is on it. Not
	 *  from the app's folder, which the author may move to another folder on the drive */
	private stored(path: string): string {
		const abs = resolve(path);
		if (!this.base) return abs;
		const root = parse(abs).root;
		return root.toLowerCase() === parse(resolve(this.base)).root.toLowerCase() ? abs.slice(root.length) || '.' : abs;
	}

	/** a path as it was written down, back to where it is on this computer */
	private absolute(stored: string): string {
		return isAbsolute(stored) || !this.base ? stored : resolve(parse(resolve(this.base)).root, stored);
	}

	/** a path as it names a file here, case-folded where the file system folds case */
	private key(path: string): string {
		const s = normalize(this.stored(path));
		return process.platform === 'win32' || process.platform === 'darwin' ? s.toLowerCase() : s;
	}

	private folder(resource: string): string {
		return join(this.home, createHash('sha1').update(this.key(resource)).digest('hex').slice(0, 16));
	}

	/** the path a history folder's listing names, or null when it cannot be read */
	private async listedPath(name: string): Promise<string | null> {
		try {
			const resource = (JSON.parse(await readFile(join(this.home, name, ENTRIES_FILE), 'utf8')) as Model).resource;
			return typeof resource === 'string' ? this.absolute(resource) : null;
		} catch {
			return null;
		}
	}

	/**
	 * The file's entries, rebuilt from the copies in its folder as VS Code rebuilds them: entries.json
	 * adds the labels and times. A listing lost or cut short (a crash while it was written) then
	 * costs only labels; the copies stay listed, and are trimmed and removed like any other.
	 */
	private async load(resource: string): Promise<Model> {
		const dir = this.folder(resource);
		let names: string[];
		try {
			names = (await readdir(dir)).filter((n) => n !== ENTRIES_FILE && ID_RE.test(n));
		} catch {
			return { version: 1, resource: resolve(resource), entries: [] };
		}
		let listed: LocalHistoryEntry[] = [];
		let path = resolve(resource);
		try {
			const parsed = JSON.parse(await readFile(join(dir, ENTRIES_FILE), 'utf8')) as Model;
			if (parsed && Array.isArray(parsed.entries)) listed = parsed.entries.filter((e) => ID_RE.test(e.id));
			if (typeof parsed?.resource === 'string') path = this.absolute(parsed.resource);
		} catch {
			// no listing, or one that cannot be read: the copies alone, timed by when they were written
		}
		const present = new Set(names);
		const entries = listed.filter((e) => present.has(e.id));
		const known = new Set(entries.map((e) => e.id));
		for (const id of names) {
			if (known.has(id)) continue;
			const written = await stat(join(dir, id)).catch(() => null);
			if (written) entries.push({ id, timestamp: written.mtimeMs });
		}
		entries.sort((a, b) => a.timestamp - b.timestamp);
		return { version: 1, resource: path, entries };
	}

	private async store(resource: string, model: Model): Promise<void> {
		const dir = this.folder(resource);
		if (!model.entries.length) {
			await rm(dir, { recursive: true, force: true });
			return;
		}
		await mkdir(dir, { recursive: true });
		// written aside and renamed over the old one, so a crash leaves one listing or the other
		const aside = join(dir, `.${ENTRIES_FILE}.${randomBytes(4).toString('hex')}`);
		await writeFile(aside, JSON.stringify({ ...model, resource: this.stored(model.resource) }));
		await rename(aside, join(dir, ENTRIES_FILE));
	}

	/**
	 * Keep by age: every copy from the last 7 days, the last of each day before that up to 30 days,
	 * nothing older; a copy the author named stays. The newest copy always stays, however old, so a
	 * file left alone for a month keeps the text it was left with. Returns the ids dropped.
	 */
	private thin(model: Model, now: number): string[] {
		const newest = model.entries.at(-1);
		const lastOfDay = new Map<string, LocalHistoryEntry>();
		for (const e of model.entries) lastOfDay.set(dayOf(e.timestamp), e);
		const kept = model.entries.filter((e) => {
			if (e === newest || named(e)) return true;
			const age = now - e.timestamp;
			if (age <= this.limits.keepAllMs) return true;
			return age <= this.limits.keepDailyMs && lastOfDay.get(dayOf(e.timestamp)) === e;
		});
		let excess = kept.length - this.limits.maxEntries;
		const final = kept.filter((e) => !(excess > 0 && e !== newest && !named(e) && excess-- > 0));
		const dropped = model.entries.filter((e) => !final.includes(e)).map((e) => e.id);
		model.entries = final;
		return dropped;
	}

	private async trim(resource: string, model: Model, now: number): Promise<void> {
		for (const id of this.thin(model, now)) await rm(join(this.folder(resource), id), { force: true });
	}

	/**
	 * A save: a new entry, or the current one replaced when it came from the same kind of save and is
	 * less than 5 minutes old. Nothing when the file is over the size limit, or the content is what
	 * the last entry already holds. Resolves to the entry, or null when nothing was kept.
	 */
	add(
		resource: string,
		content: string,
		source?: string,
		sourceDescription?: string,
		timestamp = Date.now()
	): Promise<LocalHistoryEntry | null> {
		return this.queue(async () => {
			if (Buffer.byteLength(content, 'utf8') > this.limits.maxFileSize) return null;
			const model = await this.load(resource);
			const dir = this.folder(resource);
			const last = model.entries.at(-1);
			// a save that changed nothing adds nothing, whatever made the last entry: Ctrl+S right after a
			// rename or a restore would otherwise make a second copy of it (VS Code's tracker skips it
			// too). An entry the author asked for by name is kept regardless
			if (last && (last.source === source || !source)) {
				const previous = await readFile(join(dir, last.id), 'utf8').catch(() => null);
				if (previous === content) return last;
			}
			// only copies of the file as it is saved gather: one kept before a Reload, Discard or Restore
			// holds text nothing else has, and so does one the author named. A second Reload a minute
			// later would otherwise write over the first one's text
			const gathers = !source || source === 'shared' || source === 'renamed' || source === 'moved';
			if (last && gathers && last.source === source && timestamp - (last.started ?? last.timestamp) < this.limits.mergeWindowMs) {
				await writeFile(join(dir, last.id), content);
				last.started ??= last.timestamp;
				last.timestamp = timestamp;
				// the window replacing a rename's entry with what is on disk keeps where it came from
				last.sourceDescription = sourceDescription ?? last.sourceDescription;
				await this.store(resource, model);
				return last;
			}
			await mkdir(dir, { recursive: true });
			const entry: LocalHistoryEntry = {
				id: randomId(resource, model.entries),
				timestamp,
				started: timestamp,
				...(source ? { source } : {}),
				...(sourceDescription ? { sourceDescription } : {})
			};
			model.entries.push(entry);
			// a file's first copy: its listing goes first, so the folder says whose it is before any copy
			// is in it. Copies with no listing belong to no file that all() or move() can name; a listing
			// whose copy never arrived loses only that entry (load() skips it)
			if (model.entries.length === 1) await this.store(resource, model);
			await writeFile(join(dir, entry.id), content);
			await this.trim(resource, model, timestamp);
			await this.store(resource, model);
			return entry;
		});
	}

	/** oldest first, as VS Code keeps them */
	list(resource: string): Promise<LocalHistoryEntry[]> {
		return this.queue(async () => (await this.load(resource)).entries);
	}

	/** an entry's contents; null for an id the file's history does not list */
	read(resource: string, id: string): Promise<string | null> {
		return this.queue(async () => {
			const model = await this.load(resource);
			if (!model.entries.some((e) => e.id === id)) return null;
			return readFile(join(this.folder(resource), id), 'utf8').catch(() => null);
		});
	}

	remove(resource: string, id: string): Promise<boolean> {
		return this.queue(async () => {
			const model = await this.load(resource);
			const at = model.entries.findIndex((e) => e.id === id);
			if (at < 0) return false;
			model.entries.splice(at, 1);
			await rm(join(this.folder(resource), id), { force: true });
			await this.store(resource, model);
			return true;
		});
	}

	/** VS Code's Rename: the entry's label, which is its source */
	rename(resource: string, id: string, label: string): Promise<boolean> {
		return this.queue(async () => {
			const name = label.trim();
			const model = await this.load(resource);
			const entry = model.entries.find((e) => e.id === id);
			if (!entry || !name) return false;
			entry.source = name;
			await this.store(resource, model);
			return true;
		});
	}

	/**
	 * Every file with history under `under`, newest first, whether or not it is still there: VS
	 * Code's Find Entry to Restore, which is how a deleted file's copies are found at all.
	 */
	all(under: string): Promise<{ resource: string; count: number; newest: number }[]> {
		return this.queue(async () => {
			// a project at the root of a drive already ends in a separator; the portable app's own drive
			// root is stored as '.', and everything on it is under it
			const key = this.key(under);
			const prefix = key === '.' ? '' : key.endsWith(sep) ? key : key + sep;
			let folders: string[];
			try {
				folders = await readdir(this.home);
			} catch {
				return [];
			}
			const found: { resource: string; count: number; newest: number }[] = [];
			for (const name of folders) {
				const resource = await this.listedPath(name);
				if (resource === null || !this.key(resource).startsWith(prefix)) continue;
				const { entries } = await this.load(resource);
				if (entries.length) found.push({ resource, count: entries.length, newest: entries.at(-1)!.timestamp });
			}
			return found.sort((a, b) => b.newest - a.newest);
		});
	}

	/** VS Code's Delete All: every entry of every file */
	removeAll(): Promise<void> {
		return this.queue(() => rm(this.home, { recursive: true, force: true }));
	}

	/** the space every copy together takes, in bytes */
	usage(): Promise<number> {
		return this.queue(async () => (await this.sizes()).reduce((sum, c) => sum + c.size, 0));
	}

	/** every copy on disk, with its size and the file it belongs to */
	private async sizes(): Promise<{ resource: string; entry: LocalHistoryEntry; size: number }[]> {
		let folders: string[];
		try {
			folders = await readdir(this.home);
		} catch {
			return [];
		}
		const out: { resource: string; entry: LocalHistoryEntry; size: number }[] = [];
		for (const name of folders) {
			const resource = await this.listedPath(name);
			if (resource === null) continue;
			for (const entry of (await this.load(resource)).entries) {
				const s = await stat(join(this.home, name, entry.id)).catch(() => null);
				if (s) out.push({ resource, entry, size: s.size });
			}
		}
		return out;
	}

	/**
	 * Housekeeping, run once in a while rather than on every save: every file's history thinned by
	 * age (one left alone is otherwise never trimmed, since that happens on a save), then the oldest
	 * copies removed, across every file, while all of it together is over the cap. A file's newest
	 * copy goes last, and a named one not at all.
	 */
	prune(now = Date.now()): Promise<void> {
		return this.queue(async () => {
			let folders: string[];
			try {
				folders = await readdir(this.home);
			} catch {
				return;
			}
			for (const name of folders) {
				const resource = await this.listedPath(name);
				if (resource === null) continue;
				const model = await this.load(resource);
				if (!model.entries.length) continue;
				const before = model.entries.length;
				await this.trim(resource, model, now);
				if (model.entries.length !== before) await this.store(resource, model);
			}
			const copies = await this.sizes();
			let total = copies.reduce((sum, c) => sum + c.size, 0);
			if (total <= this.limits.maxTotalBytes) return;
			const newest = new Map<string, number>();
			for (const c of copies) newest.set(c.resource, Math.max(newest.get(c.resource) ?? 0, c.entry.timestamp));
			// oldest first, and each file's newest after every other copy. A named copy is not in it: the
			// author was told it stays until they delete it, and it is usually the oldest
			const order = copies
				.filter((c) => !named(c.entry))
				.sort(
					(a, b) =>
						Number(a.entry.timestamp === newest.get(a.resource)) - Number(b.entry.timestamp === newest.get(b.resource)) ||
						a.entry.timestamp - b.entry.timestamp
				);
			const drop = new Map<string, Set<string>>();
			for (const c of order) {
				if (total <= this.limits.maxTotalBytes) break;
				total -= c.size;
				drop.set(c.resource, (drop.get(c.resource) ?? new Set()).add(c.entry.id));
			}
			for (const [resource, ids] of drop) {
				const model = await this.load(resource);
				model.entries = model.entries.filter((e) => !ids.has(e.id));
				for (const id of ids) await rm(join(this.folder(resource), id), { force: true });
				await this.store(resource, model);
			}
		});
	}

	/**
	 * A file or folder was renamed or moved: every file under `from` takes its entries to its new
	 * path, merged with any the new path already had, and gets one more entry saying where it was.
	 * Nothing is read from disk here, so that entry starts as a copy of the file's own newest one; the
	 * window then hands over what the file holds now (moveLocalHistory), which replaces it inside the
	 * merge window, as VS Code's entry is a copy of the file itself. Resolves to the new paths.
	 * `record` false (Keep local history turned off) takes the entries along and adds none.
	 */
	move(from: string, to: string, record = true): Promise<string[]> {
		return this.queue(async () => {
			const src = this.key(from);
			// The file itself is found by its own folder, whose name comes from its path, so a listing
			// that cannot be read does not strand its copies under the old name (load() rebuilds it).
			// Files under a moved folder can only be found by their listings, where their paths are.
			const sources: string[] = [];
			if ((await this.load(from)).entries.length) sources.push(resolve(from));
			let folders: string[] = [];
			try {
				folders = await readdir(this.home);
			} catch {
				// nothing kept yet
			}
			for (const name of folders) {
				const resource = await this.listedPath(name);
				if (resource !== null && this.key(resource).startsWith(src + sep)) sources.push(resource);
			}
			const moved: string[] = [];
			for (const source of sources) {
				const target = resolve(to) + resolve(source).slice(resolve(from).length);
				if (await this.carry(source, target, record)) moved.push(target);
			}
			return moved;
		});
	}

	/** One file's entries to its new path; false when it had none. The old folder is removed only
	 *  once every copy is across: one another program holds open for a moment (an indexer, a virus
	 *  scan on Windows) keeps the folder, and the rest with it, rather than being lost. */
	private async carry(source: string, target: string, record: boolean): Promise<boolean> {
		const carried = (await this.load(source)).entries;
		if (!carried.length) return false;
		const fromDir = this.folder(source);
		const toDir = this.folder(target);
		// a rename that only changes case on macOS or Windows keeps the same folder: nothing to carry
		const same = fromDir === toDir;
		const into: Model = same ? { version: 1, resource: target, entries: carried } : await this.load(target);
		let complete = true;
		// this file's newest copy that made it across, which the entry below repeats: the newest in
		// `into` may be another file's, one deleted from the new path earlier
		let newest = same ? carried.at(-1) : undefined;
		if (!same) {
			await mkdir(toDir, { recursive: true });
			for (const entry of carried) {
				let bytes: Buffer;
				try {
					bytes = await readFile(join(fromDir, entry.id));
				} catch (e) {
					if ((e as NodeJS.ErrnoException).code !== 'ENOENT') complete = false;
					continue;
				}
				// compared without case, as macOS's and Windows's disks compare names: a copy the new path
				// already has under the same name would be written over, so this one gets a name of its own
				const taken = into.entries.some((e) => e.id.toLowerCase() === entry.id.toLowerCase());
				const copy = taken ? { ...entry, id: randomId(target, into.entries) } : entry;
				await writeFile(join(toDir, copy.id), bytes);
				into.entries.push(copy);
				newest = copy;
			}
			into.entries.sort((a, b) => a.timestamp - b.timestamp);
		}
		into.resource = target;
		const now = Date.now();
		if (newest && record) {
			const entry: LocalHistoryEntry = {
				id: randomId(target, into.entries),
				timestamp: now,
				started: now,
				source: resolve(target, '..') === resolve(source, '..') ? 'renamed' : 'moved',
				sourceDescription: source
			};
			const bytes = await readFile(join(toDir, newest.id)).catch(() => null);
			if (bytes) {
				await writeFile(join(toDir, entry.id), bytes);
				into.entries.push(entry);
			}
		}
		// not thinned here: a move is not a reason to let go of anything, and the next save or prune()
		// does it by the same rules
		await this.store(target, into);
		if (!same && complete) await rm(fromDir, { recursive: true, force: true });
		return true;
	}
}
