// which C library this Linux runs, for the builds Texpile downloads
// tinymist's gnu builds (a manylinux_2_28 container) and TeX Live's LuaTeX both link glibc 2.28
const GNU_MIN_GLIBC = [2, 28];

export type Libc = 'gnu' | 'musl';

/**
 * Which Linux build runs here, from the glibc version the runtime reports (undefined off glibc).
 *
 * gnu wherever it can run: the musl build is static and runs anywhere, but tinymist brings no
 * allocator of its own, so on musl it compiles with musl's malloc, which is markedly slower.
 */
export function linuxLibc(glibcVersion: string | undefined): Libc {
	const parts = (glibcVersion ?? '').split('.').map(Number);
	if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return 'musl';
	const [major, minor] = parts;
	return major > GNU_MIN_GLIBC[0] || (major === GNU_MIN_GLIBC[0] && minor >= GNU_MIN_GLIBC[1]) ? 'gnu' : 'musl';
}

// process.report is how Node tells glibc from musl
function glibcVersion(): string | undefined {
	try {
		const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
		return report?.header?.glibcVersionRuntime;
	} catch {
		return undefined;
	}
}

/** this machine's; gnu off Linux, where nothing reads it */
export function currentLibc(): Libc {
	return process.platform === 'linux' ? linuxLibc(glibcVersion()) : 'gnu';
}
