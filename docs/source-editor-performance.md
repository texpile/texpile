# Source editor performance on very large files

Basicially. Texpile keeps a whole copy of the current opened source in memory for intelisense and parsing, and some intelienses are ran on every keystroke. Those works great but if your document is huge > 1mb, the editor will freeze sometimes. Spell check also reparses the entire tex sources. Those need to be fixed
