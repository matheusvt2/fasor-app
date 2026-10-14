import { headNounAgreement } from '../photos/caption.ts';
import { locationTree, treeNodes, type TreeEquipmentNode, type TreeLocationNode } from '../relatorio/tree.ts';
import { roleSchema, type Role } from '../schemas/block-config.ts';
import type { BlockRow, RelatorioRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { siteChecklistOf } from '../seed/definitions.ts';

/*
 * Story 7.1 (FR-68, FR-72, AR-15; EXPERIENCE.md › Section 9 default scheme): the order and
 * the grouping section 9 prints its sheets in. `ordem_de_campo` is the base case: one
 * subsection per cabine holding a sheet, titled with the cabine's name, its sheets in tree
 * order (`sheetOrder`, the order "Próxima ficha" walks). `por_local_e_tipo` maps that result
 * and splits only the cabines with "Agrupar por tipo" on, into the fixed groups Seccionadoras
 * › Disjuntores › TP's e TC's › Transformadores e Cabos de Alimentação, an empty group
 * skipped. Grouping only filters and pairs: the tree is never reordered, every sheet prints
 * once, and inside a group the sheets keep their tree order.
 *
 * Pairing: a location's (a coluna's, or the cabine's own) n-th TP is followed by its n-th
 * TC, leftovers after them; each transformer is preceded by the alimentação cables whose
 * `feeds_block_id` names it (never a match by name), and an alimentação cable that feeds no
 * live transformer of its cabine prints last in its group with an `integrity` warning.
 *
 * Story 14.2 (Local › Painel › Coluna): a cabine (the local) holding a painel with a sheet
 * prints in runs. The direct run comes first: the local's own sheets and those of the
 * colunas directly under it, in tree order. Then one run per painel holding a sheet, in tree
 * order. In the base case the direct run is the local's `cabine` subsection (emitted even
 * when it holds no sheet, so the local's heading stands over its painéis) and each painel is
 * a `painel` subsection titled with its name. With "Agrupar por tipo" on, the direct run is
 * split by type first, then each painel is a `painel` heading with no sheets followed by
 * that painel's own type groups (the same title words, with the local's name). Pairing
 * stays inside a run; a cable whose transformer prints in another run of the same cabine
 * goes last in its run's group with no warning, since it does feed a live transformer of
 * its cabine. A painel with no sheet emits nothing, and a cabine with no painel holding a
 * sheet emits exactly what it did before the painel level.
 *
 * Stories 14.3 and 14.4 (2026-10-13):
 * - On a relatório whose seed version ships a site list (v4 or later) every live root cabine
 *   prints: one holding no sheet at all still emits its `cabine` subsection, with no sheets,
 *   under both schemes, so its heading, its cabine data and its VERIFICAÇÕES DO LOCAL table
 *   have somewhere to stand (`section9Layout`). On v1 to v3 such a cabine emits nothing, as
 *   before.
 * - With "Agrupar por tipo" on, a type group under a painel is titled with the painel and the
 *   local (`painelTypeGroupTitle`), so two painéis each holding seccionadoras no longer print
 *   the same numbered title; and a local whose sheets all sit in painéis emits its own
 *   `cabine` subsection (no sheets) before its first painel, as it does with the flag off. A
 *   local with no painel keeps the FO.SERV-03 titles byte for byte. This item is not tied to
 *   a seed: it applies to every relatório, v1 to v3 included, so one of those that already
 *   holds painéis with the flag on prints the new titles and the local's heading. Unchanged
 *   on every seed: a local with no painel.
 */

export type PrintScheme = RelatorioRow['export']['scheme'];

export type PrintGroupKind = 'cabine' | 'painel' | 'seccionadoras' | 'disjuntores' | 'tps_tcs' | 'transformadores';

export interface PrintSubsection {
  /** The cabine (the tree's root location) the subsection belongs to. */
  cabineId: string;
  kind: PrintGroupKind;
  /** "Cubículo Enel", "Seccionadoras dos Cubículos de MT do 1° Subsolo", "Painel de média tensão", "Seccionadoras dos Cubículos de MT do Painel de média tensão — Cabine primária". */
  title: string;
  /**
   * The sheets, in print order. Empty for a `painel` heading over its type groups, for a
   * local's `cabine` subsection whose sheets all sit in painéis and (Story 14.3, a relatório
   * with a site list) for a local holding no sheet at all.
   */
  blockIds: string[];
  /**
   * Story 14.2: the painel the subsection belongs to (the `painel` subsection itself and the
   * type groups under it). Absent on a local's direct run and on every subsection of a local
   * with no painel.
   */
  painelId?: string;
}

/** An alimentação cable that feeds no live transformer of its cabine: printed last in the transformer group. */
export interface PrintGroupWarning {
  kind: 'integrity';
  code: 'unpaired_cable';
  blockId: string;
  cabineId: string;
}

export interface PrintGrouping {
  scheme: PrintScheme;
  subsections: PrintSubsection[];
  warnings: PrintGroupWarning[];
}

type GroupSnapshot = Pick<RelatorioSnapshot, 'relatorio' | 'locations' | 'blocks' | 'equipment'>;
type TypeGroup = Exclude<PrintGroupKind, 'cabine' | 'painel'>;

/**
 * The subsection titles of a cabine with "Agrupar por tipo" on, in their fixed order. The
 * words are the AC's ("⟨Tipo plural⟩ dos Cubículos de MT d⟨o/os⟩ ⟨cabine⟩", "Transformadores e
 * Cabos de Alimentação d⟨o⟩ ⟨cabine⟩"), from the FO.SERV-03 ÍNDICE 9.2-9.5 and 9.9-9.11.
 */
const GROUP_WORDS: readonly { kind: TypeGroup; words: string }[] = [
  { kind: 'seccionadoras', words: 'Seccionadoras dos Cubículos de MT' },
  { kind: 'disjuntores', words: 'Disjuntores dos Cubículos de MT' },
  { kind: 'tps_tcs', words: "TP's e TC's dos Cubículos de MT" },
  { kind: 'transformadores', words: 'Transformadores e Cabos de Alimentação' },
];

/** A leading ordinal or number ("1°", "2ª", "3") is not the head noun of a cabine name. */
const LEADING_ORDINAL = /^\d+[°ºª]?$/;

/** A cabine name's head noun decides the contraction ("do 1° Subsolo", "da 2ª Cabine", "dos Geradores"); masculine singular when unknown. */
function ofCabine(name: string): string {
  const words = name.trim().split(/\s+/);
  const head = LEADING_ORDINAL.test(words[0] ?? '') ? words.slice(1).join(' ') : name;
  const agreement = headNounAgreement(head) ?? { gender: 'm', number: 'singular' };
  return `d${agreement.gender === 'f' ? 'a' : 'o'}${agreement.number === 'plural' ? 's' : ''} ${name}`;
}

/**
 * Story 14.4 (2026-10-13, from the review of PR #126): the title of a type group under a
 * painel, "Seccionadoras dos Cubículos de MT do Painel de média tensão — Cabine primária":
 * the group's words, the painel with its contraction, then the local. `words` is one of
 * `GROUP_WORDS`.
 */
export function painelTypeGroupTitle(words: string, painelName: string, localName: string): string {
  // authored: the wording recommended in Story 14.4's criterion, pending Bruno's word on the title.
  return `${words} ${ofCabine(painelName.trim())} — ${localName.trim()}`;
}

/** A block's role (`BlockConfig.role`), or null when its config names none. */
export function blockRoleOf(block: Pick<BlockRow, 'config'>): Role | null {
  const config = block.config;
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return null;
  const parsed = roleSchema.safeParse((config as { role?: unknown }).role);
  return parsed.success ? parsed.data : null;
}

/** The equipment rows under one node of the tree, depth first: its own blocks, then those of the locations under it. */
function sheetsUnder(root: TreeLocationNode): TreeEquipmentNode[] {
  return treeNodes([root]).filter((node): node is TreeEquipmentNode => node.kind === 'equipment');
}

/** One painel of a cabine holding a sheet, with its sheets in tree order. */
interface PainelRun {
  id: string;
  title: string;
  nodes: TreeEquipmentNode[];
}

/** What one root of the tree prints: its base subsection, its direct run and its painel runs. */
interface RootRuns {
  /** The cabine's base-case subsection: its `blockIds` are the direct run's. */
  subsection: PrintSubsection;
  /** The direct run: the root's own sheets and those under its non-painel children, in tree order. */
  direct: TreeEquipmentNode[];
  /** One run per painel holding a sheet, in tree order; empty for a cabine with none. */
  paineis: PainelRun[];
}

/**
 * The base case as data: one entry per root of the tree holding a sheet, in tree order. With
 * `everyLocal` (a relatório whose seed ships a site list), a root cabine holding no sheet is
 * kept too, its subsection empty.
 */
function fieldOrder(tree: readonly TreeLocationNode[], everyLocal: boolean): RootRuns[] {
  return tree.flatMap((root) => {
    // Only a cabine holds painéis; under any other root a painel is read as any location.
    const paineis: PainelRun[] =
      root.kind === 'cabine'
        ? root.locations
            .filter((child) => child.kind === 'painel')
            .map((painel) => ({ id: painel.id, title: painel.name.trim(), nodes: sheetsUnder(painel) }))
            .filter((run) => run.nodes.length > 0)
        : [];
    const inPainel = new Set(paineis.flatMap((run) => run.nodes.map((node) => node.blockId)));
    const direct = sheetsUnder(root).filter((node) => !inPainel.has(node.blockId));
    if (direct.length === 0 && paineis.length === 0 && !(everyLocal && root.kind === 'cabine')) return [];
    return [{ subsection: { cabineId: root.id, kind: 'cabine' as const, title: root.name.trim(), blockIds: direct.map((node) => node.blockId) }, direct, paineis }];
  });
}

/** The base case's subsections of one root: its `cabine` subsection, then one `painel` subsection per painel run. */
function baseSubsections(root: RootRuns): PrintSubsection[] {
  return [
    root.subsection,
    ...root.paineis.map((run): PrintSubsection => ({ cabineId: root.subsection.cabineId, kind: 'painel', title: run.title, blockIds: run.nodes.map((node) => node.blockId), painelId: run.id })),
  ];
}

/** A location's n-th TP, then its n-th TC; the unpaired ones after them; locations in the order the tree reaches them. */
function tpTcPairs(nodes: readonly TreeEquipmentNode[]): string[] {
  const byLocation = new Map<string, TreeEquipmentNode[]>();
  for (const node of nodes) byLocation.set(node.locationId, [...(byLocation.get(node.locationId) ?? []), node]);
  const out: string[] = [];
  for (const group of byLocation.values()) {
    const tps = group.filter((node) => node.blockType === 'tp');
    const tcs = group.filter((node) => node.blockType === 'tc');
    const paired = new Set<string>();
    for (let i = 0; i < Math.min(tps.length, tcs.length); i++) {
      out.push(tps[i]!.blockId, tcs[i]!.blockId);
      paired.add(tps[i]!.blockId).add(tcs[i]!.blockId);
    }
    for (const node of group) if (!paired.has(node.blockId)) out.push(node.blockId);
  }
  return out;
}

/**
 * The transformer group of one run: each transformer after the cables feeding it (tree
 * order), then the cables that feed none of this run's transformers. A warning is raised
 * only for a cable that feeds no live transformer of its cabine (`cabineTransformers`): one
 * whose transformer prints in another run of the same cabine goes last here with none.
 */
function transformerPairs(
  transformers: readonly TreeEquipmentNode[],
  cables: readonly TreeEquipmentNode[],
  blocks: ReadonlyMap<string, BlockRow>,
  cabineId: string,
  cabineTransformers: ReadonlySet<string>,
  warnings: PrintGroupWarning[],
): string[] {
  const live = new Set(transformers.map((node) => node.blockId));
  const fed = new Map<string, string[]>();
  const unpaired: string[] = [];
  for (const cable of cables) {
    const target = blocks.get(cable.blockId)?.feeds_block_id ?? null;
    if (target !== null && live.has(target)) {
      fed.set(target, [...(fed.get(target) ?? []), cable.blockId]);
    } else {
      unpaired.push(cable.blockId);
      if (target === null || !cabineTransformers.has(target)) warnings.push({ kind: 'integrity', code: 'unpaired_cable', blockId: cable.blockId, cabineId });
    }
  }
  return [...transformers.flatMap((node) => [...(fed.get(node.blockId) ?? []), node.blockId]), ...unpaired];
}

/**
 * One run of a flagged cabine (all of its sheets, its direct run, or one painel's) split
 * into the fixed type groups, an empty group skipped. The direct run's titles carry the
 * cabine's name (`base.title`), FO.SERV-03's own; a painel's run names the painel and then
 * the cabine (`painelTypeGroupTitle`).
 */
function byType(
  base: PrintSubsection,
  nodes: readonly TreeEquipmentNode[],
  blocks: ReadonlyMap<string, BlockRow>,
  cabineTransformers: ReadonlySet<string>,
  warnings: PrintGroupWarning[],
  painelTitle: string | null = null,
): PrintSubsection[] {
  const seccionadoras: TreeEquipmentNode[] = [];
  const disjuntores: TreeEquipmentNode[] = [];
  const tpsTcs: TreeEquipmentNode[] = [];
  const transformers: TreeEquipmentNode[] = [];
  const cables: TreeEquipmentNode[] = [];
  for (const node of nodes) {
    switch (node.blockType) {
      case 'disjuntor_mt':
        disjuntores.push(node);
        break;
      case 'tp':
      case 'tc':
        tpsTcs.push(node);
        break;
      case 'transformador_forca':
        transformers.push(node);
        break;
      case 'cabos_saida': {
        const block = blocks.get(node.blockId);
        (block !== undefined && blockRoleOf(block) === 'alimentacao' ? cables : seccionadoras).push(node);
        break;
      }
      default:
        // Chave seccionadora, para-raio and cabos de entrada (EXPERIENCE.md: "in a grouped
        // cabine they print inside the seccionadoras group"); a type the seed does not know
        // prints there too, so no sheet is ever dropped.
        seccionadoras.push(node);
    }
  }
  const ids: Record<TypeGroup, string[]> = {
    seccionadoras: seccionadoras.map((node) => node.blockId),
    disjuntores: disjuntores.map((node) => node.blockId),
    tps_tcs: tpTcPairs(tpsTcs),
    transformadores: transformerPairs(transformers, cables, blocks, base.cabineId, cabineTransformers, warnings),
  };
  return GROUP_WORDS.flatMap(({ kind, words }) =>
    ids[kind].length === 0
      ? []
      : [{ cabineId: base.cabineId, kind, title: painelTitle === null ? `${words} ${ofCabine(base.title)}` : painelTypeGroupTitle(words, painelTitle, base.title), blockIds: ids[kind] }],
  );
}

/**
 * A flagged cabine split by type: its direct run first, then each painel as a heading over
 * its own type groups. A cabine with no direct sheet emits its own `cabine` subsection (no
 * sheets) instead of the direct run's groups: its numbered heading stands before its first
 * painel as with the flag off (Story 14.4), and it is what a local holding no sheet at all
 * emits on a relatório with a site list.
 */
function byTypeRuns(root: RootRuns, blocks: ReadonlyMap<string, BlockRow>, warnings: PrintGroupWarning[]): PrintSubsection[] {
  const all = [...root.direct, ...root.paineis.flatMap((run) => run.nodes)];
  const cabineTransformers = new Set(all.filter((node) => node.blockType === 'transformador_forca').map((node) => node.blockId));
  const { cabineId } = root.subsection;
  return [
    ...(root.direct.length === 0 ? [root.subsection] : byType(root.subsection, root.direct, blocks, cabineTransformers, warnings)),
    ...root.paineis.flatMap((run): PrintSubsection[] => [
      { cabineId, kind: 'painel', title: run.title, blockIds: [], painelId: run.id },
      ...byType(root.subsection, run.nodes, blocks, cabineTransformers, warnings, run.title).map((group) => ({ ...group, painelId: run.id })),
    ]),
  ];
}

/**
 * Section 9's subsections for a snapshot under a scheme (the relatório's own by default).
 * `por_local_e_tipo` is `ordem_de_campo` with every flagged cabine split by type; a cabine
 * with the flag off keeps exactly its base-case subsections. On a relatório whose seed ships
 * a site list no live root cabine is dropped: one with no sheet emits its `cabine` subsection.
 */
export function groupForPrint(snapshot: GroupSnapshot, scheme: PrintScheme = snapshot.relatorio.export.scheme): PrintGrouping {
  const base = fieldOrder(locationTree(snapshot), siteChecklistOf(snapshot.relatorio.seed_version) !== null);
  if (scheme === 'ordem_de_campo') return { scheme, subsections: base.flatMap(baseSubsections), warnings: [] };
  const flagged = new Set(snapshot.locations.filter((location) => location.kind === 'cabine' && location.agrupar_por_tipo).map((location) => location.id));
  const blocks = new Map(snapshot.blocks.map((block) => [block.id, block]));
  const warnings: PrintGroupWarning[] = [];
  const subsections = base.flatMap((root) => (flagged.has(root.subsection.cabineId) ? byTypeRuns(root, blocks, warnings) : baseSubsections(root)));
  return { scheme, subsections, warnings };
}
