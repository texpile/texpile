# Texpile Translations

Texpile ships in the languages below. Open an [issue](../../issues) if you can help with another
one, or with keeping one of these current.

| Language              | Locale    | Translated | Status                                                                  |
| --------------------- | --------- | ---------- | ----------------------------------------------------------------------- |
| English               | `en`      | 100%       | Source language, maintained by [@louisqli](https://github.com/louisqli) |
| Chinese (Simplified)  | `zh-Hans` | 100%       | Maintained by [@louisqli](https://github.com/louisqli)                  |
| Chinese (Traditional) | `zh-Hant` | 100%       | Maintained by [@louisqli](https://github.com/louisqli)                  |
| German                | `de`      | 100%       | Machine translated, review welcome                                      |
| Portuguese (Brazil)   | `pt-BR`   | 100%       | Reviewed by [@rodrigo-alessantos](https://github.com/rodrigo-alessantos) |
| Spanish               | `es`      | 24%        | Maintained by [@nicolobos77](https://github.com/nicolobos77)            |

## Translating

The message files are `apps/texpile-editor/messages/<locale>.json`.

`en.json` is the source of truth. When translating, reference its keys.
If a value is untranslated, do not add its key to the locale.

- Translate the values, never the keys
- Leave `{placeholders}` alone; they are filled in at runtime
- Keep punctuation plain, without em dashes
- A locale does not have to stay complete. A string without a translation shows in English until
  someone adds one

Run `pnpm install` afterwards to regenerate the typed messages, then check that the app builds.
