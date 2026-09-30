// Texpile's own copy of tinymist: download the pinned release, check it, and put it where
// resolveTinymist looks after PATH. Only ever on the user's click, never in the background.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { managedTinymistPath } from '../typstService';
import { extractArchive, findProgram } from './tinymistArchive';
import { downloadArchive, type FetchArchive } from './tinymistDownload';
import { TinymistInstallError, type TinymistInstallFailure } from './tinymistInstallError';
import type { TinymistAsset } from './tinymistRelease';

// work folders sit in userData, beside the copy they replace, so the final move is a rename on one disk
const STAGING_PREFIX = '.tinymist-staging-';

export type TinymistInstallStep = { phase: 'download' | 'verify' | 'extract'; received: number; total: number };

export type TinymistVersion = { version: string; typstVersion: string };

export type TinymistInstallFailed = { ok: false; reason: TinymistInstallFailure; detail: string };

export type TinymistInstallResult = { ok: true; command: string; version: string; typstVersion: string } | TinymistInstallFailed;

/** runs `change`, the moment the copy on disk is replaced, with whatever runs the old copy out of the way */
export type SwapManagedCopy = <T>(change: () => Promise<T>) => Promise<T>;

export type TinymistInstallDeps = {
	userData: string;
	/** null when tinymist publishes no build for this machine */
	asset: TinymistAsset | null;
	fetchArchive: FetchArchive;
	signal: AbortSignal;
	onStep: (step: TinymistInstallStep) => void;
	/** the program's own version check; null when it does not run */
	probe: (command: string) => Promise<TinymistVersion | null>;
	swap: SwapManagedCopy;
	platform?: NodeJS.Platform;
};

export async function installTinymist(deps: TinymistInstallDeps): Promise<TinymistInstallResult> {
	const { asset } = deps;
	if (!asset) return { ok: false, reason: 'unsupported', detail: `${process.platform} ${process.arch}` };
	let staging: string | null = null;
	try {
		await fs.promises.mkdir(deps.userData, { recursive: true });
		await sweepStaging(deps.userData);
		staging = await fs.promises.mkdtemp(path.join(deps.userData, STAGING_PREFIX));
		const program = await fetchAndUnpack(deps, asset, staging);
		const version = await deps.probe(program);
		if (!version) throw new TinymistInstallError('broken', 'tinymist --version did not answer');
		if (deps.signal.aborted) throw new TinymistInstallError('cancelled', 'cancelled');
		const target = managedTinymistPath(deps.userData);
		const into = staging;
		await deps.swap(() => replaceFile(program, target, into));
		return { ok: true, command: target, ...version };
	} catch (err) {
		// what is left unnamed by the steps is the file system: the work folder, the final move
		return failed(err, 'disk');
	} finally {
		if (staging) await removeQuietly(staging);
	}
}

function failed(err: unknown, fallback: TinymistInstallFailure): TinymistInstallFailed {
	const failure = TinymistInstallError.from(err, fallback);
	return { ok: false, reason: failure.reason, detail: failure.message };
}

async function fetchAndUnpack(deps: TinymistInstallDeps, asset: TinymistAsset, staging: string): Promise<string> {
	const archive = path.join(staging, asset.name);
	const sha256 = await downloadArchive(deps.fetchArchive, asset.url, archive, deps.signal, (p) => deps.onStep({ phase: 'download', ...p }));
	deps.onStep({ phase: 'verify', received: 0, total: 0 });
	if (sha256 !== asset.sha256) throw new TinymistInstallError('checksum', `expected ${asset.sha256}, got ${sha256}`);
	if (deps.signal.aborted) throw new TinymistInstallError('cancelled', 'cancelled');
	deps.onStep({ phase: 'extract', received: 0, total: 0 });
	const unpacked = path.join(staging, 'unpacked');
	await fs.promises.mkdir(unpacked);
	await extractArchive(archive, asset.format, unpacked, deps.platform);
	const exe = path.basename(managedTinymistPath(deps.userData));
	const program = findProgram(unpacked, exe);
	if (!program) throw new TinymistInstallError('extract', `${asset.name} holds no ${exe}`);
	if ((deps.platform ?? process.platform) !== 'win32') await fs.promises.chmod(program, 0o755);
	return program;
}

/**
 * Move `source` to `target`, the old copy first stepping aside into `staging`.
 *
 * Aside rather than deleted: Windows refuses to delete a program that is running (a compile still
 * under way), but lets it be renamed, and the staging folder is swept by the next install.
 */
async function replaceFile(source: string, target: string, staging: string): Promise<void> {
	await fs.promises.mkdir(path.dirname(target), { recursive: true });
	const aside = path.join(staging, `previous-${path.basename(target)}`);
	const hadOne = fs.existsSync(target);
	if (hadOne) await fs.promises.rename(target, aside);
	try {
		await fs.promises.rename(source, target);
	} catch (err) {
		// the staging folder is deleted next, so a copy that worked goes back rather than with it
		if (hadOne) await fs.promises.rename(aside, target).catch(() => undefined);
		throw err;
	}
}

/** delete Texpile's copy; the folder goes too once nothing else is in it */
export async function removeTinymist(userData: string, swap: SwapManagedCopy): Promise<{ ok: true } | TinymistInstallFailed> {
	const target = managedTinymistPath(userData);
	if (!fs.existsSync(target)) return { ok: true };
	let staging: string | null = null;
	try {
		await sweepStaging(userData);
		staging = await fs.promises.mkdtemp(path.join(userData, STAGING_PREFIX));
		const aside = path.join(staging, path.basename(target));
		await swap(() => fs.promises.rename(target, aside));
		await fs.promises.rmdir(path.dirname(target)).catch(() => undefined);
		return { ok: true };
	} catch (err) {
		return failed(err, 'disk');
	} finally {
		if (staging) await removeQuietly(staging);
	}
}

/** work folders an earlier install could not delete: a crash mid-install, or an old copy Windows held open */
async function sweepStaging(userData: string): Promise<void> {
	const entries = await fs.promises.readdir(userData).catch(() => [] as string[]);
	await Promise.all(entries.filter((e) => e.startsWith(STAGING_PREFIX)).map((e) => removeQuietly(path.join(userData, e))));
}

async function removeQuietly(dir: string): Promise<void> {
	await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 2 }).catch(() => undefined);
}
