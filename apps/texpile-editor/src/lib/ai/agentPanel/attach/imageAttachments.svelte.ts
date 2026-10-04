// the images going with the next message, however they came: pasted, dropped on the box or picked from the computer
import { imageFiles, readImage } from './pastedImages';
import type { PastedImage } from '../agentPanel.types';

export class ImageAttachments {
	list = $state<PastedImage[]>([]);
	/** images offered to an agent that takes none: said under the box until the next key, rather than lost unsaid */
	refused = $state(false);

	constructor(private readonly takesImages: () => boolean) {}

	/** true when there were images to take, so the paste or drop that brought them goes no further */
	add(files: FileList | null | undefined): boolean {
		const found = imageFiles(files);
		if (!found.length) return false;
		if (!this.takesImages()) {
			this.refused = true;
			return false;
		}
		void Promise.all(found.map(readImage)).then((read) => (this.list = [...this.list, ...read]));
		return true;
	}

	remove(index: number): void {
		this.list = this.list.filter((_, i) => i !== index);
	}

	clear(): void {
		this.list = [];
	}
}
