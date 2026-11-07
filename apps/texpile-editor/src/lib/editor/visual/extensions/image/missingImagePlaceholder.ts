// a picture whose file is not there, said in one quiet line of the text's own size
import { m } from '$lib/paraglide/messages';

export function missingImageNote(path: string): HTMLElement {
	const note = document.createElement('span');
	note.className = 'image-missing';
	note.textContent = m.image_missing_note({ path });
	note.dataset.missing = '';
	return note;
}
