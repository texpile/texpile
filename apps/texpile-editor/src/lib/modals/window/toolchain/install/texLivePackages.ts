// a package file the document loads that the TeX in use lacks: Texpile's own TeX Live fetches it with tlmgr
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

export type MissingFileOutcome = { installed: true } | { installed: false; ours: boolean; message: string };

// as the main process reads a log (electron/src/texlive/texlivePackages.ts): a missing .tex is usually the writer's own
const PACKAGE_FILE = /^[\w.+-]+\.(sty|cls|clo|cfg|def|fd|ldf|bbx|cbx|lbx|dbx)$/;

/** the package file a `File ... not found` error in a compile log names */
export function missingPackageFile(log: string): string | null {
	const file = /^! LaTeX Error: File `([^']+)' not found\./m.exec(log)?.[1];
	return file && PACKAGE_FILE.test(file) ? file : null;
}

/** the TeX in use is the one Texpile installed, so a missing package is Texpile's to install */
export async function texLiveInUse(): Promise<boolean> {
	const bridge = typeof window !== 'undefined' ? window.texpileTexLive : undefined;
	return !!bridge && (await bridge.inUse().catch(() => false));
}

/** `ours` is false when another TeX is in use, which Texpile leaves alone */
export async function installMissingFile(file: string, root: string): Promise<MissingFileOutcome> {
	const bridge = typeof window !== 'undefined' ? window.texpileTexLive : undefined;
	if (!bridge) return { installed: false, ours: false, message: m.draft_file_missing({ file }) };
	const result = await bridge
		.installFor(file, root)
		.catch((e: unknown): PackageInstallResult => ({ ok: false, reason: 'failed', detail: e instanceof Error ? e.message : String(e) }));
	if (result.ok) return { installed: true };
	if (result.reason === 'not-managed') return { installed: false, ours: false, message: m.draft_file_missing({ file }) };
	if (result.reason === 'offline') return { installed: false, ours: true, message: m.draft_file_missing_offline({ file }) };
	if (result.reason === 'unknown') return { installed: false, ours: true, message: m.draft_file_unknown({ file }) };
	return { installed: false, ours: true, message: m.draft_file_install_failed({ file, detail: result.detail }) };
}

// a package that installed and is still missing would otherwise rerun the compile for ever; a failed install is tried
// again on the next compile
const installed = new Set<string>();

/** a finished compile command's log: true once the package it lacked is installed, for the caller to run it again */
export async function installForCompileLog(log: string, root: string): Promise<boolean> {
	const file = missingPackageFile(log);
	if (!file || installed.has(file) || !(await texLiveInUse())) return false;
	const toast = toaster.create({ type: 'loading', title: m.draft_status_installing({ file }), duration: Infinity });
	const outcome = await installMissingFile(file, root);
	toaster.dismiss(toast);
	if (outcome.installed) {
		installed.add(file);
		return true;
	}
	// another TeX's own error is already in Problems
	if (outcome.ours) toaster.error({ title: outcome.message, duration: 10000 });
	return false;
}
