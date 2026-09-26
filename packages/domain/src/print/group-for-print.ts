import { headNounAgreement } from '../photos/caption.ts';
import { locationTree, treeNodes, type TreeEquipmentNode, type TreeLocationNode } from '../relatorio/tree.ts';
import { roleSchema, type Role } from '../schemas/block-config.ts';
import type { BlockRow, RelatorioRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';

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
 */

export type PrintScheme = RelatorioRow['export']['scheme'];

export type PrintGroupKind = 'cabine' | 'seccionadoras' | 'disjuntores' | 'tps_tcs' | 'transformadores';

export interface PrintSubsection {
  /** The cabine (the tree's root location) the subsection belongs to. */
  cabineId: string;
  kind: PrintGroupKind;
  /** "Cubículo Enel", "Seccionadoras dos Cubículos de MT do 1° Subsolo". */
  title: string;
  /** The sheets, in print order. */
  blockIds: string[];
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
type TypeGroup = Exclude<PrintGroupKind, 'cabine'>;

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

/** A cabine name's head noun decides the contraction ("do 1° Subsolo", "dos Geradores"); masculine singular when unknown. */
function ofCabine(name: string): string {
  const agreement = headNounAgreement(name) ?? { gender: 'm', number: 'singular' };
  return `d${agreement.gender === 'f' ? 'a' : 'o'}${agreement.number === 'plural' ? 's' : ''} ${name}`;
}

/** A block's role (`BlockConfig.role`), or null when its config names none. */
export function blockRoleOf(block: Pick<BlockRow, 'config'>): Role | null {
  const config = block.config;
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return null;
  const parsed = roleSchema.safeParse((config as { role?: unknown }).role);
  return parsed.success ? parsed.data : null;
}

/** The equipment rows under one root of the tree, depth first: its own blocks, then its colunas'. */
function sheetsUnder(root: TreeLocationNode): TreeEquipmentNode[] {
  return treeNodes([root]).filter((node): node is TreeEquipmentNode => node.kind === 'equipment');
}

/** The base case: one subsection per root of the tree holding a sheet, in tree order. */
function fieldOrder(tree: readonly TreeLocationNode[]): { subsection: PrintSubsection; nodes: TreeEquipmentNode[] }[] {
  return tree.flatMap((root) => {
    const nodes = sheetsUnder(root);
    if (nodes.length === 0) return [];
    return [{ subsection: { cabineId: root.id, kind: 'cabine' as const, title: root.name.trim(), blockIds: nodes.map((node) => node.blockId) }, nodes }];
  });
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
 * The transformer group: each transformer after the cables feeding it (tree order), then the
 * cables that feed none of this cabine's live transformers, each with a warning.
 */
function transformerPairs(
  transformers: readonly TreeEquipmentNode[],
  cables: readonly TreeEquipmentNode[],
  blocks: ReadonlyMap<string, BlockRow>,
  cabineId: string,
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
      warnings.push({ kind: 'integrity', code: 'unpaired_cable', blockId: cable.blockId, cabineId });
    }
  }
  return [...transformers.flatMap((node) => [...(fed.get(node.blockId) ?? []), node.blockId]), ...unpaired];
}

/** A flagged cabine's sheets split into the fixed type groups, an empty group skipped. */
function byType(
  base: PrintSubsection,
  nodes: readonly TreeEquipmentNode[],
  blocks: ReadonlyMap<string, BlockRow>,
  warnings: PrintGroupWarning[],
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
    transformadores: transformerPairs(transformers, cables, blocks, base.cabineId, warnings),
  };
  return GROUP_WORDS.flatMap(({ kind, words }) =>
    ids[kind].length === 0 ? [] : [{ cabineId: base.cabineId, kind, title: `${words} ${ofCabine(base.title)}`, blockIds: ids[kind] }],
  );
}

/**
 * Section 9's subsections for a snapshot under a scheme (the relatório's own by default).
 * `por_local_e_tipo` is `ordem_de_campo` with every flagged cabine split by type; a cabine
 * with the flag off keeps exactly its base-case subsection.
 */
export function groupForPrint(snapshot: GroupSnapshot, scheme: PrintScheme = snapshot.relatorio.export.scheme): PrintGrouping {
  const base = fieldOrder(locationTree(snapshot));
  if (scheme === 'ordem_de_campo') return { scheme, subsections: base.map(({ subsection }) => subsection), warnings: [] };
  const flagged = new Set(snapshot.locations.filter((location) => location.kind === 'cabine' && location.agrupar_por_tipo).map((location) => location.id));
  const blocks = new Map(snapshot.blocks.map((block) => [block.id, block]));
  const warnings: PrintGroupWarning[] = [];
  const subsections = base.flatMap(({ subsection, nodes }) => (flagged.has(subsection.cabineId) ? byType(subsection, nodes, blocks, warnings) : [subsection]));
  return { scheme, subsections, warnings };
}
