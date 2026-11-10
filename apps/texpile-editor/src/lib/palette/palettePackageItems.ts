// the package file rows, one per package the open file loads without data or per file there is: named after it, so
// they are palette items rather than commands a key could name
import { Braces } from '@lucide/svelte';
import { snippetFiles } from '$lib/editor/snippets/file/snippetLoader';
import { packageFilePath } from '$lib/editor/snippets/file/snippetFiles';
import { draftPackageFile } from '$lib/editor/snippets/file/savePackageFile';
import { packagesWithoutData } from '$lib/editor/snippets/file/packagesWithoutData';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { sourceCmView } from '$lib/stores/editorStore';
import type { PaletteActions } from '$lib/workspace/commandPalette.svelte';
import type { PaletteItem } from './paletteCommands';
import { m } from '$lib/paraglide/messages';

export function packageFileItems(a: PaletteActions): PaletteItem[] {
	const items: PaletteItem[] = [];
	const group = m.palette_group_editor();
	const view = sourceCmView.current;
	const root = workspaceRoot.current;
	const project = !!root && a.isProject() && a.isHostWorkspace();
	if (view && root && project)
		for (const name of packagesWithoutData(view.state.doc.toString()).slice(0, 10))
			items.push({
				id: `editor.packageFile.${name}`,
				label: m.palette_save_package_file({ name }),
				group,
				keywords: 'package completion intellisense commands sty usepackage json latex workshop',
				icon: Braces,
				run: () => void draftPackageFile(root, name, (path) => a.openFile(path))
			});
	const files = snippetFiles();
	const editable = [
		...(project ? files.packages.project.map((name) => ({ name, layer: 'project' as const })) : []),
		...files.packages.global.map((name) => ({ name, layer: 'global' as const }))
	];
	for (const { name, layer } of editable) {
		const path = packageFilePath(layer, name, root, files);
		if (!path) continue;
		items.push({
			id: `editor.editPackageFile.${layer}.${name}`,
			label: layer === 'project' ? m.palette_edit_package_file({ name }) : m.palette_edit_global_package_file({ name }),
			group,
			keywords: 'package completion intellisense commands json latex workshop',
			icon: Braces,
			run: () => a.openFile(path)
		});
	}
	return items;
}
