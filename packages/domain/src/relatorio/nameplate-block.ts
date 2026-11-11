import type { BlockDefinition } from '../seed/schema.ts';

/*
 * Seed v14, batch e24s (Story 24.14; the behaviour pass's F18): what a definition says of its plate
 * block. The Malha de aterramento's first block holds the design value, the measuring method and the
 * soil's condition, not a plate: on v14 it is titled "Dados da malha" and offers no plate photo. Read
 * from the definition (a company copy carries both keys), never from a version number, so every older
 * definition reads as before: no title of its own and a photo offered.
 */

/** The plate block's own title (the Malha's "Dados da malha"), or null where the surface's "Dados de placa" stands. */
export function nameplateTitleOf(definition: Pick<BlockDefinition, 'nameplate_title'> | null | undefined): string | null {
  return definition?.nameplate_title ?? null;
}

/** False when the definition has no plate to photograph: no "Fotografar placa" and no retake row. */
export function nameplatePhotoOffered(definition: Pick<BlockDefinition, 'nameplate_photo'> | null | undefined): boolean {
  return definition?.nameplate_photo !== false;
}
