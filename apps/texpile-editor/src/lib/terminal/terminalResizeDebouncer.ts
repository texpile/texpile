/* eslint-disable @typescript-eslint/naming-convention -- VS Code's names, kept so this diffs cleanly against the original */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See VSCODE-LICENSE.txt beside this file for license information.
 *--------------------------------------------------------------------------------------------*/

// VS Code's terminalResizeDebouncer.ts, with its disposables and schedulers swapped for plain timers

import type { Terminal } from '@xterm/xterm';

const enum Constants {
	/**
	 * The _normal_ buffer length threshold at which point resizing starts being debounced.
	 */
	StartDebouncingThreshold = 200,
	DebounceResizeXDelay = 100
}

// requestIdleCallback where the window has it
function whenIdle(win: Window, run: () => void): () => void {
	if (typeof win.requestIdleCallback === 'function') {
		const handle = win.requestIdleCallback(run);
		return () => win.cancelIdleCallback(handle);
	}
	const handle = win.setTimeout(run);
	return () => win.clearTimeout(handle);
}

export class TerminalResizeDebouncer {
	private _latestX = 0;
	private _latestY = 0;
	private _disposed = false;

	private _resizeXJob: (() => void) | null = null;
	private _resizeYJob: (() => void) | null = null;
	private _debounceResizeXTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly _isVisible: () => boolean,
		private readonly _getXterm: () => Terminal | null,
		private readonly _resizeBothCallback: (cols: number, rows: number) => void,
		private readonly _resizeXCallback: (cols: number) => void,
		private readonly _resizeYCallback: (rows: number) => void
	) {}

	resize(cols: number, rows: number, immediate: boolean): void {
		const xterm = this._getXterm();
		if (this._disposed || !xterm) {
			return;
		}
		this._latestX = cols;
		this._latestY = rows;

		// Resize immediately if requested explicitly or if the buffer is small
		if (immediate || xterm.buffer.normal.length < Constants.StartDebouncingThreshold) {
			this._clearJobs();
			this._resizeBothCallback(cols, rows);
			return;
		}

		// Resize in an idle callback if the terminal is not visible
		const win = xterm.element?.ownerDocument.defaultView;
		if (win && !this._isVisible()) {
			this._resizeXJob ??= whenIdle(win, () => {
				this._resizeXJob = null;
				if (!this._disposed) this._resizeXCallback(this._latestX);
			});
			this._resizeYJob ??= whenIdle(win, () => {
				this._resizeYJob = null;
				if (!this._disposed) this._resizeYCallback(this._latestY);
			});
			return;
		}

		// Update dimensions independently as vertical resize is cheap and horizontal resize is
		// expensive due to reflow.
		this._resizeYCallback(rows);
		this._latestX = cols;
		if (this._debounceResizeXTimer !== null) clearTimeout(this._debounceResizeXTimer);
		this._debounceResizeXTimer = setTimeout(() => {
			this._debounceResizeXTimer = null;
			if (!this._disposed) this._resizeXCallback(this._latestX);
		}, Constants.DebounceResizeXDelay);
	}

	flush(): void {
		if (this._disposed) {
			return;
		}
		if (this._resizeXJob || this._resizeYJob || this._debounceResizeXTimer !== null) {
			this._clearJobs();
			this._resizeBothCallback(this._latestX, this._latestY);
		}
	}

	dispose(): void {
		this._disposed = true;
		this._clearJobs();
	}

	private _clearJobs(): void {
		this._resizeXJob?.();
		this._resizeYJob?.();
		this._resizeXJob = null;
		this._resizeYJob = null;
		if (this._debounceResizeXTimer !== null) clearTimeout(this._debounceResizeXTimer);
		this._debounceResizeXTimer = null;
	}
}
