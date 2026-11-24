# Hyphenation patterns

The `hyph-*.pat.txt` (patterns) and `hyph-*.hyp.txt` (exceptions) files are the plain text forms
from the TeX hyphenation pattern collection, hyph-utf8, kept byte for byte:
<https://github.com/hyphenation/tex-hyphen> at commit `5684c0f51c0b81133db2efbe60a408b4155a3ff5`,
under `hyph-utf8/tex/generic/hyph-utf8/patterns/txt/`. The license of each file is stated in the
header of its `.tex` twin under `patterns/tex/`. Only languages whose patterns are MIT licensed
are here, plus American English, whose notice is as permissive.

To add a language, check its `.tex` header first, copy the two `txt` files, list it below and
register it in `hyphenationLanguages.ts`.

| File           | Language                   | Copyright                                                                                                                                             | License                           |
| -------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `hyph-en-us`   | English, American spelling | Copyright (C) 1990, 2004, 2005 Gerard D.C. Kuiken                                                                                                     | notice below                      |
| `hyph-en-gb`   | English, British spelling  | Copyright (C) 1992, 1996, 2005, 2016 Dominik Wujastyk, Graham Toal                                                                                    | MIT                               |
| `hyph-de-1996` | German, reformed spelling  | Copyright (c) 2013-2024 Stephan Hennig, Werner Lemberg, Günter Milde, Sander van Geloven, Georg Pfeiffer, Gisbert W. Selke, Tobias Wendorf, Keno Wehr | MIT                               |
| `hyph-fr`      | French                     | Copyright (C) 1994-2002 Daniel Flipo, Bernard Gaulle, 2016 Arthur Reutenauer                                                                          | MIT                               |
| `hyph-es`      | Spanish                    | Copyright (C) 1993, 1997 Javier Bezos, 2001-2019 Javier Bezos, CervanTeX                                                                              | MIT/X11                           |
| `hyph-nl`      | Dutch                      | Copyright (C) 1996 Piet Tutelaers                                                                                                                     | MIT                               |
| `hyph-pl`      | Polish                     | Copyright (C) 1987-1995 Hanna Kołodziejska, Bogusław Jackowski, Marek Ryćko                                                                           | MIT (one of the licenses offered) |

## American English

```
Copying and distribution of this file, with or without modification,
are permitted in any medium without royalty provided the copyright
notice and this notice are preserved.
```

## MIT

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
