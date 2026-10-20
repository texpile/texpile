// the add-package fix for a file that holds none of the preamble: the line goes into the document's main file
import { m } from '$lib/paraglide/messages';
import { addPackageElsewhere } from '$lib/stores/editorStore';
import { addPackageInsertion } from '$lib/languages/latex/intellisense/packages/packageInsertion';
import { basename } from '$lib/workspace/fileSystem';
import { replaceInFiles } from '$lib/search/replaceInFiles';
import { attempt, replaceDeps, report, type FolderReplaceDeps } from './workspaceReplace';

export type AddPackageDeps = FolderReplaceDeps & {
	/** the other files of the project are the host's to write */
	elsewhere: () => boolean;
};

/** for as long as the workspace is mounted, on the host only */
export function bindAddPackage(d: AddPackageDeps): () => void {
	if (!d.elsewhere()) return () => {};
	const deps = replaceDeps(d);
	async function add(path: string, name: string): Promise<void> {
		function edits(text: string) {
			const at = addPackageInsertion(text, name);
			return at ? [{ from: at.at, to: at.at, insert: at.insert }] : [];
		}
		const out = await attempt(() => replaceInFiles([path], { edits }, deps));
		if (!out) return;
		const command = `\\usepackage{${name}}`;
		report(out, d.history(), {
			title: m.lint_added_package_to_file({ command, file: basename(path) }),
			label: m.lint_add_package_to_file({ command, file: basename(path) }),
			nothing: null
		});
	}
	addPackageElsewhere.current = add;
	return () => {
		if (addPackageElsewhere.current === add) addPackageElsewhere.current = null;
	};
}
