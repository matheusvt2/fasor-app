import { locationRemovalToastText, type LocationRemovalDecision } from '@app/domain';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { copy } from '../copy/pt-br.ts';
import type { HeldDecisions } from '../db/decision-store.ts';
import { readRemovedLocalTold, writeRemovedLocalTold } from '../db/prefs.ts';
import { useDefinitionContext } from './definition-context.ts';
import { useSession } from './session.tsx';
import { useSync } from './sync.tsx';
import { useToast } from './toast.tsx';

/*
 * Story 30.4 (Q-8, Matheus: "tem que ser uma notificacao"): the Toast once on the device whose user
 * wrote the site work of a local another device removed ("Cubículo Enel foi removido por Ana. Suas 19
 * respostas não foram mantidas." with "Ver", which opens the relatório's Sumário, where the conflict
 * Banner stands). It is raised whatever screen is open, when the decisions the store holds (read live,
 * so at the sync cycle that brings the mark) first name this user as the writer, and never again for
 * that removal on this device (`readRemovedLocalTold`). Like an undo Toast it carries an action, so it
 * stays until dismissed; it waits behind a job outcome on screen (`arrival`). The words are the kernel's.
 *
 * Fix batch e30h (item 2): each notice is a `notice` toast, so it waits behind any toast on screen
 * (another notice, "N leituras prontas — Ver") and comes back after one that takes the slot from it;
 * the device records that it told a removal when its notice is put on screen (`onShow`), not when it
 * is asked for, so a notice still waiting when the page reloads is told after the reload.
 */

/** The removal a Toast is said for once: the local and the time of its removal. */
const toldKey = (decision: Pick<LocationRemovalDecision, 'location_id' | 'removed_at'>) => `${decision.location_id}:${decision.removed_at}`;

export function RemovedLocalNotice() {
  const session = useSession();
  const db = session.database;
  const viewer = session.user?.id ?? null;
  const { heldDecisions, userNames, deviceId } = useSync();
  const definitions = useDefinitionContext();
  const navigate = useNavigate();
  const { showToast } = useToast();
  // Keys told in this page session, so a live query answering twice never says one twice.
  const told = useRef(new Set<string>());
  // The writes of the told keys, one after the other, so two notices shown close together keep both.
  const writes = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (db === null || viewer === null) return;
    const mine: { entry: HeldDecisions; decision: LocationRemovalDecision }[] = [];
    for (const entry of heldDecisions ?? []) {
      for (const decision of entry.decisions) {
        if (decision.kind === 'location_removal' && decision.edited_by === viewer && !told.current.has(toldKey(decision))) mine.push({ entry, decision });
      }
    }
    if (mine.length === 0) return;
    for (const { decision } of mine) told.current.add(toldKey(decision));
    void (async () => {
      const stored = await readRemovedLocalTold(db);
      const fresh = mine.filter(({ decision }) => !stored.includes(toldKey(decision)));
      if (fresh.length === 0) return;
      /** Records, once it is on screen, that this device told the removal `key`. */
      const markTold = (key: string) => {
        writes.current = writes.current.then(async () => {
          const now = await readRemovedLocalTold(db);
          if (!now.includes(key)) await writeRemovedLocalTold(db, [...now, key]);
        }).catch(() => undefined);
      };
      const users = Object.entries(userNames).map(([id, name]) => ({ id, name }));
      for (const { entry, decision } of fresh) {
        const text = locationRemovalToastText(decision, { blocks: entry.blocks, equipment: entry.equipment, locations: entry.locations, users, viewerActorId: viewer, viewerDeviceId: deviceId, definitions });
        const key = toldKey(decision);
        showToast(text, { action: { label: copy.conflict.see, onPress: () => void navigate(`/relatorio/${entry.relatorioId}`) }, arrival: true, notice: true, onShow: () => markTold(key) });
      }
    })();
  }, [db, viewer, heldDecisions, userNames, deviceId, definitions, navigate, showToast]);

  return null;
}
