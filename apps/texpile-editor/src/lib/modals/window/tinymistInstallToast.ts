// Install tinymist from a toast: the compile or preview that found it missing offers the install
// right there, and the progress stays in a toast so the reader can keep writing meanwhile
import { toaster } from '$lib/modals/toaster-svelte';
import { openToolchainPrefs } from '$lib/stores/dialogStore';
import { observe } from '$lib/runes/observe.svelte';
import { tinymistInstaller } from './tinymistInstall.svelte';
import { tinymistFailureText, tinymistStepText } from './tinymistInstallText';
import { m } from '$lib/paraglide/messages';

export async function installTinymistWithToast(): Promise<void> {
	if (!tinymistInstaller.status) await tinymistInstaller.refresh();
	const version = tinymistInstaller.status?.pinned ?? '';
	const toast = toaster.create({
		type: 'loading',
		title: m.tinymist_installing_title(),
		description: m.tinymist_install_starting({ version }),
		duration: Infinity,
		action: { label: m.tinymist_install_cancel(), onClick: () => tinymistInstaller.cancel() }
	});
	const stopWatching = observe(
		() => tinymistInstaller.step,
		(step) => {
			if (step) toaster.update(toast, { description: tinymistStepText(step, version) });
		}
	);
	try {
		const result = await tinymistInstaller.install();
		if (!result) return;
		if (result.ok) {
			toaster.success({
				title: m.tinymist_installed_title(),
				description: m.tinymist_installed({ version: result.version ?? version, typst: result.typstVersion ?? '' })
			});
		} else if (result.reason !== 'cancelled') {
			toaster.error({
				title: m.tinymist_install_failed_title(),
				description: tinymistFailureText(result),
				duration: 10000,
				action: { label: m.compile_tool_missing_action(), onClick: openToolchainPrefs }
			});
		}
	} finally {
		stopWatching();
		toaster.dismiss(toast);
	}
}
