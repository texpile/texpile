import { isLatexCheckId, setFolderCheck, setLatexCheck } from '$lib/languages/latex/intellisense/checks/checkSwitches';
import { checkName } from '$lib/languages/latex/intellisense/checks/checkTexts';
import { settings } from '$lib/settings';
import { toaster } from '$lib/modals/toaster-svelte';
import { projectChecks } from '$lib/workspace/projectConfigSync.svelte';
import { m } from '$lib/paraglide/messages';

/** the "Turn off" button of a diagnostic card: the check stops everywhere, and the toast puts it back */
export function turnOffLatexCheck(rule: string): void {
	if (!isLatexCheckId(rule)) return;
	const before = settings.current.latexChecks?.[rule];
	// a folder that pins the check on keeps it on over the app's setting
	const pinned = projectChecks.current[rule] === true;
	setLatexCheck(rule, false);
	if (pinned) setFolderCheck(rule, false);
	toaster.success({
		title: (pinned ? m.latex_check_turned_off_folder : m.latex_check_turned_off)({ check: checkName(rule) }),
		action: {
			label: m.menubar_undo(),
			onClick: () => {
				setLatexCheck(rule, before);
				if (pinned) setFolderCheck(rule, true);
			}
		}
	});
}
