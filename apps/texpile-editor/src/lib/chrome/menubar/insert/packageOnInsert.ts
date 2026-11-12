import { activeCm } from '$lib/chrome/menuBarCommands';
import { editPreambleHere } from '$lib/stores/editorStore';
import { addPackageInsertion } from '$lib/languages/latex/intellisense/packages/packageInsertion';
import { preambleOf } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { loadsNeed, withPackageNeeded, type PackageNeed } from '$lib/languages/latex/intellisense/packages/packageNeed';

export type { PackageNeed };

export function amsmathFor(environment: string): PackageNeed {
	return { name: 'amsmath', environment };
}
export const GRAPHICX: PackageNeed = { name: 'graphicx', command: 'includegraphics' };
export const TIKZ: PackageNeed = { name: 'tikz', environment: 'tikzpicture' };

export function ensurePackage(need: PackageNeed): void {
	const cm = activeCm();
	if (!cm) return void editPreambleHere.current?.((preamble) => withPackageNeeded(preamble, need));
	const text = cm.state.doc.toString();
	if (loadsNeed(preambleOf(text), need)) return;
	const at = addPackageInsertion(text, need.name);
	if (at) cm.dispatch({ changes: { from: at.at, insert: at.insert } });
}
