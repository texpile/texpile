---
description: Check spelling in nine languages and grammar in English as you write, in the visual and the source editor.
blurb: Spelling in nine languages, grammar in English, skipping math and commands.
icon: spell-check
order: 25
section: Editor tips
---

# Spell check

Texpile underlines spelling problems in English, German, French, Spanish, Italian, Dutch, Portuguese (Brazil and Portugal) and Polish, and grammar problems in English. Math, code, commands and `.bib` files are skipped. Turn it on in File › Preferences… › Spelling.

![A suggestion box under the word diferently, offering differently, Add to Dictionary, and Ignore](../landing/src/lib/assets/showcase/docs/writing/spell-suggestion-box.png)

Click an underlined word for suggestions. F8 and Shift F8 jump to the next and previous problem.

A grammar problem offers **Turn Off Rule** instead of Add to Dictionary. It stops that rule in every file. Preferences › Spelling turns it back on, and holds the English variant and your dictionary.

## Languages

A document is checked in the language it names:

| Format              | Example                        |
| ------------------- | ------------------------------ |
| LaTeX (babel)       | `\usepackage[ngerman]{babel}`  |
| LaTeX (polyglossia) | `\setmainlanguage{french}`     |
| Typst               | `#set text(lang: "es")`        |
| Markdown            | `lang: it` in the front matter |

A chapter brought in with `\input` or `#include` follows its main file. A document that names no language is checked in Preferences › Spelling › Default language, English unless changed. A document in a language without a dictionary, such as Russian, is not checked.

Spelling › Folder Language, or Preferences › Spelling › This folder, sets one language for every file in the folder, over what the files name. It is saved in the folder's `.texpile/config.json`, so co-authors get it too. Automatic goes back to what each file names, and says where its language comes from: the document, or the default.

Each language has its own dictionary: Add to Dictionary on a German word adds it to the German one. Preferences › Spelling › Custom Dictionary shows one language at a time.
