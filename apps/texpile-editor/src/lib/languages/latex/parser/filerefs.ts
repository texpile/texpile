// LaTeX's contribution to the move-aware reference updater: every file name in a call of a command the package data
// gives a file argument, with the span holding the name. Matching and the splice are shared, see workspace/fileRefs.ts.
import { dirOf, fileCallsIn } from '../knowledge/calls/fileCommands';
import type { FileRole } from '../knowledge/types';
import { rolesOf } from '../knowledge/calls/commandCalls';
import { codeOnly } from '../texCode';
import { graphicExtensionsFor } from '../knowledge/registries/graphicExtensions';
import { compileEngine } from '../intellisense/packages/loadedPackages';
import type { FileRef } from '$lib/workspace/fileRefs';

const REF_ROLES: FileRole[] = ['file', 'listing', 'graphic', 'bibfile'];

/** Every file name in `latex`, with the span holding the name itself. */
export function collectLatexFileRefs(latex: string): FileRef[] {
	const out: FileRef[] = [];
	for (const call of fileCallsIn(codeOnly(latex), REF_ROLES)) {
		for (const a of call.args) {
			// a path relative to the file the call sits in needs that file's folder, which the updater is not given
			if (a.arg.from === 'file' || !rolesOf(a.arg).some((r) => (REF_ROLES as string[]).includes(r))) continue;
			const graphic = rolesOf(a.arg).includes('graphic');
			const arg = graphic && !a.arg.accepts ? { ...a.arg, accepts: graphicExtensionsFor(compileEngine()) } : a.arg;
			const tex = { arg, under: dirOf(call, a) };
			for (const v of a.values) out.push({ innerStart: v.at, innerEnd: v.at + v.value.length, current: v.value, tex });
		}
	}
	return out;
}
