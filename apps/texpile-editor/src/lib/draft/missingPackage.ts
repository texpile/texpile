// a package file the document loads that the TeX in use lacks: Texpile's own TeX Live fetches it with tlmgr
import { m } from '$lib/paraglide/messages';

/** null once installed; otherwise the line the preview shows */
export async function installMissingFile(file: string, root: string): Promise<string | null> {
	const bridge = typeof window !== 'undefined' ? window.texpileTexLive : undefined;
	if (!bridge) return m.draft_file_missing({ file });
	const result = await bridge
		.installFor(file, root)
		.catch((e: unknown): PackageInstallResult => ({ ok: false, reason: 'failed', detail: e instanceof Error ? e.message : String(e) }));
	if (result.ok) return null;
	if (result.reason === 'offline') return m.draft_file_missing_offline({ file });
	if (result.reason === 'unknown') return m.draft_file_unknown({ file });
	if (result.reason === 'failed') return m.draft_file_install_failed({ file, detail: result.detail });
	return m.draft_file_missing({ file });
}
