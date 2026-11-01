import type { RefDialect } from '$lib/workspace/fileRefs';

const LATEX_CALL = /\\includegraphics\*?\s*\[([^\]]*)\]\s*\{\s*$/;
const TYPST_CALL = /texpile-crop\(([^()]*)image\(\s*"$/;

/** whether the reference to a file at `at` also cuts it; a turn alone stays right whatever the file holds */
export function paperCropsAt(text: string, at: number, dialect: RefDialect): boolean {
	const before = text.slice(Math.max(0, at - 2000), at);
	if (dialect === 'tex') return /(^|[\s,])(trim|viewport|bb|bbllx|natwidth)\s*=/.test(LATEX_CALL.exec(before)?.[1] ?? '');
	if (dialect === 'typ') return /(left|top|right|bottom)\s*:/.test(TYPST_CALL.exec(before)?.[1] ?? '');
	return false;
}
