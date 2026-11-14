import { expect, it } from 'vitest';
import { openEnvironment } from '../../../../../../electron/src/draft/openEnvironment';

it('names the environment a document ended inside, across a wrapped log line', () => {
	const log = [
		'! LaTeX Error: \\begin{figure} on input line 152 ended by \\end{document}.',
		'',
		'! LaTeX Error: \\begin{averyveryverylongenvironmentname} on input line 9 ended by \\end{docu',
		'ment}.'
	];
	expect(openEnvironment(log.slice(0, 1).join('\n'))).toEqual({ name: 'figure', line: 152 });
	expect(openEnvironment(log.slice(2).join('\n'))).toEqual({ name: 'averyveryverylongenvironmentname', line: 9 });
	expect(openEnvironment('! Undefined control sequence.')).toBeNull();
});
