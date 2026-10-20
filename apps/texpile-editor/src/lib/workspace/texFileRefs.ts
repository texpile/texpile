// which file a written LaTeX name points at and how to write a new one, from the extension TeX adds to the argument
import { namesTried } from '$lib/languages/latex/knowledge/calls/fileCommands';
import { rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';
import type { TexFileRef } from './fileRefs';

const HAS_EXT = /\.[A-Za-z0-9]+$/;

function stripExt(p: string): string {
	return p.replace(/\.[^./\\]+$/, '');
}

function extOf(p: string): string {
	return HAS_EXT.exec(p)?.[0].toLowerCase() ?? '';
}

function inDir(under: string, path: string): string {
	return under ? `${under.replace(/^\.\//, '').replace(/\/+$/, '')}/${path}` : path;
}

/** the path from `under` to `rel`, with ../ for the folders left behind */
function relativeTo(under: string, rel: string): string {
	const dir = inDir(under, '').split('/').filter(Boolean);
	const parts = rel.split('/');
	let same = 0;
	while (same < dir.length && same < parts.length - 1 && dir[same] === parts[same]) same++;
	return '../'.repeat(dir.length - same) + parts.slice(same).join('/');
}

// a graphic written without an extension stands for the file graphicx finds
function stemOf(tex: TexFileRef, full: string, target: string): boolean {
	if (!rolesOf(tex.arg).includes('graphic') || HAS_EXT.test(full) || stripExt(target) !== full) return false;
	return !tex.arg.accepts || tex.arg.accepts.includes(extOf(target));
}

/** `path` is the name as written, without a leading ./ */
export function texRefPointsAt(tex: TexFileRef, path: string, targetRel: string): boolean {
	const full = inDir(tex.under, path);
	if (tex.arg.ext) return namesTried(tex.arg, full).includes(targetRel);
	return full === targetRel || stemOf(tex, full, targetRel);
}

/** the name to write for `newRel` in place of `path`, which pointed at `oldRel`; a name written without the extension TeX adds stays so */
export function texRefRender(tex: TexFileRef, path: string, newRel: string, oldRel: string): string {
	const { arg, under } = tex;
	let written = newRel;
	if (inDir(under, path) !== oldRel) {
		if (arg.ext) written = newRel.endsWith(arg.ext) ? newRel.slice(0, -arg.ext.length) : newRel;
		else if (!arg.accepts || arg.accepts.includes(extOf(newRel))) written = stripExt(newRel);
	}
	return under ? relativeTo(under, written) : written;
}
