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
  toast: {
    // authored: the mock's persistent toast (`key-sheet-states.html`) draws only its
    // action; a toast that does not expire also needs a way to put it away.
    dismiss: 'Fechar',
  },
  appBar: {
    // Verbatim from `key-account.html`: the App bar's back `.icon-btn`.
    back: 'Voltar',
  },
  confirmDialog: {
    /** Default label for the non-destructive action; initial focus lands here. */
    cancel: 'Cancelar',
  },
  overflowMenu: {
    /** `aria-label` template for the trigger button, e.g. "Mais opções de SEC-C09". */
    triggerLabel: (name: string) => `Mais opções de ${name}`,
  },
  // The four status words and the status tile's accessible name ("<status>, 1 relatório")
  // are derived text: the kernel writes them (`statusLabel`, `statusTileLabel`), never
  // this module.
  syncBadge: {
    /**
     * `.sync-long` or `.sync-short` shows depending on the viewport, so the badge names
     * itself. "Sincronização. Abrir status" is the mock's label; the state is added
     * because the badge's whole job is to carry one.
     */
    label: (state: string) => `Sincronização: ${state.toLocaleLowerCase('pt-BR')}`,
    pressableLabel: (state: string) => `Sincronização: ${state.toLocaleLowerCase('pt-BR')}. Abrir status`,
  },
  combobox: {
    /** `aria-label` for the chevron button that opens the option list. */
    openList: 'Abrir lista',
    /** Trailing "Criar" option template/text, e.g. `Criar "Blutrafos"`. */
    create: (query: string) => `Criar “${query}”`,
  },
  registryPicker: {
    /** Trailing chip of `RegistryPickerField`'s chip row: opens the full Combobox (2.4, 2.5). */
    other: 'Outro…',
  },
  // authored: shared by every Registries tab that is a placeholder for a later story
  // (Empresa, Clientes, Fabricantes, Classes de tensão, Critérios), so each stub file
  // says the same true thing rather than inventing its own wording.
  registryTabPlaceholder: {
    text: 'Disponível em uma próxima etapa.',
  },
} as const;
