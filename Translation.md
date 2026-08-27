# Texpile Translations

Texpile ships in the languages below. Open an [issue](../../issues) if you can help with another
one, or with keeping one of these current.

| Language              | Locale    | Status                                                                  |
| --------------------- | --------- | ----------------------------------------------------------------------- |
| English               | `en`      | Source language, maintained by [@louisqli](https://github.com/louisqli) |
| Chinese (Simplified)  | `zh-Hans` | Maintained by [@louisqli](https://github.com/louisqli)                  |
| Chinese (Traditional) | `zh-Hant` | Maintained by [@louisqli](https://github.com/louisqli)                  |
| German                | `de`      | Machine translated, review welcome                                      |

## Translating

The message files are `apps/texpile-editor/messages/<locale>.json`. `en.json` is the source, and
every other file carries the same keys.

- Translate the values, never the keys
- Leave `{placeholders}` alone; they are filled in at runtime
- Keep punctuation plain, without em dashes

Run `pnpm install` afterwards to regenerate the typed messages, then check that the app builds.
