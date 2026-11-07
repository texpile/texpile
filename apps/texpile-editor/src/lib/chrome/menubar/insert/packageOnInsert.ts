import { activeCm } from '$lib/chrome/menuBarCommands';
import { editPreambleHere } from '$lib/stores/editorStore';
import { addPackageInsertion } from '$lib/languages/latex/intellisense/packages/packageInsertion';
import { documentPackagesNow, preambleOf } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { packageUsesIn } from '$lib/languages/latex/intellisense/packages/packageUses';
import { stackedCommands, stackedEnvironments } from '$lib/languages/latex/knowledge/stackedEntries';

export type PackageNeed = { name: string; environment?: string; command?: string };

export function amsmathFor(environment: string): PackageNeed {
	return { name: 'amsmath', environment };
}
export const GRAPHICX: PackageNeed = { name: 'graphicx', command: 'includegraphics' };

function loads(preamble: string, need: PackageNeed): boolean {
	const loaded = documentPackagesNow(preamble);
	if (!loaded) return packageUsesIn(preamble).some((use) => use.name === need.name);
	if (need.environment) return stackedEnvironments(loaded).has(need.environment);
	return !!need.command && stackedCommands(loaded).has(need.command);
}

function withPackage(text: string, need: PackageNeed): string {
	if (loads(preambleOf(text), need)) return text;
	const at = addPackageInsertion(text, need.name);
	return at ? text.slice(0, at.at) + at.insert + text.slice(at.at) : text;
}

export function ensurePackage(need: PackageNeed): void {
	const cm = activeCm();
	if (!cm) return void editPreambleHere.current?.((preamble) => withPackage(preamble, need));
	const text = cm.state.doc.toString();
	if (loads(preambleOf(text), need)) return;
	const at = addPackageInsertion(text, need.name);
	if (at) cm.dispatch({ changes: { from: at.at, insert: at.insert } });
}
