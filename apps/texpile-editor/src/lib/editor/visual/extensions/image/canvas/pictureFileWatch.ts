// pictures drawn again when their file is written, by the image tab or another program; a missing one is looked for
// again when files arrive or the window comes back
import { FILES_ARRIVED, pathOfFileUrl } from '$lib/editor/visual/fileAccess';
import { extUri } from '$lib/files/identity/extUri';
import { fileUriOf } from '$lib/files/identity/fileUris';
import { fileService } from '$lib/files/service/fileService';
import { forgetPictures } from './imagePicture';

const watched = new WeakSet<Window>();

function fileOf(url: string): ReturnType<typeof fileUriOf> | null {
	const path = pathOfFileUrl(url);
	return path ? fileUriOf(path) : null;
}

export function watchPictureFiles(win: Window): void {
	if (watched.has(win)) return;
	watched.add(win);
	function lookAgain(): void {
		forgetPictures(win, () => false);
	}
	fileService.onDidRunOperation((e) => {
		if (!e.isOperation('write')) return lookAgain();
		forgetPictures(win, (url) => {
			const file = fileOf(url);
			return !!file && extUri.isEqual(e.resource, file);
		});
	});
	// a guest's picture is a blob of the host's bytes, read again at any new revision
	fileService.onDidFilesChange((e) =>
		forgetPictures(win, (url) => {
			const file = fileOf(url);
			return file ? e.contains(file, 'updated') : url.startsWith('blob:') && e.gotUpdated();
		})
	);
	win.addEventListener('focus', lookAgain);
	win.addEventListener(FILES_ARRIVED, lookAgain);
}
