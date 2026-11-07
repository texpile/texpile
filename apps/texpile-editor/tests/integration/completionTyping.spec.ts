import { expect, test } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';
import { acceptCompletion } from './driver/completionHelpers';

const texpile = useTexpile();

const INTRO = '\\section{Introduction}\\label{sec:intro}\n';

test('Enter takes \\toprule and leaves the caret after it', async () => {
	const { source } = texpile();
	const r = await acceptCompletion(source, { file: 'main.tex', anchor: INTRO, typed: '\\topr' }, { pick: '\\toprule' });
	expect(r.line).toBe('\\toprule|');
});
