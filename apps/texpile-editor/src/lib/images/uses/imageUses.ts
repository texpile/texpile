import { textNow } from '$lib/buffers/textNow';
import { fileService } from '$lib/files/service/fileService';
import { fileRefOffsets, refDialectOf, REF_SCAN_EXTS } from '$lib/workspace/fileRefs';
import { refPlaceOf } from '$lib/workspace/refPlace';
import { documentMainFile } from '$lib/workspace/workspaceStore';
import { relFromRoot } from '$lib/workspace/compileResolve';
import { GUEST_ROOT, guestRelPath } from '$lib/collab/sessionProvider';
import { paperCropsAt } from './paperCropsAt';

/** `cropped`: the document crops the image, measured against the file as it is now */
export type ImageUse = { path: string; line: number; cropped: boolean };

function lineAt(text: string, offset: number): number {
	let line = 1;
	for (let i = text.indexOf('\n'); i >= 0 && i < offset; i = text.indexOf('\n', i + 1)) line++;
	return line;
}

export function pathInFolder(path: string, root: string): string {
	return root === GUEST_ROOT ? guestRelPath(path) : relFromRoot(path, root);
}

export async function findImageUses(imagePath: string, root: string): Promise<ImageUse[]> {
	const rel = pathInFolder(imagePath, root);
	const uses: ImageUse[] = [];
	const main = documentMainFile();
	const mainText = main ? await textNow(main).catch(() => '') : '';
	for (const file of await fileService.scanFiles(root, REF_SCAN_EXTS)) {
		const dialect = refDialectOf(file.path);
		if (!dialect) continue;
		const text = await textNow(file.path).catch(() => '');
		const place = refPlaceOf(dialect, pathInFolder(file.path, root), main && pathInFolder(main, root), text, mainText);
		for (const at of fileRefOffsets(text, rel, dialect, place)) {
			uses.push({ path: file.path, line: lineAt(text, at), cropped: paperCropsAt(text, at, dialect) });
		}
	}
	return uses;
}
