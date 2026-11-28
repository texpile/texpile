// what went wrong installing a program Texpile fetches, in the words the renderer explains it with
export type InstallFailure =
	/** no build for this OS and CPU */
	| 'unsupported'
	/** dl.texpile.com could not be reached at all */
	| 'offline'
	/** dl.texpile.com answered, but not with the whole archive */
	| 'download'
	/** the archive is not the one the release published */
	| 'checksum'
	| 'extract'
	/** no permission, a read-only folder */
	| 'disk'
	| 'space'
	/** Windows refused the move because a program holds a file in the folder open; detail names the programs */
	| 'in-use'
	/** unpacked, but the program does not run here */
	| 'broken'
	| 'cancelled';

// the error codes a locked disk, or a folder the user may not write, surface as
const DISK_CODES = new Set(['EACCES', 'EPERM', 'EROFS', 'EBUSY']);
const SPACE_CODES = new Set(['ENOSPC', 'EDQUOT']);

/** thrown between the install's steps, and turned into a result where the install returns */
export class InstallError extends Error {
	constructor(
		readonly reason: InstallFailure,
		message: string,
		options?: ErrorOptions
	) {
		super(message, options);
	}

	/** `err` as it stands, or as `fallback` unless it is the disk refusing */
	static from(err: unknown, fallback: InstallFailure): InstallError {
		if (err instanceof InstallError) return err;
		const code = (err as NodeJS.ErrnoException | null)?.code;
		const message = err instanceof Error ? err.message : String(err);
		const reason = code && SPACE_CODES.has(code) ? 'space' : code && DISK_CODES.has(code) ? 'disk' : fallback;
		return new InstallError(reason, message, { cause: err });
	}
}
