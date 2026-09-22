/**
 * pt-BR copy owned by the shared components themselves (Design Notes: the app-wide copy
 * module EXPERIENCE.md's Voice and Tone table implies is not fully designed yet; this file
 * seeds it with only what this story's components need). Every later UI story extends this
 * same module rather than starting a second one.
 */
export const ui = {
  toggle: {
    /** `.toggle-word` when `aria-checked="true"`. */
    on: 'Ativado',
    /** `.toggle-word` when `aria-checked="false"`. */
    off: 'Desativado',
    /** `.toggle-word` for a locked sub-block (checklist, conclusion): not a control. */
    locked: 'Sempre',
  },
  confirmDialog: {
    /** Default label for the non-destructive action; initial focus lands here. */
    cancel: 'Cancelar',
  },
  overflowMenu: {
    /** `aria-label` template for the trigger button, e.g. "Mais opções de SEC-C09". */
    triggerLabel: (name: string) => `Mais opções de ${name}`,
  },
  statusPill: {
    /** `.status-pill` label per `RelatorioStatus`. */
    label: {
      rascunho: 'Rascunho',
      'em-campo': 'Em campo',
      'em-revisao': 'Em revisão',
      emitido: 'Emitido',
    },
  },
  combobox: {
    /** `aria-label` for the chevron button that opens the option list. */
    openList: 'Abrir lista',
    /** Trailing "Criar" option template/text, e.g. `Criar "Blutrafos"`. */
    create: (query: string) => `Criar “${query}”`,
  },
} as const;
