// Texpile's own TeX Live: download the pinned build, check it, and put the tree where the Toolchain looks. Only ever on
// the writer's click
import * as fs from 'node:fs';
import * as path from 'node:path';
import { downloadArchive, type FetchArchive } from '../install/archiveDownload';
import { extractArchive } from '../install/archiveExtract';
import { InstallError, type InstallFailure } from '../install/installError';
import { texliveBin } from './texliveDir';
import type { TexLiveAsset } from './texliveRelease';

// work folders sit beside the tree they replace, so moving it in is a rename on one disk
const STAGING_PREFIX = '.texlive-staging-';
// tens of thousands of files, each one opened by the virus scanner on Windows
const EXTRACT_TIMEOUT_MS = 30 * 60_000;

export type TexLiveInstallStep = { phase: 'download' | 'verify' | 'extract'; received: number; total: number };

export type TexLiveInstallFailed = { ok: false; reason: InstallFailure; detail: string };

export type TexLiveInstallResult = { ok: true; bin: string; detail: string } | TexLiveInstallFailed;

/** runs `change`, the moment the tree on disk moves, with whatever runs from it stopped */
export type SwapTree = <T>(change: () => Promise<T>) => Promise<T>;

export type TexLiveInstallDeps = {
	root: string;
	/** null when Texpile has no build for this machine */
	asset: TexLiveAsset | null;
	fetchArchive: FetchArchive;
	signal: AbortSignal;
	onStep: (step: TexLiveInstallStep) => void;
	/** the program's version line; null when it does not run */
	probe: (lualatex: string) => Promise<string | null>;
	swap: SwapTree;
	platform?: NodeJS.Platform;
};

export async function installTexLive(deps: TexLiveInstallDeps): Promise<TexLiveInstallResult> {
	const { asset } = deps;
	if (!asset) return { ok: false, reason: 'unsupported', detail: `${process.platform} ${process.arch}` };
	const parent = path.dirname(deps.root);
	let staging: string | null = null;
	try {
		await fs.promises.mkdir(parent, { recursive: true });
		await sweepStaging(parent);
		staging = await fs.promises.mkdtemp(path.join(parent, STAGING_PREFIX));
		const tree = await fetchAndUnpack(deps, asset, staging);
		const exe = (deps.platform ?? process.platform) === 'win32' ? '.exe' : '';
		const detail = await deps.probe(path.join(texliveBin(tree, asset.platform), `lualatex${exe}`));
		if (!detail) throw new InstallError('broken', 'lualatex --version did not answer');
		if (deps.signal.aborted) throw new InstallError('cancelled', 'cancelled');
		const into = staging;
		await deps.swap(() => replaceDir(tree, deps.root, into));
		return { ok: true, bin: texliveBin(deps.root, asset.platform), detail };
	} catch (err) {
		// what is left unnamed by the steps is the file system: the work folder, the final move
		return failed(err, 'disk');
	} finally {
		if (staging) await removeQuietly(staging);
	}
}

function failed(err: unknown, fallback: InstallFailure): TexLiveInstallFailed {
	const failure = InstallError.from(err, fallback);
	return { ok: false, reason: failure.reason, detail: failure.message };
}

async function fetchAndUnpack(deps: TexLiveInstallDeps, asset: TexLiveAsset, staging: string): Promise<string> {
	const archive = path.join(staging, asset.name);
	const sha256 = await downloadArchive(deps.fetchArchive, asset.url, archive, deps.signal, (p) => deps.onStep({ phase: 'download', ...p }));
	deps.onStep({ phase: 'verify', received: 0, total: 0 });
	if (sha256 !== asset.sha256) throw new InstallError('checksum', `expected ${asset.sha256}, got ${sha256}`);
	if (deps.signal.aborted) throw new InstallError('cancelled', 'cancelled');
	deps.onStep({ phase: 'extract', received: 0, total: 0 });
	const unpacked = path.join(staging, 'unpacked');
	await fs.promises.mkdir(unpacked);
	await extractArchive(archive, asset.format, unpacked, deps.platform, EXTRACT_TIMEOUT_MS);
	const tree = path.join(unpacked, 'texlive');
	if (!fs.existsSync(texliveBin(tree, asset.platform)))
		throw new InstallError('extract', `${asset.name} holds no texlive/bin/${asset.platform}`);
	return tree;
}

// the old tree steps aside into `staging` rather than being deleted: Windows lets a folder whose programs run be renamed
async function replaceDir(source: string, target: string, staging: string): Promise<void> {
	const aside = path.join(staging, `previous-${path.basename(target)}`);
	const hadOne = fs.existsSync(target);
	if (hadOne) await fs.promises.rename(target, aside);
	try {
		await fs.promises.rename(source, target);
	} catch (err) {
		if (hadOne) await fs.promises.rename(aside, target).catch(() => undefined);
		throw err;
	}
}

/** delete Texpile's TeX Live */
export async function removeTexLive(root: string, swap: SwapTree): Promise<{ ok: true } | TexLiveInstallFailed> {
	if (!fs.existsSync(root)) return { ok: true };
	const parent = path.dirname(root);
	let staging: string | null = null;
	try {
		await sweepStaging(parent);
		staging = await fs.promises.mkdtemp(path.join(parent, STAGING_PREFIX));
		const aside = path.join(staging, path.basename(root));
		await swap(() => fs.promises.rename(root, aside));
		return { ok: true };
	} catch (err) {
		return failed(err, 'disk');
	} finally {
		if (staging) await removeQuietly(staging);
	}
}

/** work folders an earlier install could not delete: a crash mid-install, a tree Windows held open */
async function sweepStaging(parent: string): Promise<void> {
	const entries = await fs.promises.readdir(parent).catch(() => [] as string[]);
	await Promise.all(entries.filter((e) => e.startsWith(STAGING_PREFIX)).map((e) => removeQuietly(path.join(parent, e))));
}

async function removeQuietly(dir: string): Promise<void> {
	await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 2 }).catch(() => undefined);
}
