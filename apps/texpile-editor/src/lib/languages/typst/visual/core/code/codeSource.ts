import { isCodeChip } from '../../../syntax/codeChip';

export function hashedCode(source: string): string {
	return isCodeChip(source) ? `#${source.trimStart()}` : source;
}
