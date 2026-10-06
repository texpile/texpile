// What a session sees of the buffers: every shareable file's text in the shared doc, the rest of
// the folder listed by name, and which file the host holds in its visual editor
import { locksOf, manifestOf } from '$lib/collab/session';
import {
	EDIT_ORIGIN,
	MAX_BINARY_BYTES,
	MAX_TEXT_BYTES,
	SEED_ORIGIN,
	decodeIfText,
	isGeneratedArtifact,
	isLikelyTextName,
	isShared,
	manifestSignature
} from '$lib/collab/sharedFiles';
import { detectEol, toLf, type Eol } from '$lib/workspace/edits/lineEndings';
import type { TextBuffers, TextBuffersFs } from './textBuffers';

export class BufferSharing {
	// what this host listed; the manifest is not the authority, since any guest can write to it
	private listed = new Set<string>();
	private on = false;

	constructor(
		private readonly buffers: TextBuffers,
		private readonly root: string,
		private readonly fs: TextBuffersFs
	) {}

	/** a session starts: every shareable file goes into the shared doc, the rest are listed by name. Returns
	 *  the text files too large to co-edit (shared view-only instead), so the host can warn about them */
	async start(): Promise<{ oversizedText: string[] }> {
		const b = this.buffers;
		const files = (await this.fs.listFiles(this.root)).filter((f) => isShared(f.rel));
		this.listed = new Set(files.map((f) => f.rel));
		const oversizedText: string[] = [];
		const bodies = new Map<string, { text: string; eol: Eol; size: number }>();
		for (const f of files) {
			if (b.has(f.rel)) {
				// read before, too big for the relay: it stays on this machine
				if (!b.inShared(f.rel) && isLikelyTextName(f.rel)) oversizedText.push(f.rel);
				continue;
			}
			if (isGeneratedArtifact(f.rel)) continue;
			if (f.size > MAX_TEXT_BYTES) {
				// too big to co-edit whatever it is; warn only where the name says it was source
				if (isLikelyTextName(f.rel)) oversizedText.push(f.rel);
				continue;
			}
			try {
				const bytes = await this.fs.readBytes(b.abs(f.rel));
				// tree scans don't always carry sizes; the cap re-applies after the read
				if (bytes.byteLength > MAX_TEXT_BYTES) {
					if (isLikelyTextName(f.rel)) oversizedText.push(f.rel);
					continue;
				}
				const raw = decodeIfText(bytes);
				if (raw !== null) bodies.set(f.rel, { text: toLf(raw), eol: detectEol(raw), size: bytes.byteLength });
			} catch {
				/* the guests just do not get this file */
			}
		}
		b.shared.transact(() => {
			const manifest = manifestOf(b.shared);
			for (const f of files) {
				if (b.inShared(f.rel) || bodies.has(f.rel)) continue;
				if (f.size <= MAX_BINARY_BYTES) manifest.set(f.rel, { kind: 'binary', size: f.size, rev: f.mtimeMs ?? 0 });
			}
		}, SEED_ORIGIN);
		for (const [rel, body] of bodies) b.seedShared(rel, body.text, body.eol, body.size);
		this.on = true;
		b.track(true);
		return { oversizedText };
	}

	stop(): void {
		this.on = false;
		this.buffers.track(false);
	}

	/** re-sync the manifest after host-side file ops (create/delete/rename/import). Returns whether
	 *  the shared set actually changed, so the caller only rebinds editors when it did (a plain
	 *  tree refresh on window focus or after a compile leaves the set untouched). */
	async syncFromTree(): Promise<boolean> {
		if (!this.on) return false;
		const b = this.buffers;
		const files = (await this.fs.listFiles(this.root)).filter((f) => isShared(f.rel));
		const manifest = manifestOf(b.shared);
		const seen = new Set(files.map((f) => f.rel));
		this.listed = seen;
		const sigBefore = manifestSignature(manifest);
		for (const f of files) {
			if (b.has(f.rel)) continue;
			const existing = manifest.get(f.rel);
			if (existing && !existing.gone && existing.kind === 'binary') {
				// a replaced image keeps its path, so the rev is the only thing telling a guest to refetch
				if (existing.rev !== (f.mtimeMs ?? existing.rev))
					manifest.set(f.rel, { ...existing, size: f.size, rev: f.mtimeMs ?? existing.rev ?? 0 });
				continue;
			}
			if (!isGeneratedArtifact(f.rel) && f.size <= MAX_TEXT_BYTES && (await b.ensure(f.rel))) continue;
			if (f.size <= MAX_BINARY_BYTES) manifest.set(f.rel, { kind: 'binary', size: f.size, rev: f.mtimeMs ?? 0 });
		}
		for (const [rel, entry] of manifest.entries()) {
			if (seen.has(rel) || entry.gone) continue;
			if (b.has(rel) && (b.hasPending(rel) || b.isDirty(rel))) continue;
			if (b.has(rel)) b.drop(rel);
			else manifest.set(rel, { ...entry, gone: true });
		}
		return manifestSignature(manifest) !== sigBefore;
	}

	/** whether this host shares the file at rel */
	sharesFile(rel: string): boolean {
		return this.listed.has(rel);
	}

	/** whether rel is a folder holding files this host shares */
	sharesFolder(rel: string): boolean {
		const prefix = rel + '/';
		for (const f of this.listed) if (f.startsWith(prefix)) return true;
		return false;
	}

	/** mark a file as held by the host's visual editor (guests go read-only on it). */
	setHostLock(rel: string | null, prevRel?: string | null): void {
		const doc = this.buffers.shared;
		doc.transact(() => {
			const locks = locksOf(doc);
			if (prevRel && locks.has(prevRel)) locks.delete(prevRel);
			if (rel) locks.set(rel, doc.clientID);
		}, EDIT_ORIGIN);
	}
}
