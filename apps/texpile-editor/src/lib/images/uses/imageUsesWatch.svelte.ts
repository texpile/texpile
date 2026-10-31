// where an image is used, kept current while its tab is open: read again once files stop changing
import { fileService } from '$lib/files/service/fileService';
import { findImageUses, type ImageUse } from './imageUses';

const SETTLE_MS = 400;

export class ImageUsesWatch {
	uses = $state.raw<ImageUse[]>([]);
	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly path: () => string,
		private readonly root: () => string | null
	) {}

	/** reads the uses now and on every change after; the returned function stops it */
	watch(): () => void {
		void this.read();
		const later = () => {
			clearTimeout(this.timer);
			this.timer = setTimeout(() => void this.read(), SETTLE_MS);
		};
		const offRan = fileService.onDidRunOperation(later);
		const offChanged = fileService.onDidFilesChange(later);
		return () => {
			clearTimeout(this.timer);
			offRan();
			offChanged();
		};
	}

	private async read(): Promise<void> {
		const root = this.root();
		this.uses = root ? await findImageUses(this.path(), root) : [];
	}
}
