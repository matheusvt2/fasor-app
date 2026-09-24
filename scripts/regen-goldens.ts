import { writeFileSync } from 'node:fs';
import { buildSnapshot, replay, serializeSnapshot } from '@app/domain';
import { portoSeguro } from '@app/domain/fixtures/porto-seguro';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { replaySmall } from '@app/domain/fixtures/replay-small';

/*
 * Rewrites the three fixture golden snapshots from their op logs, in the exact form the
 * tests compare (`serializeSnapshot`: canonical one-line JSON) plus a trailing newline.
 * Run deliberately, inside the tools container, after a snapshot schema change:
 *
 *   docker compose --profile tools run --rm tools pnpm exec tsx scripts/regen-goldens.ts
 *
 * The diff of each golden then shows only what the schema change added.
 */

const targets = [
  ['packages/domain/fixtures/porto-seguro/snapshot.golden.json', portoSeguro],
  ['packages/domain/fixtures/porto-seguro/small/snapshot.golden.json', portoSeguroSmall],
  ['packages/domain/fixtures/replay-small/snapshot.golden.json', replaySmall],
] as const;

for (const [path, fixture] of targets) {
  const snapshot = buildSnapshot(replay(fixture.log, { deadOpIds: fixture.deadOpIds }), fixture.relatorioId);
  writeFileSync(path, `${serializeSnapshot(snapshot)}\n`);
  console.log(`wrote ${path}`);
}
