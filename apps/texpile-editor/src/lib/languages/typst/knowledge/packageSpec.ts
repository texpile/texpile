import type { TypstPackageSpec } from './types';

const SPEC = /^@([\w-]+)\/([\w-]+):(\d+\.\d+\.\d+)$/;

/** `@preview/glossarium:0.5.10` read apart; null for a path that is no package */
export function packageSpecOf(spec: string): TypstPackageSpec | null {
	const m = SPEC.exec(spec);
	return m ? { namespace: m[1], name: m[2], version: m[3] } : null;
}
