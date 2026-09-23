import type { z } from 'zod';
import { isSectionBlockType, type SkeletonNode, type SubBlockKey, type TemplateBlock } from '../schemas/block-config.ts';
import { getDefinition, SEED_VERSIONS } from './definitions.ts';
import { LOCKED_SUB_BLOCKS } from './template.ts';

/*
 * The cross-field rules of a Template row (AD-21), run by `templateRowSchema`'s
 * `superRefine`: what a block's `BlockConfig` may hold depends on its block type's
 * definition under the row's own `seed_version`, and every equipment block must sit on a
 * node of the row's skeleton. Kept out of `schemas/entities.ts` so the seed stays a leaf
 * that entities imports, never the other way round.
 */

interface TemplateShape {
  seed_version: string;
  blocks: readonly TemplateBlock[];
  skeleton: readonly SkeletonNode[];
}

export function checkTemplateRow(row: TemplateShape, ctx: z.RefinementCtx): void {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });

  const nodes = new Map<string, SkeletonNode>();
  row.skeleton.forEach((node, i) => {
    if (nodes.has(node.ref)) issue(['skeleton', i, 'ref'], `duplicate skeleton ref "${node.ref}"`);
    nodes.set(node.ref, node);
  });
  row.skeleton.forEach((node, i) => {
    if (node.kind === 'coluna' && nodes.get(node.parent_ref)?.kind !== 'cabine') {
      issue(['skeleton', i, 'parent_ref'], `coluna "${node.ref}" must sit under a cabine`);
    }
  });

  // A seed version this bundle does not ship cannot be judged here; the structure above still is.
  const knownVersion = Object.hasOwn(SEED_VERSIONS, row.seed_version);

  row.blocks.forEach((block, i) => {
    const at = (key: string) => ['blocks', i, key];
    if (isSectionBlockType(block.block_type)) {
      if (block.subtype !== undefined) issue(at('subtype'), 'a section block has no subtype');
      if (block.role !== undefined) issue(at('role'), 'a section block has no role');
      if (Object.keys(block.sub_blocks).length > 0) issue(at('sub_blocks'), 'a section block has no sub-blocks');
      if (block.na_defaults.length > 0) issue(at('na_defaults'), 'a section block has no NA defaults');
      if (block.skeleton_location_ref !== null) issue(at('skeleton_location_ref'), 'a section block sits outside the skeleton');
      return;
    }

    if (block.skeleton_location_ref === null || !nodes.has(block.skeleton_location_ref)) {
      issue(at('skeleton_location_ref'), `${block.block_type} must sit on a node of the skeleton`);
    }
    if (!knownVersion) return;

    const definition = getDefinition(row.seed_version, 'cabine_primaria', block.block_type);
    if (block.subtype !== undefined && !definition.subtypes.some((s) => s.key === block.subtype)) {
      issue(at('subtype'), `${block.block_type} has no subtype "${block.subtype}"`);
    }
    for (const [key, config] of Object.entries(block.sub_blocks) as [SubBlockKey, { enabled: boolean }][]) {
      if (!definition.sub_blocks.includes(key)) issue(['blocks', i, 'sub_blocks', key], `${block.block_type} has no sub-block "${key}"`);
      else if (LOCKED_SUB_BLOCKS.includes(key) && !config.enabled) {
        issue(['blocks', i, 'sub_blocks', key], `"${key}" is always on`);
      }
    }
    for (const key of LOCKED_SUB_BLOCKS) {
      if (definition.sub_blocks.includes(key) && block.sub_blocks[key] === undefined) {
        issue(['blocks', i, 'sub_blocks', key], `"${key}" is always on and must be present`);
      }
    }
    const items = new Set((definition.checklist ?? []).map((item) => item.key));
    block.na_defaults.forEach((key, j) => {
      if (!items.has(key)) issue(['blocks', i, 'na_defaults', j], `"${key}" is not an item of ${block.block_type}`);
    });
  });
}
