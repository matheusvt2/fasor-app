import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Story 32.1 (Matheus, 2026-11-27: "Isso deve ser feito com TUDO que usar IA"): every call the api
 * makes to an AI provider writes its answer records (`recordAiAnswers`, `apps/api/src/ai/answers.ts`)
 * in the same transaction as its run row. This guard lists the provider seams of the api's
 * configuration and every file that calls a provider, and names, for each, the module that records
 * its answers. A new seam, or a new call site of a provider, fails here until it is listed with its
 * recorder (or, for a script whose answers reach no relatório, with the reason it is exempt).
 */

const root = resolve(import.meta.dirname, '..');
const apiSrc = join(root, 'apps/api/src');

/** The provider seams the configuration selects, the AI ones of Story 32.1's scope. `EMAIL_PROVIDER` is no AI. */
const AI_SEAMS = ['LLM_PROVIDER', 'OCR_PROVIDER', 'STT_PROVIDER'] as const;
const NON_AI_SEAMS = ['EMAIL_PROVIDER'] as const;

/** A provider call: a structuring, prose, speech or audit call, a writing step's `write`, an OCR `read`. */
const PROVIDER_CALL = /\.(?:structure|describe|transcribe|audit)\(|\b(?:writing(?:\.provider)?|ocr)\.(?:write|read)\(|Provider\([^)]*\)\.read\(/;

type Entry = { recorder: string } | { exempt: string };

const READING_JOB = 'apps/api/src/jobs/reading/job.ts';

/** Every file that calls a provider, and where its answers are recorded. */
const CALL_SITES: Readonly<Record<string, Entry>> = {
  // The reading kinds call the OCR, structuring and prose providers; the job records every kind's answers with its run row.
  'apps/api/src/jobs/reading/kinds/shared.ts': { recorder: READING_JOB },
  'apps/api/src/jobs/reading/kinds/plate.ts': { recorder: READING_JOB },
  'apps/api/src/jobs/reading/kinds/panel.ts': { recorder: READING_JOB },
  'apps/api/src/jobs/reading/kinds/caption.ts': { recorder: READING_JOB },
  'apps/api/src/jobs/reading/kinds/nc-obs.ts': { recorder: READING_JOB },
  'apps/api/src/jobs/transcription/job.ts': { recorder: 'apps/api/src/jobs/transcription/job.ts' },
  'apps/api/src/http/ai-write.ts': { recorder: 'apps/api/src/http/ai-write.ts' },
  'apps/api/src/jobs/audit/job.ts': { recorder: 'apps/api/src/jobs/audit/job.ts' },
  'apps/api/src/scripts/bedrock-eval.ts': { exempt: 'the plate evaluation, run by hand on committed samples with Matheus\'s word; its answers reach no relatório' },
  'apps/api/src/scripts/textract-read.ts': { exempt: 'a by-hand OCR probe of one image; its answer reaches no relatório' },
};

/** What each recorder writes its run row with, which its records must sit beside. */
const RUN_ROW_WRITERS: Readonly<Record<string, RegExp>> = {
  [READING_JOB]: /recordRun\('ok', null, tx\)/,
  'apps/api/src/jobs/transcription/job.ts': /recordRun\('ok', null, tx\)/,
  'apps/api/src/http/ai-write.ts': /tx\.insert\(transcriptionRuns\)/,
  'apps/api/src/jobs/audit/job.ts': /put\('status', 'done', finishedAt\)/,
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.includes('test-support')) out.push(path);
  }
  return out;
}

const read = (file: string) => readFileSync(join(root, file), 'utf8');

describe('32.1-UNIT-GUARD every AI provider call records its answers', () => {
  it('the configuration selects exactly the provider seams listed here', () => {
    const config = read('apps/api/src/config.ts');
    const seams = [...new Set([...config.matchAll(/\b([A-Z]+_PROVIDER):/g)].map((match) => match[1]!))].sort();
    expect(seams, 'a new provider seam: add it to AI_SEAMS (and record its answers) or to NON_AI_SEAMS').toEqual([...AI_SEAMS, ...NON_AI_SEAMS].sort());
  });

  it('every file that calls a provider is listed with its recorder or the reason it is exempt', () => {
    const calling = sourceFiles(apiSrc)
      .filter((path) => PROVIDER_CALL.test(readFileSync(path, 'utf8')))
      .map((path) => relative(root, path))
      .sort();
    const unlisted = calling.filter((file) => CALL_SITES[file] === undefined);
    expect(unlisted, 'a new AI provider call site: record its answers (`recordAiAnswers`) with its run row and list it in CALL_SITES').toEqual([]);
    const stale = Object.keys(CALL_SITES).filter((file) => !calling.includes(file));
    expect(stale, 'a listed call site no longer calls a provider: drop it from CALL_SITES').toEqual([]);
  });

  it('every recorder calls recordAiAnswers beside the write of its run row', () => {
    const recorders = [...new Set(Object.values(CALL_SITES).flatMap((entry) => ('recorder' in entry ? [entry.recorder] : [])))].sort();
    expect(recorders).toEqual(Object.keys(RUN_ROW_WRITERS).sort());
    for (const recorder of recorders) {
      const text = read(recorder);
      expect(text, `${recorder} imports the recorder`).toMatch(/from '\.\.\/(?:\.\.\/)?ai\/answers\.ts'/);
      expect(text, `${recorder} calls recordAiAnswers`).toMatch(/recordAiAnswers\(/);
      expect(text, `${recorder} writes its run row`).toMatch(RUN_ROW_WRITERS[recorder]!);
    }
  });

  it('every exempt call site says why', () => {
    for (const [file, entry] of Object.entries(CALL_SITES)) {
      if ('exempt' in entry) {
        expect(file, 'only a by-hand script may be exempt').toMatch(/^apps\/api\/src\/scripts\//);
        expect(entry.exempt.length).toBeGreaterThan(20);
      }
    }
  });
});
