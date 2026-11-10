// an old copy opened mid-install locks files the Windows update moves ("Failed to uninstall old application files")
import { app } from 'electron';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type InstallMarker = { from: string; installer: string; at: number };

// past this the install is over, whatever the marker says
const MARKER_LIFETIME_MS = 10 * 60_000;

let installing = false;

export function installInFlight(): boolean {
	return installing;
}

function markerPath(): string {
	return path.join(app.getPath('userData'), 'update-installing.json');
}

export function markInstallStarted(installer: string | null): void {
	installing = true;
	if (process.platform !== 'win32' || !installer) return;
	const marker: InstallMarker = { from: app.getVersion(), installer: path.basename(installer), at: Date.now() };
	try {
		fs.writeFileSync(markerPath(), JSON.stringify(marker));
	} catch {
		/* the launch guard is lost, the install goes ahead */
	}
}

export function clearInstallMark(): void {
	installing = false;
	try {
		fs.rmSync(markerPath(), { force: true });
	} catch {
		/* nothing to clear */
	}
}

export function isMidInstall(marker: InstallMarker, version: string, now: number, installerRunning: (image: string) => boolean): boolean {
	return marker.from === version && now - marker.at < MARKER_LIFETIME_MS && installerRunning(marker.installer);
}

function processRunning(image: string): boolean {
	const list = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
	return (list.stdout ?? '').toLowerCase().includes(`"${image.toLowerCase()}"`);
}

export function launchedMidInstall(): boolean {
	if (process.platform !== 'win32') return false;
	let marker: InstallMarker;
	try {
		marker = JSON.parse(fs.readFileSync(markerPath(), 'utf8')) as InstallMarker;
	} catch {
		return false;
	}
	const midInstall = isMidInstall(marker, app.getVersion(), Date.now(), processRunning);
	if (!midInstall) clearInstallMark();
	return midInstall;
}
