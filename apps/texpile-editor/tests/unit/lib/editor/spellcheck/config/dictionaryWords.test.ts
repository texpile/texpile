import { describe, expect, it } from 'vitest';
import { matching, wordsIn } from '$lib/editor/spellcheck/config/dictionaryWords';

describe('wordsIn', () => {
	it('reads a typed word, or a pasted list, as the dictionary keeps words', () => {
		expect(wordsIn('  ResNet ')).toEqual(['resnet']);
		expect(wordsIn('softmax, ReLU;dropout\nsoftmax  imagenet')).toEqual(['softmax', 'relu', 'dropout', 'imagenet']);
		expect(wordsIn(' ,; ')).toEqual([]);
	});
});

describe('matching', () => {
	const words = ['texpile', 'resnet', 'softmax', 'arxiv', 'preresnet'];

	it('lists every word alphabetically for an empty box', () => {
		expect(matching(words, '')).toEqual(['arxiv', 'preresnet', 'resnet', 'softmax', 'texpile']);
	});

	it('puts the words starting with what is typed before those only holding it', () => {
		expect(matching(words, 'RES')).toEqual(['resnet', 'preresnet']);
		expect(matching(words, 'zzz')).toEqual([]);
	});
});
