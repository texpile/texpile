import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/** the folder copy a window has open, read and written the way the app's own saves see it */
export class Disk {
	constructor(readonly root: string) {}

	path(rel: string): string {
		return path.join(this.root, rel);
	}

	read(rel: string): string {
		return fs.readFileSync(this.path(rel), 'utf8');
	}

	readBytes(rel: string): Buffer {
		return fs.readFileSync(this.path(rel));
	}

	write(rel: string, text: string): void {
		fs.writeFileSync(this.path(rel), text);
	}

	/** waits for autosave to put the file on disk in the expected state */
	async expectFile(rel: string, check: (text: string) => boolean, message: string, timeout = 20_000): Promise<string> {
		let last = '';
		try {
			await expect
				.poll(
					() => {
						last = this.read(rel);
						return check(last);
					},
					{ timeout, message }
				)
				.toBe(true);
		} catch (e) {
			throw new Error(`${message}\n--- ${rel} on disk ---\n${last}\n---`, { cause: e });
		}
		return last;
	}

	/** the file's text stays as given for a while: the check that nothing wrote over it */
	async expectUnchanged(rel: string, original: string, ms = 1500): Promise<void> {
		await new Promise((r) => setTimeout(r, ms));
		expect(this.read(rel), `${rel} on disk`).toBe(original);
	}
}
