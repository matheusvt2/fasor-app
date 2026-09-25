import { equipmentChipOptions, getSeed, locationTree, type CaptionParts, type RelatorioSnapshot, type SeedWord } from '@app/domain';
import { useCallback, useMemo } from 'react';
import { pushCaptionRecents, useCaptionRecents, useCaptionWordRows } from '../../db/photo-store.ts';
import { useSession } from '../../state/session.tsx';
import type { CaptionComposerSources } from './caption-composer.tsx';

/*
 * Story 6.5: what the Caption composer offers and agrees with: the relatório's seed words
 * (`atividades`, `locais`), its equipment words and cabine names, the registry's `atividade`
 * and `local` rows, and this device's recents for the relatório (`local_prefs`).
 */

const NO_WORDS: { atividades: readonly SeedWord[]; locais: readonly SeedWord[] } = { atividades: [], locais: [] };

export type CaptionSources = CaptionComposerSources & { remember: (parts: CaptionParts) => void };

export function useCaptionSources(relatorioId: string, snapshot: RelatorioSnapshot): CaptionSources {
  const db = useSession().database;
  const registry = useCaptionWordRows(db);
  const recents = useCaptionRecents(db, relatorioId);
  const seedVersion = snapshot.relatorio.seed_version;
  const words = useMemo(() => {
    try {
      const seed = getSeed(seedVersion, 'cabine_primaria');
      return { atividades: seed.atividades, locais: seed.locais };
    } catch {
      return NO_WORDS;
    }
  }, [seedVersion]);
  const equipamentos = useMemo(() => equipmentChipOptions(snapshot, null), [snapshot]);
  const extraLocais = useMemo(() => locationTree(snapshot).map((root) => root.name), [snapshot]);
  const remember = useCallback(
    (parts: CaptionParts) => {
      if (db === null) return;
      void pushCaptionRecents(db, relatorioId, {
        atividade: parts.atividade?.name ?? null,
        equipamento: parts.equipamento?.name ?? null,
        local: parts.local?.name ?? null,
      }).catch(() => undefined);
    },
    [db, relatorioId],
  );
  return { ...words, equipamentos, extraLocais, registry, recents, remember };
}
