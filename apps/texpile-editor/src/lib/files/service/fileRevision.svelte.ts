// how often one file has changed since a viewer began showing it: by another program, or by a write of this window's
import { fileService } from './fileService';
import { fileUriOf } from '../identity/fileUris';
import { extUri } from '../identity/extUri';

export class FileRevision {
	current = $state(0);
	readonly #path: () => string;

	constructor(path: () => string) {
		this.#path = path;
	}

	/** counts until the returned stop */
	watch(): () => void {
		const file = fileUriOf(this.#path());
		const offChanges = fileService.onDidFilesChange((e) => {
			if (e.contains(file, 'updated', 'added')) this.current++;
		});
		const offWrites = fileService.onDidRunOperation((e) => {
			if (e.isOperation('write') && extUri.isEqual(e.resource, file)) this.current++;
		});
		return () => {
			offChanges();
			offWrites();
		};
	}
}

/** the url read again at `revision`, as a compile's PDF is read again by its t=; a blob url takes no query */
export function urlAtRevision(url: string, revision: number): string {
	return revision && !url.startsWith('blob:') ? `${url}&t=${revision}` : url;
}
