# AI quality rubric

Story 32.2 (Matheus, 2026-11-27). What "right" means for each AI use of the product, how it is measured from the `ai_answers` records (Story 32.1), and how to read the report. The measures are pure kernel functions (`packages/domain/src/ai-answers/rubric.ts`); the report is the read-only CLI `apps/api/src/db/ai-answers-read-cli.ts` (how to run it in production: `infra/README.md`, runbook "Read the AI answer records").

This document holds no client text. The records do (the input, the answer, the value the user left), so they live only in the product's database, per company, and the report prints counts and shares only.

## What a record is

One row per answer an AI gave, written in the same transaction as its run row:

- **what went in**: `input_text` (the AI control's field text, the audit's assembled text) or `input_file_id` (the photo or the audio: only its id, the file itself is kept);
- **what came out**: `answer`, as the model gave it;
- **what was shown**: `shown`, and `shown_reason` when the product changed it (a normalization, a guard's fallback, a value dropped, nothing heard);
- **what the user did**: `outcome` (`kept`, `changed`, `refused`, `unanswered`, or null while open), `action` (which tap or rule settled it), `final_value`, `settled_by`, `settled_at` (the op's own time) and `closed_at` (the emission of the relatório's revision);
- **where it came from**: `use`, `run_table` and `run_id`, `model`, `prompt_version`, `run_usd` (the run's cost, counted once per run).

An answer the product withheld before anyone saw it is `refused` with the action `withheld`. The report counts it apart from the user's refusals.

## The AI uses and what "right" means

| Use | Right means | Measured by |
| --- | --- | --- |
| `plate`, `display`, `panel` (a field read from a photo) | the value the user kept is the value read | exact match of `final_value` with `shown`; otherwise a kind of error (below) |
| `audio_reading` (a reading spoken into a table) | the same | the same |
| `caption`, `nc_obs` (a text read from a photo) | the text is kept as given | kept, changed (by how much) or refused |
| `audio_text` (a text from audio) | the text is kept as written | kept (also untouched at the emission), changed (by how much) or refused; the guard's fallbacks by kind |
| `ai_write` (the AI control's proposal) | the proposal is used and stays | kept ("Usar o texto da IA"), changed afterwards (by how much), refused ("Manter o meu texto", the text changed meanwhile, "Desfazer"); the guard's refusals by kind |
| `audit_finding` ("Conferência por IA") | the finding pointed at something to fix | acted on (`changed` / `field_changed`: the field it names changed before the next emission) or not (`unanswered`) |

### Kinds of error of a field read

For a field read the user did not keep (`fieldReadError`):

- `left_empty`: the model left the field empty (a field it was asked for, with no answer) and the user filled it;
- `invented`: the model gave a value and the user emptied the field, or discarded the suggestion without typing one;
- `wrong_unit`: the same digits, another unit;
- `wrong_digit`: the digits differ;
- `other`: anything else (a word, a spelling, a date read differently).

### How much a text changed

`wordChangeShare`: the word-level edit distance between the text shown and the text the user left, over the longer of the two, from 0 (the same words, case and punctuation aside) to 1. The report gives the mean over the changed answers of each line.

### The guard's refusals

`guardRefusalKinds` reads the kinds the guards named in `shown_reason` (`number`, `unit`, `tag`, `result`, `empty`, `other`), for the AI control's refusals and the audio's fallbacks to the text as heard.

## The report

One JSON line per AI use, model and prompt version (`ai quality`), then a total (`ai quality total`):

- `answers`, `open`, `kept`, `changed`, `refused` (by the user), `withheld` (by the product), `unanswered`, and the share of each over `answers`;
- `refused_by`: `discard`, `undo`, `keep_mine`, `text_changed`;
- `errors`: the kinds of error above (field reads only);
- `words_changed_mean` (texts only);
- `guard_refusals` by kind;
- `runs`, `usd` (each run once) and `usd_per_kept`.

Compare two lines of the same use to compare a model or a prompt version with the next. A share is only as good as the number of answers under it: read `answers` first.

The examples mode (`--examples <use> --company <id> --out <path>`, refused without its flag and for a path inside the repository) writes the worst answers of one AI use of one company, with their texts, to a local file for a person to read. Nothing of it goes to stdout but the count.

## Later work: a model judging the texts

Matheus, 2026-11-27: the scoring here is counts only. A model judging the texts ("vamos julgar a posteriori, vai ser trabalho de um MLE") is left for later, as the work of an ML engineer, and each run of such a judge would cost money and need his word, as the plate eval does. That work reads, per record: `use`, `input_text` or `input_file_id`, `answer`, `shown`, `shown_reason`, `outcome`, `action`, `final_value`, `model` and `prompt_version`, and joins `run_id` to `reading_runs` or `transcription_runs` for the run's provider, tokens and cost.
