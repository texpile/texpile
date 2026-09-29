// a path a guest named, judged by where it really lands on the host's disk
import { isSafeRel } from './protocol';
import { isShared } from './materialize';

/** root-relative path to where it really resolves, or null when that is outside the root */
export type RealRelativeResolver = (root: string, rel: string) => Promise<string | null>;

/** the root-relative path `rel` really names when the share covers it there, else null */
export async function resolveSharedTarget(root: string, rel: string, resolve: RealRelativeResolver): Promise<string | null> {
	if (!isSafeRel(rel) || !isShared(rel)) return null;
	const real = await resolve(root, rel).catch(() => null);
	return real && isShared(real) ? real : null;
}
