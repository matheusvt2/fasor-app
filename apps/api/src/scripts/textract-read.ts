import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { renderVariants } from '../storage/variants.ts';
import { readingImage } from '../jobs/reading/image.ts';
import { TEXTRACT_DEFAULT_REGION, textractProvider } from '../jobs/reading/providers/textract.ts';

/*
 * Story 11.7: a manual live call of the `textract` provider, never run by `pnpm verify` (no
 * test glob matches it and nothing imports it). It reads one image, turns it into the print
 * variant the job reads (`renderVariants`: `.rotate()` applies the EXIF orientation, at most
 * 2000 px, JPEG re-encode), then the job's own `readingImage`, calls Textract once and prints
 * the token count, the image size and the first 20 tokens. It exits non-zero on any error.
 *
 * Credentials come only from the AWS SDK default chain, here the env session of the
 * `fasor-app` profile, exported by the pinned aws-cli image (as `infra/bin/tf` does; the AWS
 * CLI never runs on the host) into a throwaway env file under the git-ignored `secrets/`,
 * then handed to the tools container:
 *
 *   docker run --rm --user "$(id -u):$(id -g)" -e HOME=/home/aws -v "$HOME/.aws:/home/aws/.aws" \
 *     amazon/aws-cli:2.37.6 configure export-credentials --profile fasor-app --format env-no-export \
 *     > secrets/aws-session.env
 *   docker compose --profile tools run --rm --no-deps --env-from-file secrets/aws-session.env \
 *     tools pnpm --filter @app/api exec tsx src/scripts/textract-read.ts /workspace/path/to/plate.jpg
 *   rm secrets/aws-session.env
 *
 * The region is TEXTRACT_REGION, default us-east-1. The compose env anchor does not pass it,
 * so an override goes on the run command: `-e TEXTRACT_REGION=us-west-2` after `--no-deps`.
 */

function mimeOf(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.png') return 'image/png';
  throw new Error(`unsupported image extension "${extension}" (jpg, jpeg or png)`);
}

async function run(): Promise<void> {
  const path = process.argv[2];
  if (path === undefined) throw new Error('usage: textract-read.ts <image path>');
  const mime = mimeOf(path);
  const variants = await renderVariants(new Uint8Array(await readFile(path)), mime);
  if (variants === null) throw new Error(`no print variant for ${mime}`);
  const image = await readingImage({ print: variants.print.bytes, printMime: variants.print.contentType });
  const region = process.env.TEXTRACT_REGION || TEXTRACT_DEFAULT_REGION;
  const result = await textractProvider({ region }).read({ bytes: image.bytes, mime: image.mime });
  console.log(JSON.stringify({ region, bytes: image.bytes.byteLength, image: result.image, token_count: result.tokens.length, tokens: result.tokens.slice(0, 20) }, null, 2));
}

run().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    process.exit(1);
  },
);
