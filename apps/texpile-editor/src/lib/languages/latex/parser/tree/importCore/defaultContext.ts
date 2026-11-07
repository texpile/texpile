import type { ConversionContext } from '../../builders';

export function createDefaultContext(): ConversionContext {
	return { marks: [], inMathMode: false, inlineBuffer: [] };
}
