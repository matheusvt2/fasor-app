import {
  blockFieldPath,
  fileFieldPath,
  pointFieldPath,
  relatorioSetupPath,
  sheetChecklistPath,
  sheetConclusionPath,
  sheetObservationsPath,
  sheetTestCellPath,
  sheetTestValuePath,
} from '../ops/path.ts';
import type { AudioTarget } from '../schemas/entities.ts';

/*
 * Story 31.1 (AD-30): where an audio's target lives in the op paths. One place, so the push
 * route's permission check, the transcription job's write and the device read the same address.
 */

/** The path a prose target's text is put on; null for a measurement table, whose reading is suggested on a cell. */
export function audioTargetPath(target: AudioTarget): string | null {
  switch (target.type) {
    case 'item':
      return sheetChecklistPath(target.block_id, target.item_key, 'observation');
    case 'sheet_field':
      if (target.field === 'observations') return sheetObservationsPath(target.block_id);
      if (target.field === 'conclusion_text') return sheetConclusionPath(target.block_id, 'text');
      return blockFieldPath(target.block_id, 'not_tested');
    case 'test_value':
      return sheetTestValuePath(target.block_id, target.test_key, target.value_key);
    case 'photo_caption':
      return fileFieldPath(target.file_id, 'caption');
    case 'point':
      return pointFieldPath(target.point_id, target.field);
    case 'setup':
      return relatorioSetupPath(target.field === 'parecer_text' ? 'parecer' : target.field);
    case 'section':
      return blockFieldPath(target.block_id, 'config');
    case 'table':
      return null;
  }
}

/**
 * The path whose key an audio of this target needs (AD-29, "the mic follows the field's own write
 * permission"): the prose field's own path, and a measurement table's first cell for a table.
 */
export function audioPermissionPath(target: AudioTarget): string {
  if (target.type === 'table') return sheetTestCellPath(target.block_id, target.test_key, 0, 0);
  return audioTargetPath(target) as string;
}

/** The ficha (block) an audio's target belongs to, or null for a target outside one (a photo caption, a point, a setup text). */
export function audioBlockId(target: AudioTarget): string | null {
  switch (target.type) {
    case 'item':
    case 'sheet_field':
    case 'test_value':
    case 'section':
    case 'table':
      return target.block_id;
    case 'photo_caption':
    case 'point':
    case 'setup':
      return null;
  }
}
