import { describe, expect, it } from 'vitest';
import { buildManifest, newestFirst } from '../../../scripts/versions-json.mjs';

describe('versions-json', () => {
	it('puts a release ahead of its release candidates and a later candidate ahead of an earlier one', () => {
		const versions = ['1.0.0-rc.3', '0.17.1', '2.0.0', '1.0.0', '1.0.0-rc.4', '1.10.0', '1.9.2'];
		expect(versions.sort(newestFirst)).toEqual(['2.0.0', '1.10.0', '1.9.2', '1.0.0', '1.0.0-rc.4', '1.0.0-rc.3', '0.17.1']);
	});

	it('lists each release by the files the host serves, with the date and notes already written before the changelog', () => {
		const manifest = buildManifest({
			versions: ['1.6.2', '2.0.0', '1.0.0-rc.1', '2.0.0'],
			served: new Set([
				'v2.0.0/Texpile-Setup-2.0.0.exe',
				'v2.0.0/Texpile.AppImage',
				'v1.6.2/Texpile-1.6.2.AppImage',
				'v1.6.2/texpile-1.6.2.deb'
			]),
			known: [{ version: '2.0.0', publishedAt: '2026-11-10T22:20:13.119Z', notes: ['as published'] }],
			changelog: [
				{ version: '2.0.0', date: '2026-11-10', notes: ['from the changelog'] },
				{ version: '1.6.2', date: '2026-10-24', notes: ['a fix'] }
			]
		});
		expect(manifest.versions).toEqual([
			{
				version: '2.0.0',
				publishedAt: '2026-11-10T22:20:13.119Z',
				files: { windows: 'v2.0.0/Texpile-Setup-2.0.0.exe', linuxAppImage: 'v2.0.0/Texpile.AppImage' },
				notes: ['as published']
			},
			{
				version: '1.6.2',
				publishedAt: '2026-10-24T00:00:00.000Z',
				files: { linuxAppImage: 'v1.6.2/Texpile-1.6.2.AppImage', linuxDeb: 'v1.6.2/texpile-1.6.2.deb' },
				notes: ['a fix']
			}
		]);
	});
});
