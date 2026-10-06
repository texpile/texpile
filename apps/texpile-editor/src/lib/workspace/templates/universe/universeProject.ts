// A project from a Typst Universe template: main downloads and unpacks it into a staging folder
// of ours, and its files are copied into the project the way a saved template's are.
import { tinymistResolved } from '$lib/languages/typst/intellisense/lspClient';
import { joinPath } from '$lib/workspace/fileSystem';
import { toaster } from '$lib/modals/toaster-svelte';
import { tinymistInstaller } from '$lib/modals/window/tinymistInstall.svelte';
import { installTinymistWithToast } from '$lib/modals/window/tinymistInstallToast';
import { openToolchainPrefs } from '$lib/stores/dialogStore';
import { m } from '$lib/paraglide/messages';
import { bridgeErrorText, requireTemplatesBridge } from '../templateBridge';
import type { UniverseTemplate } from '../templateBridge.types';
import { askForProgram } from '$lib/modals/window/missingProgram/missingProgram.svelte';

/** there is no tinymist to build the project with; the picker offers the install instead */
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

/** a failed download reads as a chain of causes; say it plainly */
export function universeFailureText(error: string): string {
	return /download|network|request for url|dns|connect/i.test(error) ? m.gallery_download_failed() : error;
}

/** unpack `t` into `root`, keeping any file already there; resolves to the absolute main file */
export async function createFromUniverse(root: string, t: UniverseTemplate): Promise<string> {
	if (!(await tinymistResolved())) throw new TinymistMissingError(m.gallery_needs_tinymist());
	const bridge = requireTemplatesBridge();
	const dir = await bridge.stage();
	try {
		const { entryPath } = await bridge.universeUnpack(t.name, t.version, dir);
		await bridge.adopt(dir, root);
		return joinPath(root, entryPath);
	} catch (e) {
		throw new Error(universeFailureText(bridgeErrorText(e)), { cause: e });
	} finally {
		// adopt removed it already; this is for a download that failed
		void bridge.discard(dir).catch(() => {});
	}
}
