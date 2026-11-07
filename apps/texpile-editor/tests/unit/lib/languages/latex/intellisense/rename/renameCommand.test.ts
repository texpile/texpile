import { expect, it } from 'vitest';
import { renameLabelOf } from '$lib/languages/latex/intellisense/rename/renameCommand';

it('titles the rename card for what it renames', () => {
	expect([renameLabelOf('label'), renameLabelOf('cite'), renameLabelOf('glossary')]).toEqual([
		'Rename Label',
		'Rename Citation Key',
		'Rename Glossary Entry'
	]);
});
