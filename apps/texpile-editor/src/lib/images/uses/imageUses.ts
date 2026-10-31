// the documents that include an image, at the lines that do
import { textNow } from '$lib/buffers/textNow';
import { fileService } from '$lib/files/service/fileService';
import { fileRefOffsets, refDialectOf, REF_SCAN_EXTS } from '$lib/workspace/fileRefs';
import { relFromRoot } from '$lib/workspace/compileResolve';

export type ImageUse = { path: string; line: number };

function lineAt(text: string, offset: number): number {
	let line = 1;
	for (let i = text.indexOf('\n'); i >= 0 && i < offset; i = text.indexOf('\n', i + 1)) line++;
	return line;
}

export async function findImageUses(imagePath: string, root: string): Promise<ImageUse[]> {
	const rel = relFromRoot(imagePath, root);
	const uses: ImageUse[] = [];
	for (const file of await fileService.scanFiles(root, REF_SCAN_EXTS)) {
		const dialect = refDialectOf(file.path);
		if (!dialect) continue;
		const text = await textNow(file.path).catch(() => '');
		for (const at of fileRefOffsets(text, rel, dialect)) uses.push({ path: file.path, line: lineAt(text, at) });
	}
	return uses;
}
