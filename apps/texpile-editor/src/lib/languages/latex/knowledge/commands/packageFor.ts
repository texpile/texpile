// the package to load for a command or environment, from the packages with a catalog rank
import packageForIndex from '../data/package-for.json';
import { useNameOf } from '../fileIds';
import type { PackageForIndex } from '../types';

const INDEX = packageForIndex as PackageForIndex;

/** the use name of the package defining a command (no backslash) or environment; none for a name the kernel defines or no package does */
export function packageDefining(kind: 'command' | 'environment', name: string): string | undefined {
	const names = kind === 'command' ? INDEX.macros : INDEX.envs;
	const key = kind === 'command' ? name : name.replace(/\*$/, '');
	return Object.hasOwn(names, key) ? useNameOf(names[key]) : undefined;
}
