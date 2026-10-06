// Templates: the ones a user saves from their own projects (under userData, so a portable copy keeps
// them beside the exe), and the Typst Universe gallery, whose requests go through net.fetch for
// the system's proxy settings and only ever run when the gallery asks.
import { app, ipcMain, net } from 'electron';
import { join } from 'node:path';
import { handleFs } from './ipcResult';
import { surveyProject } from '../templates/templateSurvey';
import {
	applyUserTemplate,
	deleteUserTemplate,
	listUserTemplates,
	saveUserTemplate,
	updateUserTemplate,
	type SaveTemplateRequest
} from '../templates/userTemplates';
import { adoptStagedDir, createStagedDir, discardStagedDir, ownStagedDir } from '../templates/templateStaging';
import { fetchTemplateIndex, fetchThumbnail } from '../templates/typstUniverse';
import { unpackUniverseTemplate } from '../templates/universeUnpack';
import { resolveTinymist } from '../typstService';

// past this many files the walk stops: a folder that big is a data dump, not a template
const SURVEY_MAX_FILES = 2000;

function templatesDir(): string {
	return join(app.getPath('userData'), 'templates');
}

function requireRoot(root: unknown): string {
	if (typeof root !== 'string' || !root) throw new Error('Missing folder');
	return root;
}

export function registerTemplatesIpc(): void {
	handleFs('templates:list', () => listUserTemplates(templatesDir()));
	handleFs('templates:survey', async (root: unknown) => surveyProject(requireRoot(root), SURVEY_MAX_FILES));
	handleFs('templates:save', async (req: SaveTemplateRequest) =>
		saveUserTemplate(templatesDir(), { ...req, root: requireRoot(req?.root) })
	);
	handleFs('templates:update', async (body: { id: string; name: string; description: string }) =>
		updateUserTemplate(templatesDir(), body?.id, body?.name, body?.description)
	);
	handleFs('templates:delete', async (id: string) => deleteUserTemplate(templatesDir(), id));
	handleFs('templates:apply', async (body: { id: string; root: string }) =>
		applyUserTemplate(templatesDir(), body?.id, requireRoot(body?.root))
	);
	handleFs('templates:stage', () => createStagedDir(templatesDir()));
	handleFs('templates:adopt', async (body: { dir: string; root: string }) =>
		adoptStagedDir(templatesDir(), body?.dir, requireRoot(body?.root))
	);
	handleFs('templates:discard', async (dir: string) => discardStagedDir(templatesDir(), dir));

	const userAgent = `Texpile/${app.getVersion()} (https://texpile.com)`;
	ipcMain.handle('templates:universeIndex', async () => {
		const tinymist = await resolveTinymist(app.getPath('userData'));
		return fetchTemplateIndex((url, init) => net.fetch(url, init), userAgent, tinymist?.typstVersion ?? null);
	});
	ipcMain.handle('templates:universeThumbnail', (_e, body: { name: unknown; version: unknown }) =>
		fetchThumbnail((url, init) => net.fetch(url, init), userAgent, body?.name, body?.version)
	);
	handleFs('templates:universeUnpack', async (body: { name: unknown; version: unknown; dir: unknown }) =>
		unpackUniverseTemplate(
			(url, init) => net.fetch(url, init),
			userAgent,
			body?.name,
			body?.version,
			ownStagedDir(templatesDir(), body?.dir)
		)
	);
}
