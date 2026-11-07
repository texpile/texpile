// what went wrong installing tinymist, in the words the renderer explains it with
export type TinymistInstallFailure =
	/** tinymist publishes no build for this OS and CPU */
	| 'unsupported'
	/** dl.texpile.com could not be reached at all */
	| 'offline'
	/** dl.texpile.com answered, but not with the whole archive */
	| 'download'
	/** the archive is not the one the release published */
	| 'checksum'
	| 'extract'
	/** no space, no permission, a read-only folder */
	| 'disk'
	/** unpacked, but the program does not run here */
	| 'broken'
	| 'cancelled';

// the error codes a full or locked disk, or a folder the user may not write, surface as
const DISK_CODES = new Set(['ENOSPC', 'EDQUOT', 'EACCES', 'EPERM', 'EROFS', 'EBUSY']);

/** thrown between the install's steps, and turned into a result where the install returns */
export class TinymistInstallError extends Error {
	constructor(
		readonly reason: TinymistInstallFailure,
		message: string,
		options?: ErrorOptions
	) {
		super(message, options);
	}

	/** `err` as it stands, or as `fallback` unless it is the disk refusing */
	static from(err: unknown, fallback: TinymistInstallFailure): TinymistInstallError {
		if (err instanceof TinymistInstallError) return err;
		const code = (err as NodeJS.ErrnoException | null)?.code;
		const message = err instanceof Error ? err.message : String(err);
		return new TinymistInstallError(code && DISK_CODES.has(code) ? 'disk' : fallback, message, { cause: err });
	}
}
