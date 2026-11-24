// The answer a proofread asks for, as a JSON schema: per paragraph, a verdict on each Harper finding and the model's own
import type { JSONSchema7 } from 'ai';

const OBJECT = { type: 'object', additionalProperties: false } as const;
const INTEGER = { type: 'integer' } as const;
const STRING = { type: 'string' } as const;

const HARPER_VERDICT: JSONSchema7 = {
	...OBJECT,
	properties: {
		id: INTEGER,
		verdict: { ...STRING, enum: ['keep', 'drop', 'replace', 'term'] },
		replacement: STRING
	},
	required: ['id', 'verdict', 'replacement']
};

const OWN_FINDING: JSONSchema7 = {
	...OBJECT,
	properties: {
		quote: STRING,
		replacement: STRING,
		kind: { ...STRING, enum: ['grammar', 'wording'] },
		reason: STRING
	},
	required: ['quote', 'replacement', 'kind', 'reason']
};

export const PROOFREAD_SCHEMA: JSONSchema7 = {
	...OBJECT,
	properties: {
		paragraphs: {
			type: 'array' as const,
			items: {
				...OBJECT,
				properties: {
					id: INTEGER,
					findings: { type: 'array' as const, items: HARPER_VERDICT },
					own: { type: 'array' as const, items: OWN_FINDING }
				},
				required: ['id', 'findings', 'own']
			}
		}
	},
	required: ['paragraphs']
};
