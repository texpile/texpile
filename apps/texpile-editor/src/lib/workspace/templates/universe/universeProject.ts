// A project from a Typst Universe template: tinymist downloads and unpacks it into a staging folder
// of ours, and its files are copied into the project the way a saved template's are.
import { initTypstTemplate } from '$lib/languages/typst/intellisense/initTemplate';
import { tinymistResolved } from '$lib/languages/typst/intellisense/lspClient';
import { joinPath } from '$lib/workspace/fileSystem';
import { toaster } from '$lib/modals/toaster-svelte';
import { tinymistInstaller } from '$lib/modals/window/tinymistInstall.svelte';
import { installTinymistWithToast } from '$lib/modals/window/tinymistInstallToast';
import { openToolchainPrefs } from '$lib/stores/dialogStore';
import { m } from '$lib/paraglide/messages';
import { requireTemplatesBridge } from '../templateBridge';
import type { UniverseTemplate } from '../templateBridge.types';
import { askForProgram } from '$lib/modals/window/missingProgram/missingProgram.svelte';

/** there is no tinymist to unpack the template with; the picker offers the install instead */
export class TinymistMissingError extends Error {}

/** the one next step: the dialog with Texpile's own install where it can do one, the toolchain settings otherwise */
export async function toastTinymistMissing(): Promise<void> {
	if (askForProgram('tinymist')) return;
	if (tinymistInstaller.available) await tinymistInstaller.refresh();
	toaster.error({
		title: m.wsview_toast_starter_create_failed_title(),
		description: m.gallery_needs_tinymist(),
		duration: 12000,
		action: tinymistInstaller.offered
			? { label: m.tinymist_install(), onClick: () => void installTinymistWithToast() }
			: { label: m.compile_tool_missing_action(), onClick: openToolchainPrefs }
	});
}

/** the package spec tinymist is handed, pinned to the version the gallery showed */
export function universeSpec(t: Pick<UniverseTemplate, 'name' | 'version'>): string {
	return `@preview/${t.name}:${t.version}`;
}

/** tinymist's own words for a failed download are a nested chain of causes; say it plainly */
export function universeFailureText(error: string): string {
	return /download|network|request for url|dns|connect/i.test(error) ? m.gallery_download_failed() : error;
}

/** unpack `t` into `root`, keeping any file already there; resolves to the absolute main file */
export async function createFromUniverse(root: string, t: UniverseTemplate): Promise<string> {
	if (!(await tinymistResolved())) throw new TinymistMissingError(m.gallery_needs_tinymist());
	const bridge = requireTemplatesBridge();
	const staged: string[] = [];
	async function nextStagedDir(): Promise<string> {
		const dir = await bridge.stage();
		staged.push(dir);
		return dir;
	}
	try {
		const { dir, entryPath } = await initTypstTemplate(root, universeSpec(t), nextStagedDir);
		await bridge.adopt(dir, root);
		return joinPath(root, entryPath);
	} catch (e) {
		throw new Error(universeFailureText(e instanceof Error ? e.message : String(e)), { cause: e });
	} finally {
		// the adopted one is gone already; any other is an attempt that timed out
		for (const dir of staged) void bridge.discard(dir).catch(() => {});
	}
}
