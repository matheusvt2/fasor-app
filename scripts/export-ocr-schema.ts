import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ocrContractJsonSchema } from '@app/domain';

/*
 * Story 8.3: writes the OCR sidecar's JSON Schema from the zod contract
 * (`packages/domain/src/contract/ocr.ts`). The kernel test `ocr.test.ts` fails when the
 * committed file differs. Run: docker compose --profile tools run --rm tools pnpm schema:ocr
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'services/ocr/contract/ocr-contract.schema.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(ocrContractJsonSchema(), null, 2) + '\n');
console.log(`wrote ${out}`);
