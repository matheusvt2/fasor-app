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
    /** Verbatim from `42-template-composer.html`: a locked switch's name, "Observações e conclusão, sempre ativado". */
    lockedLabel: (name: string) => `${name}, sempre ativado`,
  },
  toast: {
    // authored: the mock's persistent toast (`key-sheet-states.html`) draws only its
    // action; a toast that does not expire also needs a way to put it away.
    dismiss: 'Fechar',
  },
  overlay: {
    // authored: the hidden dismiss buttons React Aria puts around a menu popover; the
    // library's own pt-BR word is "Descartar" (Epic 2 retro D-8).
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
  // Story 11.4: verbatim from the mock's `#tc-dlg-rich` `.rt-toolbar` (`aria-label` and the
  // five words). E11-Q5: owned by the shared rich editor (`input/rich-text-field.tsx`), which
  // the Template composer and the relatório's Section text surface both render.
  richText: {
    toolbar: 'Formatação',
    bold: 'Negrito',
    italic: 'Itálico',
    bullets: 'Lista',
    numbered: 'Numeração',
    variable: 'Variável',
  },
  loadingNote: {
    // authored (Matheus, 2026-09-30): a surface whose rows are still being read names them.
    text: (what: string) => `Carregando ${what}…`,
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
  // Verbatim from `60-ficha.html`: the Tri-state control's full-word segment names.
  triState: {
    C: 'Conforme',
    NC: 'Não conforme',
    NA: 'Não se aplica',
  },
  // The Measurement field (Story 5.5, UX-DR39): the unit slot, the calc mark, the cell menu.
  measurementField: {
    // authored: the spoken name of each unit, the unit slot's label (Story 5.5 AC 2).
    unitNames: {
      'MΩ': 'megaohms',
      'GΩ': 'gigaohms',
      'TΩ': 'teraohms',
      'µΩ': 'microohms',
      V: 'volts',
      kV: 'quilovolts',
      A: 'ampères',
      '%': 'por cento',
    } as Record<string, string>,
    // `60-ficha.html` "Unidade GΩ — toque para alternar", the unit spoken.
    unitCycle: (spoken: string) => `${spoken}, toque para alternar`,
    // authored: the M · G · T chip row's name on phone.
    unitChips: 'Unidade',
    // EXPERIENCE.md › Measurement table: a calculated cell shows "calc." and announces "calculado".
    calcMark: 'calc.',
    calcSpoken: 'calculado',
    // FR-27: the cell Overflow's one item.
    notMeasured: 'Não medido',
    // `key-equipment-sheet.html` `.mf-helper`'s text button.
    markRestricted: 'Marcar Com restrições',
    // authored: a typed text that is no number (kept typed, not committed).
    invalid: 'Número não reconhecido',
  },
  // The Suggestion field and the Generated text field (Story 5.8, UX-DR45/46/47).
  suggestionField: {
    suggested: 'Sugerido',
    // `60-ficha.html` `.verify-pill` (Story 8.1): a low-confidence guess.
    verify: 'Verificar',
    confirm: 'Confirmar',
    // `60-ficha.html` `.suggestion-alt` button (Story 8.1).
    replace: 'Substituir',
    // `60-ficha.html` `.crop-thumb` aria-label; EXPERIENCE.md › Suggestion field: the crop's alt.
    cropLabel: (label: string) => `Ver recorte da placa — ${label}`,
    cropAlt: 'Recorte da placa',
    // Story 9.1: `60-ficha.html` "Ver recorte do visor"; EXPERIENCE.md › Accessibility, the alt "Recorte do visor".
    cropDisplayLabel: (label: string) => `Ver recorte do visor — ${label}`,
    cropDisplayAlt: 'Recorte do visor',
    // Story 9.2: `40-relatorio-overview.html` `.detect-result .crop-thumb` "Ver recorte da etiqueta".
    cropPanelLabel: 'Ver recorte da etiqueta',
    // authored: the alt of the panel crop, after "Recorte da placa".
    cropPanelAlt: 'Recorte da etiqueta',
  },
  // Story 8.2: the arrival toast's action (EXPERIENCE.md › Reading arrived, "— Ver").
  readingArrival: {
    open: 'Ver',
  },
  generatedText: {
    criteria: 'Critérios usados',
    confirm: 'Confirmar',
    edit: 'Editar',
    replace: 'Substituir',
    // EXPERIENCE.md › Generated text field: under a confirmed text whose values changed.
    stale: 'Sugerido: texto atualizado',
  },
  registryPicker: {
    /** Trailing chip of `RegistryPickerField`'s chip row: opens the full Combobox (2.4, 2.5). */
    other: 'Outro…',
  },
  // authored: shared by every Registries tab that is a placeholder for a later story
  // (Empresa, Clientes, Fabricantes, Classes de tensão, Critérios), so each stub file
  // says the same true thing rather than inventing its own wording.
  // The words the shared upload tile owns, whatever surface it is on (AD-7).
  uploadTile: {
    // authored: the mocks draw "Escolher" on an empty tile and "Substituir" on a full one.
    choose: 'Escolher',
    replace: 'Substituir',
    // authored: AC 2.2-3 "the office opens the certificate from the row"; no mock draws
    // the action (Epic 2 retro D-3).
    open: 'Abrir',
    // authored: no mock draws a failed attach. The device refused the write (a full
    // quota is the realistic case), so the file is not attached and the pick is the retry.
    commitFailed: 'Não foi possível anexar o arquivo. Libere espaço no aparelho e escolha de novo.',
  },
  quantityStepper: {
    // Verbatim from `42-template-composer.html`'s `.step` buttons.
    decrement: 'Menos um',
    increment: 'Mais um',
    // authored: the typeable count's own name; the group carries "Seccionadoras, 25".
    count: 'Quantidade',
    // `.count` at zero (DESIGN.md › Quantity stepper wins over the mock's "0").
    zero: '—',
  },
  reorder: {
    // Verbatim from the mocks' drag handles ("Reordenar 1 Objetivo").
    handle: (name: string) => `Reordenar ${name}`,
    // authored: the Position box's name (EXPERIENCE.md › Block card).
    position: (name: string) => `Posição de ${name}`,
  },
  // Story 9.4: the Dictation button and what it hands over (UX-DR18, `components.css` Dictation button).
  dictation: {
    // Verbatim from the mocks' `.listening-word`.
    listening: 'Ouvindo…',
    // Story 9.4: a dictated prose result's action.
    use: 'Usar',
    // authored: the label of the Suggestion field that holds a dictated text under its field.
    resultLabel: 'Ditado',
    // authored: a recognition error (spec I/O matrix "Engine error").
    failed: 'Não foi possível ouvir. Digite ou tente de novo.',
    // authored: a table utterance the kernel could not read, sent to the sheet observation.
    unparsed: 'Leitura não reconhecida. O ditado ficou como sugestão em Observações.',
    // authored: the same with the sheet's Observações sub-block off (spec open question Q3).
    unparsedNoObservations: 'Leitura não reconhecida. Digite o valor na tabela.',
  },
  photoRow: {
    // `70-fotos.html` tile row `.photo-text .btn-text`, verbatim.
    caption: 'Legendar',
    // DESIGN.md › Photo stamp: the pin glyph is aria-hidden, "GPS" its accessible text.
    gps: 'GPS',
  },
} as const;
