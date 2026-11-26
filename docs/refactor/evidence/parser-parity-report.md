# Parser parity report — TS engine vs Python shadow (Phase 9 Gate 9)

**Corpus:** 200 deterministic synthetic documents (seeded, byte-identical per run),
spanning PDF (plain / white-on-white / near-white / tiny-font / invisible-render-mode /
multipage) and DOCX (vanish / white+shaded) plus plain text with HTML entities.
**Engines:** TS `extractTextLocal` (pdf.js) vs `services/parser` `extract_text` (pdfminer).

| result      | count     |
| ----------- | --------- |
| exact match | 200 / 200 |
| mismatch    | 0         |

**Per-feature agreement:**

| feature               | exact / n |
| --------------------- | --------- |
| pdf                   | 140 / 140 |
| white-on-white        | 40 / 40   |
| near-white            | 20 / 20   |
| tiny-font             | 20 / 20   |
| invisible-render-mode | 20 / 20   |
| multipage             | 20 / 20   |
| docx                  | 40 / 40   |
| vanish                | 20 / 20   |
| white+shaded          | 20 / 20   |
| txt                   | 20 / 20   |
| entities              | 20 / 20   |
| plain                 | 20 / 20   |

No mismatches.

Run: `bun scripts/parser-parity-corpus.mjs` (evidence only — not a CI test;
the switch-over decision (9c) needs this report attached).
