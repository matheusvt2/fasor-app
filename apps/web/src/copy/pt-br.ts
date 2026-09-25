/**
 * Every pt-BR string of Login and Account, in one module (UX-DR75).
 *
 * Most are verbatim from `mockups/prototype/screens/10-login.html`, `key-login.html` and
 * `90-account.html`. The rest cover states the mocks do not draw — a save in flight, a
 * failed request, an empty Home, the re-auth banner — and each of those carries an
 * `// authored:` note saying why it had to be written here. When a mock later gains the
 * state, its wording wins over the authored line.
 *
 * The product name is never written here: it comes from the PRODUTO constant.
 */
export const copy = {
  login: {
    emailLabel: 'E-mail',
    passwordLabel: 'Senha',
    showPassword: 'Mostrar',
    submit: 'Entrar',
    foot: 'Acesso fornecido pela sua empresa. Sem cadastro por aqui.',
    wrongPassword: 'Senha incorreta',
    offline:
      'Sem conexão — entre quando houver sinal; os relatórios já baixados neste aparelho continuam disponíveis após o login.',
    offlineReason: 'Entrar precisa de conexão',
    // authored: the mocks draw no in-flight state for "Entrar".
    signingIn: 'Entrando…',
    // authored: online, but the server did not answer or answered 5xx (database down).
    // Not the offline sentence (the device has a network) and never the password.
    serverUnavailable: 'Não foi possível falar com o servidor. Tente de novo em instantes.',
    // authored: checked on the device before any request is sent.
    emailRequired: 'Informe o e-mail',
    emailInvalid: 'E-mail inválido',
    passwordRequired: 'Informe a senha',
  },
  account: {
    title: 'Conta',
    identityHeading: 'Identificação',
    nameLabel: 'Nome',
    emailLabel: 'E-mail',
    companyLabel: 'Empresa',
    providedByCompany: 'Fornecido pela empresa',
    registrationHeading: 'Registro profissional',
    registrationNote:
      'Preenche o responsável técnico de um relatório novo com um toque. Aparece na assinatura da seção 10 e no controle do documento.',
    edit: 'Editar',
    councilLabel: 'Conselho',
    printedTitleLabel: 'Título impresso',
    printedTitleHelper: 'Segue o conselho; edite se o seu título for outro',
    cancel: 'Cancelar',
    save: 'Salvar',
    // authored: the mock renders these fields inline, so it has no dialog save button
    // and no failure state for one. The save is a local commit (user ops), so it works
    // offline and only a refused device write can fail it.
    saveFailed: 'Não foi possível salvar. Tente de novo.',
    registrationIncomplete: 'Informe o número do registro e o título impresso.',
    pendingLabel: 'Aguardando envio',
    // authored: the mock only draws the row with something pending.
    nothingPending: 'Nada aguardando envio',
    syncStatusLink: 'Ver status de sincronização',
    sessionHeading: 'Sessão',
    signOut: 'Sair',
    // With nothing pending only the second sentence of the mock's note applies; with
    // pending work the kernel's summary text ("31 fotos e 3 fichas") leads it.
    signOutNote: 'Sair antes do envio pede confirmação; nada é apagado deste aparelho.',
    signOutNotePending: (pending: string) =>
      `${pending} aguardando envio. Sair antes do envio pede confirmação; nada é apagado deste aparelho.`,
    // authored: the mock's Confirm dialog is the pending-sync variant; with nothing
    // pending the dialog says what is true, which is that nothing on this device is deleted.
    signOutDialogTitle: 'Sair desta conta?',
    signOutDialogBody:
      'Nada é apagado deste aparelho. O que estiver aqui continua aqui e sobe quando você entrar de novo com conexão.',
    signOutPendingDialogTitle: 'Sair com envios pendentes?',
    // The dialog body agrees with its count, so the kernel writes it (`pendingNotSentText`).
    signOutConfirm: 'Sair mesmo assim',
    // authored: the mock has no offline or failure state for "Sair".
    signOutOfflineReason: 'Sair precisa de conexão',
    signOutFailed: 'Não foi possível sair. Tente de novo.',
    // Tema and Armazenamento from `mockups/prototype/screens/90-account.html`.
    themeHeading: 'Tema',
    themeNote: 'Segue a preferência do aparelho. Os dois temas mantêm o contraste para uso ao sol.',
    themeSystem: 'Sistema',
    themeLight: 'Claro',
    themeDark: 'Escuro',
    storageHeading: 'Armazenamento neste aparelho',
    storageInUse: 'Em uso',
    storageNote:
      'Fotos ficam neste aparelho até o servidor confirmar o recebimento. Relatórios emitidos são removidos daqui sozinhos.',
  },
  // Home from `mockups/prototype/screens/20-home.html` and `key-home.html`. Every card
  // line, the board counts and the shortcut sub-lines come from the kernel
  // (`homeCards`, `statusBoardCounts`, `templatesSubline`), never from here.
  home: {
    title: 'Início',
    accountLink: 'Conta',
    wordmarkLabel: (produto: string) => `${produto} — início`,
    statusHeading: 'Relatórios por status',
    relatoriosHeading: 'Relatórios',
    newRelatorio: 'Novo relatório',
    continue: 'Continuar',
    openSummary: 'Ver sumário',
    shortcutsHeading: 'Atalhos',
    templates: 'Templates',
    cadastros: 'Cadastros',
    // Verbatim from `20-home.html`: "Continuar: <span class="tabular">SEC-C05 · 42 de 94</span>".
    continueTo: 'Continuar: ',
    // Story 4.1: "Novo relatório" first asks for the client and the obra (the Project the
    // relatório is born in), through the client Combobox `50-relatorio-setup.html` draws.
    newProject: {
      title: 'Novo relatório',
      clientLabel: 'Cliente',
      // Verbatim from `50-relatorio-setup.html` Etapa 1.
      siteLabel: 'Local (obra)',
      // authored: the dialog asks for both before the Project surface can open.
      continue: 'Continuar',
      cancel: 'Cancelar',
      needsClient: 'Continuar: falta o cliente',
      needsSite: 'Continuar: falta a obra',
      // Verbatim from `50-relatorio-setup.html`'s "Criar" option toast.
      clientCreated: 'Cliente criado no cadastro de Clientes',
    },
    // authored: the mock draws no empty Home; a device with nothing on it still needs a sentence.
    empty: 'Nenhum relatório ainda.',
    // authored: a tile that reads zero is still pressable, and an empty list under it is
    // not an empty device — the two cases have to say different things.
    noneForFilter: 'Nenhum relatório neste status.',
    // Verbatim from `key-home.html` frame 3.
    offlineToast: 'Sem conexão. Tudo fica salvo neste aparelho.',
  },
  // authored: `source-deltas.md` gave the re-auth banner the slot the removed install
  // banner had, so no mock draws it yet.
  banner: {
    reAuthText: 'Sua sessão expirou. Nada foi apagado deste aparelho.',
    reAuthAction: 'Entrar de novo',
    // Verbatim from the prototype's `#slot-offline` banner text.
    offlineText: 'Sem conexão. Tudo fica salvo neste aparelho.',
    // Verbatim from Story 1.8's acceptance criterion (AD-8's 5-day rule).
    unsyncedText: 'Alterações sem envio há 5 dias',
    // authored: WCAG 2.5.3 wants the accessible name to start with the visible label,
    // which is the "+N" the chip prints.
    moreLabel: (count: number) => `+${count}, outras condições — abrir status de sincronização`,
    // `key-sync-status.html` low-storage banner's action, verbatim; its sentence is the
    // kernel's `storageLowBannerText`.
    storageLowAction: 'Sincronizar',
  },
  // Sync status from `mockups/prototype/screens/85-sync.html` and `key-sync-status.html`.
  // The badge words and the pending summary come from the kernel (`syncBadgeLabel`,
  // `pendingSummaryText`), never from here.
  sync: {
    title: 'Sincronização',
    nothingPending: 'Nada pendente neste aparelho.',
    waiting: (pending: string) => `${pending} aguardando envio`,
    syncNow: 'Sincronizar agora',
    syncing: 'Sincronizando…',
    offlineReason: 'Sem conexão',
    // authored: the badge has five states and says "Sem conexão" when the office cannot be
    // reached although the device is online; these lines say which cause it is.
    serverUnreachable: 'Não foi possível falar com o servidor. Tudo fica salvo neste aparelho.',
    sessionExpired: 'Sua sessão expirou. Entre de novo para enviar.',
    // The dead-op row ("3 alterações rejeitadas") and the server's `superseded` row are
    // counts, so the kernel writes them (`rejectedText`, `supersededText`).
    resend: 'Reenviar',
    lastPushHeading: 'Último envio',
    lastPushNote: 'O servidor não sabe o que ainda está em outro aparelho; a hora do último envio é o sinal honesto.',
    thisDevice: 'Este aparelho',
    // authored: the mock names the other device's kind ("Telefone"), which the server does not know.
    otherDevice: 'Outro aparelho',
    // authored: the mock always has a push to show.
    noPushYet: 'Nenhum envio registrado ainda.',
    lastSync: 'Última sincronização',
    // authored: the mock always has a sync to show.
    neverSynced: 'Ainda não sincronizado',
  },
  // authored: there is no mock for the 426 state (AR-12); a UX pass may replace these
  // strings without touching behavior.
  outdated: {
    title: 'Atualização necessária',
    body: (produto: string) =>
      `Este aparelho está com uma versão antiga do ${produto}. O que você fez continua salvo e será enviado; para receber as alterações da equipe, atualize a página.`,
    action: 'Atualizar',
  },
  // Verbatim from `mockups/key-sheet-states.html` frame (d): the persistent toast that
  // offers an uncommitted value back. `prototype/screens/60-ficha.html` draws the same
  // condition as a dismissible banner and is stale (EXPERIENCE.md, MOCK-GUIDE.md and the
  // story AC all say toast).
  draft: {
    foundText: 'Rascunho encontrado',
    recoverAction: 'Recuperar',
  },
  // authored: AD-8 says a refused write is never silent, and no mock draws the state.
  // Two sentences, because "libere espaço" is only true of the quota refusal.
  write: {
    quotaError: 'Não foi possível salvar neste aparelho. Libere espaço e tente de novo.',
    unknownError: 'Não foi possível salvar. Tente de novo.',
  },
  // authored: AD-8's "one-time screen naming what the server holds"; there is no mock,
  // so this follows `contract-outdated-surface`'s wording — say what is true, say what
  // the single action does, never blame the device.
  recovery: {
    title: 'Dados deste aparelho foram apagados',
    body: (produto: string) =>
      `O navegador liberou o espaço que o ${produto} usava neste aparelho. Sua conta continua ativa e o servidor guarda o trabalho que já foi enviado.`,
    // "O servidor tem 3 relatórios e 2 pessoas da equipe." is a count, written by the
    // kernel (`serverHoldsText`) from the company pull.
    /** Before the first company pull there is nothing to count yet. */
    holdsUnknown: 'Ainda não sabemos o que o servidor tem; baixe para descobrir.',
    action: 'Baixar do servidor',
    running: 'Baixando…',
    failed: 'Não foi possível baixar agora. Verifique a conexão e tente de novo.',
    offlineReason: 'Baixar precisa de conexão',
    // authored: a screen with one action that needs the server is a dead end when the
    // server is the thing that is down. This is the way out, and it says what is true —
    // nothing is lost by taking it, the pull happens on the next sync anyway.
    skipAction: 'Continuar sem baixar',
    skipNote: 'Você pode seguir agora; o que está no servidor desce sozinho na próxima sincronização.',
  },
  // Templates (`41-templates.html`, Stories 3.2 and 3.3). The headings' counts and the
  // row's secondary line are the kernel's (`templatesHeading`, `archivedHeading`,
  // `templateSummaryText`), and so is the name a duplicate or a new template gets.
  templates: {
    title: 'Templates',
    note: 'Um template é a composição de blocos que um relatório novo copia. Alterar um template não muda relatórios já criados a partir dele.',
    listLabel: 'Templates ativos',
    // Verbatim from EXPERIENCE.md State Patterns › Empty (UX-DR70).
    empty: 'Nenhum template. Crie um a partir do relatório padrão FO.SERV-03.',
    // authored: no mock draws the empty state, so its one action is named here.
    createStandard: 'Criar template padrão',
    // authored: the reason beside the action while its create is being written.
    creating: 'Criando o template…',
    // authored: before the first complete company download this device cannot know
    // whether the company already has the standard template, so the action waits.
    awaitingDownload: 'Aguardando o primeiro download da empresa',
    newTemplate: 'Novo template',
    openRow: (name: string) => `Abrir template ${name}`,
    duplicate: 'Duplicar',
    // The mock's toast, with the story's "— cópia" name (Story 3.3 AC wins over "(cópia)").
    duplicated: (name: string) => `Duplicado como “${name}”`,
    archive: 'Arquivar',
    archived: 'Template arquivado · relatórios já criados continuam intactos',
    restore: 'Restaurar',
    restored: 'Template restaurado · volta para a lista de ativos',
    archivedListLabel: 'Templates arquivados',
    archivedNote: 'Não aparecem em "Novo relatório a partir de template". Relatórios já criados continuam intactos.',
    remove: 'Remover',
    // authored: the mock's Overflow is "não prototipado"; the Confirm dialog follows the
    // registries' wording (a sentence naming the consequence).
    removeConfirmTitle: (name: string) => `Remover ${name}?`,
    removeConfirmBody: 'O template sai da lista; nenhum relatório foi criado a partir dele.',
    removed: (name: string) => `${name} removido`,
    // authored: the remove re-check at the moment of the write found a relatório created
    // from the template since the menu was drawn (FR-9: a referenced template is archived).
    removeReferenced: 'Este template já foi usado em relatórios; arquive-o.',
    undo: 'Desfazer',
    cancel: 'Cancelar',
  },
  // Template composer (`42-template-composer.html`, Story 3.4). Every count, total,
  // heading with a count and move announcement is the kernel's (`totalsText`,
  // `skeletonHeading`, `sectionsHeading`, `nodeSummaryText`, `quantityLabel`,
  // `moveAnnouncement`, `removedText`).
  composer: {
    title: 'Template',
    nameLabel: 'Nome do template',
    // authored: EXPERIENCE.md autosave wins over the mock's "Salvar template / Cancelar"
    // sticky bar, so the sentence that sat beside it carries the rule on its own.
    autosaveNote: 'Alterações são salvas automaticamente e não alteram relatórios já criados deste template.',
    // authored: an address that names no template on this device.
    notFound: 'Template não encontrado.',
    // authored: the way back from the not-found sentence.
    backToList: 'Voltar para Templates',
    skeletonNote: 'Cada bloco do relatório nasce na sua coluna, com a TAG final (tipo + coluna)',
    skeletonListLabel: 'Cabines do template',
    columnListLabel: (cabine: string) => `Colunas de ${cabine}`,
    agruparPorTipo: 'Agrupar por tipo',
    addColuna: 'Adicionar coluna',
    addCabine: 'Adicionar cabine',
    // authored: the reasons beside "Adicionar coluna" when it has no cabine to add to.
    addColunaNoCabine: 'Adicione uma cabine primeiro.',
    selectNode: 'Selecione uma cabine ou coluna.',
    sectionsNote: 'Ordem inicial da árvore; o engenheiro reordena no relatório.',
    sectionsListLabel: 'Blocos do template',
    // The palette (`aside.block-palette.composer-palette`).
    paletteLabel: 'Paleta de blocos',
    paletteTitle: 'Blocos',
    paletteSections: 'Seções',
    // authored: the mock's "Equipamentos · toque para adicionar à coluna selecionada
    // (Coluna 5)", adapted to the stepper rows that set the quantity at the current node.
    paletteEquipment: (node: string) => `Equipamentos · quantidade em ${node}`,
    paletteEquipmentNone: 'Equipamentos',
    // authored: "Adicionar abaixo" places the next section tapped in the palette under
    // the card it was chosen on (EXPERIENCE.md › Block card).
    paletteInsertBelow: (section: string) => `A próxima seção tocada entra abaixo de ${section}.`,
    closePalette: 'Fechar',
    // Overflow items (EXPERIENCE.md › Block card, in this order).
    rename: 'Renomear',
    moveUp: 'Subir',
    moveDown: 'Descer',
    addBelow: 'Adicionar abaixo',
    duplicate: 'Duplicar',
    remove: 'Remover',
    // authored: the rename Form dialog.
    renameTitle: (name: string) => `Renomear ${name}`,
    renameLabel: 'Nome',
    // authored (E3-A9): a blank name refused, the location tree's own words (`tagDialogs.emptyName`).
    renameEmpty: 'Informe o nome',
    save: 'Salvar',
    cancel: 'Cancelar',
    // Story 3.5: the per-type sub-block defaults, a Form dialog opened from the palette's
    // equipment row. The mock draws them in an expanded equipment `.block-card`; the
    // composer lists no equipment cards, so they open from the row instead.
    // authored: the icon button's name on the row, and the dialog's title.
    editDefaults: (type: string) => `Editar padrões de ${type}`,
    defaultsTitle: (type: string) => `Padrões de ${type}`,
    // Verbatim from the mock's `.block-expand`.
    subtypeLabel: 'Subtipo padrão',
    subBlocksTitle: 'Sub-blocos padrão',
    // Verbatim from the mock's locked "Observações e conclusão" row, its `.toggle-sub`.
    alwaysOnSheet: 'Sempre na ficha',
    defaultsNote:
      'Um sub-bloco desativado não é impresso na ficha — nunca sai vazio. Cada ficha pode sobrepor estes padrões pela paleta aberta de dentro dela.',
    // authored: the select's option for a type used with no subtype.
    noSubtype: 'Sem subtipo',
    // authored: every placement of the type follows one config (Story 3.5 Design Notes).
    defaultsScope: 'Vale para todos os equipamentos deste tipo no template.',
    // The sub-blocks' labels: the mock's "Dados de placa" and "Verificações gerais", the
    // story's "IA e IP lidos do visor", the rest authored from the seed's test names.
    subBlockLabels: {
      nameplate: 'Dados de placa',
      checklist: 'Verificações gerais',
      isolacao: 'Ensaio de isolação',
      ia_ip_display: 'IA e IP lidos do visor',
      resistencia_contato: 'Resistência de contato',
      relacao_transformacao: 'Relação de transformação',
      observations: 'Observações',
      conclusion: 'Conclusão',
    },
    // Story 3.6: the section text editor, a Form dialog from the section card's Overflow.
    editText: 'Editar texto',
    // authored (E3-A9): the section card body's name, which opens the same editor.
    editTextOf: (section: string) => `Editar texto de ${section}`,
    // Verbatim from the mock's `#tc-dlg-rich` title and meta.
    textTitle: (section: string) => `${section} — texto fixo`,
    textNote: 'Vale para os próximos relatórios deste template. As variáveis são preenchidas em Dados do relatório; o texto nunca aparece em campo.',
    // Verbatim from the mock's `.rt-area` `aria-label` ("Texto da seção 1").
    sectionTextLabel: (n: number) => `Texto da seção ${n}`,
    // Verbatim from `45-secao.html`'s chip row and the story AC.
    insertVariable: 'Inserir dado do relatório',
    // authored: the story AC's "Restaurar texto padrão" (the relatório copy reads "do template").
    restoreDefaultText: 'Restaurar texto padrão',
    // authored: the toast of that restore.
    textRestored: 'Texto padrão restaurado',
    // authored: the section the editor was opened on was moved or removed on another device.
    textGone: 'A seção mudou em outro aparelho; o texto não foi salvo.',
    // authored: autosave replaces the mock's "Salvar texto / Cancelar" pair (EXPERIENCE.md).
    textAutosave: 'Salvo automaticamente. Texto simples; negrito e listas ficam para depois.',
    close: 'Fechar',
    // authored: the Confirm dialogs of a removal, one sentence of consequence each.
    removeConfirmTitle: (name: string) => `Remover ${name}?`,
    removeCabineBody: 'A cabine, as colunas dela e os equipamentos que elas levam saem do template.',
    removeColunaBody: 'A coluna e os equipamentos que ela leva saem do template.',
    removeSectionBody: 'A seção sai do template.',
    undo: 'Desfazer',
    // Section block titles, verbatim from the mock's palette and block cards.
    sectionTitles: {
      section_1: 'Objetivo',
      section_2: 'Definições',
      section_3: 'Limite de escopo',
      section_4: 'Requisitos básicos',
      section_5: 'Segurança (NR-10)',
      section_6: 'Verificações aplicáveis',
      section_8: 'Pontos de atenção',
      section_10: 'Conclusão',
      section_11: 'Certificados',
    },
    // Equipment row names, verbatim from the mock's palette and `.qty-name`.
    equipmentNames: {
      cabos_entrada: 'Cabos de entrada',
      para_raio: 'Para-raio',
      chave_seccionadora: 'Chave seccionadora',
      disjuntor_mt: 'Disjuntor MT',
      tp: 'TP — proteção',
      tc: 'TC — proteção',
      cabos_saida: 'Cabos de saída / alimentação TRn',
      transformador_forca: 'Transformador de força',
    },
  },
  // Export dialog (`73-exportar.html`, Story 4.8). Every sentence that carries a revision
  // number is the kernel's (`idleReason`, `generatingText`, `generatingReason`,
  // `readyTitle`, `readyToast`, `nextEditNote`, `revisionRowSegments`); only the static
  // words live here. The pre-issue list, the document control summary, "Pré-visualizar",
  // the share buttons and the PDF row are out of this story's slice.
  export: {
    title: 'Gerar relatório',
    generate: 'Gerar relatório',
    // The working line's second sentence, verbatim from the mock's `.gen-progress`.
    canClose: 'pode fechar — o aviso chega quando terminar',
    failed: 'Não foi possível gerar o relatório. Os dados não foram alterados e nenhuma revisão foi criada.',
    retry: 'Tentar novamente',
    openDocx: 'DOCX — abrir no Word',
    generateAgain: 'Gerar de novo',
    revisionsLabel: 'Revisões',
    revisionDocx: 'DOCX',
    // authored: UX-DR58, the reason while the outbox is drained before the request.
    flushing: 'Enviando…',
    // authored: generation needs a connection and says so (EXPERIENCE.md › Export dialog).
    offlineReason: 'Gerar relatório precisa de conexão. Conecte e tente de novo.',
    // authored: a dead op can never reach the server, so the barrier would never pass.
    deadOpsReason: 'Há alterações rejeitadas — resolva em Sincronização antes de gerar.',
    // authored: the mock always has a revision to list.
    noRevisions: 'Nenhuma revisão gerada ainda.',
    // authored: the server answered with a revision this device has not pulled yet; the
    // download row waits for it (the stream is being asked for).
    downloadingRevision: 'Baixando a revisão…',
  },
  // Project (`30-project.html`, Story 4.1). The heading's count, the row lines, the
  // dates and the counter are the kernel's (`projectRelatoriosHeading`, `relatorioTitle`,
  // `relatorioSubText`, `dateRangeText`, `fichasCountText`).
  project: {
    title: 'Obra',
    crumbsHome: 'Início',
    newRelatorio: 'Novo relatório a partir de template',
    clientLabel: 'Cliente',
    siteLabel: 'Obra / local',
    relatoriosLabel: 'Relatórios',
    columns: { relatorio: 'Relatório', status: 'Status', dates: 'Datas', template: 'Template', progress: 'Progresso' },
    // Verbatim from EXPERIENCE.md State Patterns › Empty (Project).
    empty: 'Nenhum relatório nesta obra.',
    // authored: an address that names no project on this device.
    notFound: 'Obra não encontrada.',
    backHome: 'Voltar para o início',
    listLabel: 'Relatórios desta obra',
  },
  // The "Novo relatório" Form dialog (`30-project.html` `#proj-dlg-novo`). The reason
  // beside "Criar relatório" and the template helper are the kernel's (`newRelatorioReason`,
  // `templateHelperText`, `templateBlocksText`).
  newRelatorio: {
    title: 'Novo relatório',
    descriptionLead: 'Para ',
    descriptionTail: '. Os dados da capa, os instrumentos e as exclusões vêm em seguida, em Dados do relatório.',
    typeLabel: 'Tipo de relatório',
    typeName: 'Cabine primária',
    typeMeta: 'Relatório de inspeção e ensaios em cabine primária de média tensão (FO.SERV-03)',
    typeNote: 'Único tipo disponível nesta versão. Outros tipos (painel, SPDA) entram aqui quando existirem.',
    templateLabel: 'Template',
    startLabel: 'Início da parada',
    endLabel: 'Fim da parada',
    cancel: 'Cancelar',
    create: 'Criar relatório',
    // authored: the reason beside "Criar relatório" while its 223 ops are being written.
    creating: 'Criando o relatório…',
  },
  // The Sumário (`40-relatorio-overview.html`, Story 4.3). Every row title, meta, count
  // and reason is the kernel's (`sumarioRows`, `preIssue`, `progress`, `generateReason`).
  sumario: {
    title: 'Sumário',
    listLabel: 'Sumário do relatório',
    summaryLabel: 'Resumo do relatório',
    headerMenu: 'Mais opções do relatório',
    // "Número de Objetivo — digite outro para mover": the Position box of a row.
    positionLabel: (title: string) => `Número de ${title} — digite outro para mover`,
    // Overflow of a numbered row, in the mock's order.
    addBelow: 'Adicionar abaixo',
    moveUp: 'Subir',
    moveDown: 'Descer',
    duplicate: 'Duplicar',
    remove: 'Remover',
    undo: 'Desfazer',
    removed: 'Seção removida deste relatório — numeração refeita',
    // authored: the toasts of "Adicionar abaixo" and "Duplicar" (the mock's, without "Desfazer" on the first).
    added: 'Nova seção adicionada abaixo — numeração refeita',
    duplicated: 'Seção duplicada abaixo',
    // Section 9.
    s9Toggle: 'Expandir ou recolher a seção 9',
    s9Note: 'Organizados por local aqui; no documento, agrupados como no FO.SERV-03.',
    s9TreeLabel: 'Locais do relatório',
    here: 'você parou aqui',
    // Header Overflow.
    restore: 'Restaurar ficha removida',
    restoreTitle: 'Restaurar ficha removida',
    restoreNone: 'Nenhuma ficha removida para restaurar',
    restoreAction: 'Restaurar',
    // authored: the accessible name of each row's "Restaurar", so two rows never read alike.
    restoreLabel: (name: string) => `Restaurar ${name}`,
    // authored: the toast after a restore.
    restored: 'Ficha restaurada — numeração refeita',
    close: 'Fechar',
    // "Adicionar abaixo" dialog.
    addSectionTitle: 'Adicionar seção abaixo',
    addSectionListLabel: 'Seções',
    // Foot.
    preview: 'Pré-visualizar',
    // authored: the draft preview (RASCUNHO watermark) is Epic 7's (FR-73).
    previewReason: 'Pré-visualizar: disponível em uma próxima etapa',
    generate: 'Gerar relatório',
    // authored: an address that names no relatório on this device, and the way back.
    notFound: 'Relatório não encontrado neste aparelho.',
    backHome: 'Voltar para o início',
    // authored: the company summary lists the relatório but its pull left no row on this device.
    downloadFailed: 'Não foi possível baixar o relatório neste aparelho.',
    retry: 'Tentar de novo',
    // authored: while `syncRelatorio` brings a relatório opened from its Home card down.
    loading: 'Baixando o relatório…',
    // authored: the section the action names is no longer in the relatório (another device removed it).
    gone: 'A seção mudou em outro aparelho; nada foi alterado.',
    // Section 9's location tree and the rail (Stories 4.4, 4.5). Every state word, glyph,
    // counter, meta, TAG and composed sentence is the kernel's (`locationTree`, block texts).
    tree: {
      // `40-relatorio-overview.html` cabine chevrons ("Expandir Cubículo Enel"); the collapse word is authored.
      expand: (name: string) => `Expandir ${name}`,
      // authored: the chevron of an open node names what a press does.
      collapse: (name: string) => `Recolher ${name}`,
      // The cabine Overflow, verbatim from `#sum-menu-cabine`.
      openFirst: 'Abrir primeira ficha (dados da cabine)',
      agrupar: 'Agrupar por tipo na seção 9',
      addBlock: 'Adicionar bloco',
      // authored: Story 4.4 adds a coluna and renames a location from the tree.
      addColuna: 'Adicionar coluna',
      // A location's Overflow item and the duplicate line's action (`key-sheet-states.html` duplicated row).
      // Subir, Descer, Adicionar abaixo, Duplicar and Remover are the Sumário's own keys above.
      rename: 'Renomear',
      // authored: the equipment row Overflow's rename.
      renameTag: 'Renomear TAG',
      // DESIGN.md Block card row / `60-ficha.html` header Overflow: shared by both entry
      // points' menu item and both dialogs' title and primary (Story 5.9).
      markNotTested: 'Marcar não ensaiado',
      // authored: the reason picker's chip group name (the seed's reasons, source-deltas.md row 56).
      notTestedReasonLabel: 'Motivo',
      // authored: the text field "Outro" reveals.
      notTestedTextLabel: 'Descreva o motivo',
      // authored (Story 12.4): the primary's reason while no reason is tapped, nothing preselected.
      notTestedPickReason: 'Escolha um motivo',
      // authored (Story 12.4): the primary's reason while "Outro" has no text.
      notTestedTextReason: 'Descreva o motivo',
      // authored: the duplicate line's "Renomear" named with its row, so two duplicated rows never read alike.
      renameDuplicateLabel: (tag: string, path: string) => `Renomear TAG ${tag} em ${path}`,
      // `40-relatorio-overview.html` `.s9-add`.
      addBlockIn: (name: string) => `Adicionar bloco em ${name}`,
      // authored: the foot of section 9's tree.
      addCabine: 'Adicionar cabine',
      // `key-sheet-states.html` (e) and (e'): the remove Confirm and its toast.
      removeDescription: 'Dá para desfazer em seguida e restaurar em "Restaurar ficha removida" até o relatório ser emitido.',
      removeConfirm: 'Remover ficha',
      removed: 'Ficha removida',
      // authored: the toast after an equipment sheet is restored.
      restored: 'Ficha restaurada',
      // authored: the sheet or the location the action names changed on another device.
      gone: 'A ficha mudou em outro aparelho; nada foi alterado.',
      locationGone: 'O local mudou em outro aparelho; nada foi alterado.',
    },
    // The TAG and name dialogs of the tree (authored: no mock draws them; EXPERIENCE.md ›
    // Equipment identity and Form dialog).
    tagDialogs: {
      duplicateTitle: (tag: string) => `Duplicar ${tag}`,
      renameTagTitle: (tag: string) => `Renomear TAG ${tag}`,
      renameTitle: (name: string) => `Renomear ${name}`,
      tagLabel: 'TAG',
      nameLabel: 'Nome',
      save: 'Salvar',
      emptyTag: 'Informe a TAG',
      emptyName: 'Informe o nome',
      // The primary's visible reason while the field refuses.
      missingTag: (action: string) => `${action}: falta a TAG`,
      missingName: (action: string) => `${action}: falta o nome`,
      takenReason: (action: string) => `${action}: a TAG já existe nesta obra`,
    },
    // The field Block palette (`40-relatorio-overview.html` `#lo-palette`).
    palette: {
      title: 'Adicionar bloco',
      where: (path: string) => `Em: ${path}`,
      // authored from the mock's "Ou escolha o tipo · …": the camera tile above it is out of the slice.
      chooseType: 'Escolha o tipo · TAG sugerida por tipo + coluna',
      officeNote: 'Seções de texto e sub-blocos (ensaios, placa, itens) são do escritório: Compositor de template e paleta aberta de dentro da ficha no desktop.',
      // The office confirm (EXPERIENCE.md › Block palette, office variant: TAG and location, prefilled);
      // its "TAG" is the dialogs' `tagDialogs.tagLabel`.
      localLabel: 'Local',
      confirm: 'Confirmar',
    },
    // The rail (`shell-head.html`), and `/relatorio/:id/arvore`.
    rail: {
      // The route title, the rail's name and the strip's vertical label (`shell-head.html`).
      title: 'Árvore do relatório',
      collapse: 'Recolher árvore',
      open: 'Abrir árvore do relatório',
      stripLabel: 'Árvore do relatório (recolhida)',
      // authored: tracked stub, owner Epic 5 (the sheet column beside the rail).
      note: 'Abra uma ficha na árvore.',
    },
  },
  // The equipment sheet (`60-ficha.html`, `key-equipment-sheet.html`, `key-sheet-states.html`,
  // Stories 5.1-5.4). Every count, state, attribution line, missing count and copied-field
  // sentence is the kernel's (`sheetProgress` and its texts, `nameplate-copy.ts`,
  // `ficha.ts`); field and item labels are the seed's own (they print).
  // Stories 6.1 and 6.2: the camera and the photo tiles (`70-fotos.html`, `60-ficha.html`,
  // `key-photos.html`). Counts, captions, pill words and the storage sentence are the
  // kernel's (`burstCountText`, `contextCaption`, `uploadPillText`, `storageLowBannerText`).
  photos: {
    // `70-fotos.html` Sticky action bar `.camera-capture-btn`: the mock's aria-label adds
    // "— abre a câmera diretamente"; the spec and the epic AC name it "Tirar foto".
    takePhoto: 'Tirar foto',
    camWord: 'Foto',
    // `70-fotos.html` camera view, verbatim.
    cameraLabel: 'Câmera',
    closeCamera: 'Fechar a câmera sem concluir',
    finderLabel: 'Visor da câmera',
    shutter: 'Disparar',
    done: 'Concluir fotos',
    burstIdle: 'Rajada: toque no disparador quantas vezes precisar; nada pergunta entre as fotos',
    // authored: `.cam-hint` for a sheet (the mock's hint describes the gallery's context).
    hint: 'Cada disparo é salvo neste aparelho com a legenda do contexto.',
    // `70-fotos.html` "Concluir fotos" toast, verbatim.
    doneToast: 'Fotos salvas neste aparelho — entram na fila de envio',
    // authored: EXPERIENCE.md › camera permission denied: the reason and the OS path under the button.
    denied: 'A câmera está bloqueada para este site. Para liberar: Configurações do navegador › Permissões do site › Câmera.',
    // authored: FR-57, the browser refused to store a shot while offline; it is kept in memory.
    refusalToast: 'Este aparelho recusou guardar a foto. Ela fica na memória e será tentada de novo no próximo disparo.',
    // authored: a shot that could not be read or saved at all.
    failedToast: 'Não foi possível salvar a foto. Tente de novo.',
    // `60-ficha.html` NC row, verbatim.
    addPhoto: 'Adicionar foto',
    addPhotoReason: 'Recomendada para não conforme',
    // authored: the NC row's photo list and each tile's name (`key-photos.html` "Foto 1, abrir"
    // opens the viewer, which is Story 6.3's; here the tile is a picture, not a button).
    rowPhotosLabel: (n: number) => `Fotos do item ${n}`,
    tileLabel: (n: number) => `Foto ${n}`,
  },
  // Story 6.6: the Points surface (`72-pontos.html`) and the point editor. Counts, titles,
  // order lines and the derived entries' texts are the kernel's (`points/*.ts`).
  points: {
    title: 'Pontos de atenção',
    // `72-pontos.html` `.section-note`, verbatim minus the sentences about the photo draft,
    // the priority and the action-plan table, none of which the MVP builds (source-deltas row 29).
    sectionNote:
      'A ordem aqui é a ordem da seção 8 do relatório. Reordene arrastando, pelo menu ⋯ ou com Alt+↑/↓. Um ponto criado de um item não conforme já traz a foto e o equipamento. Equipamentos marcados como Não ensaiado entram sozinhos ao final, com o motivo.',
    // Story 6.6 AC, verbatim.
    empty: 'Nenhum ponto de atenção.',
    create: 'Criar',
    createFromRow: 'Criar ponto de atenção',
    actionLabel: 'Ação recomendada',
    // `72-pontos.html`, verbatim.
    listLabel: 'Pontos de atenção da seção 8',
    textLabel: 'Texto',
    quickTexts: 'Textos rápidos',
    textHelper: 'Referências a fotos entram pela seleção abaixo; o número é definido na exportação.',
    photosLabel: 'Fotos referenciadas',
    choosePhotos: 'Escolher fotos',
    photosMeta: 'Números provisórios — definidos na exportação',
    actionDt: 'Ação',
    none: '—',
    removePoint: 'Remover ponto',
    removed: 'Ponto removido',
    undo: 'Desfazer',
    moveUp: 'Subir',
    moveDown: 'Descer',
    remove: 'Remover',
    notTestedChip: 'Não ensaiado',
    autoOrder: 'Listado automaticamente · após os pontos manuais',
    autoReason: 'O motivo é editado na ficha; o ponto sai daqui se a ficha voltar a ser ensaiada',
    openSheet: (tag: string) => `Abrir ficha ${tag}`,
    // authored: the parts of the editor no mock names.
    concluir: 'Concluir',
    cancel: 'Cancelar',
    edit: 'Editar',
    editLabel: (title: string, position: number) => `Editar o ponto ${position}, ${title}`,
    // The name a card's drag handle and Overflow read ("Reordenar ponto 2, Geral"): two points
    // may share a title, never a position.
    cardName: (position: number, title: string) => `ponto ${position}, ${title}`,
    editingReason: 'Conclua o ponto em edição primeiro.',
    equipmentLabel: 'Equipamento',
    newOrder: 'Novo ponto · entra no fim da seção 8',
    editingLabel: (position: number | null) => (position === null ? 'Novo ponto de atenção em edição' : `Ponto de atenção ${position} em edição`),
    removeTitle: 'Remover este ponto de atenção?',
    removeDescription: 'Ele sai da seção 8. Um toque em Desfazer o traz de volta.',
    pickerTitle: 'Escolher fotos',
    pickerEmpty: 'Nenhuma foto neste relatório ainda.',
    pickerLabel: 'Fotos do relatório',
    // `72-pontos.html` "Imagem 13, cabos de entrada do Cubículo Enel, abrir", with the pick as its action.
    pickPhotoLabel: (label: string, caption: string | null) => `${label}${caption === null ? '' : `, ${caption}`}, referenciar`,
    // `72-pontos.html` "Imagem 31, remover referência", verbatim.
    unrefPhotoLabel: (label: string) => `${label}, remover referência`,
    removedPhoto: 'Foto removida',
    gone: 'Este ponto não está mais neste relatório.',
    notFound: 'Relatório não encontrado neste aparelho.',
    backToSumario: 'Voltar ao sumário',
  },
  ficha: {
    // authored: an address naming no equipment sheet of this relatório on this device.
    notFound: 'Ficha não encontrada neste relatório.',
    // `60-ficha.html` "Mais opções da ficha CB-ENT".
    headerMenu: (tag: string) => `Mais opções da ficha ${tag}`,
    // authored: the TAG button renames (the mock's prototype opens the relatório instead).
    tagLabel: (tag: string) => `TAG ${tag} — renomear`,
    // `60-ficha.html` sheet header: "Cabos de entrada — CB-ENT".
    titleSeparator: ' — ',
    // The Sticky action bar's primary, verbatim from `60-ficha.html` and EXPERIENCE.md.
    concluir: 'Concluir ficha',
    proximaFicha: 'Próxima ficha',
    proximaColuna: 'Próxima coluna',
    voltarRelatorio: 'Voltar ao relatório',
    // `60-ficha.html` header Overflow (only the items this story's surface works).
    menuConcluir: 'Concluir ficha',
    menuRenameTag: 'Renomear TAG',
    // authored: EXPERIENCE.md › Conclusion control, "Limpar" in the sheet Overflow menu (E5-Q17).
    menuLimparConclusao: 'Limpar conclusão',
    // authored: E5-Q17, the undo toast after "Limpar conclusão".
    conclusionCleared: 'Conclusão limpa',
    // `key-sheet-states.html` frame (a): the chip beside the TAG once not tested.
    notTestedChip: 'Não ensaiado',
    // `60-ficha.html` header Overflow's "Marcar não ensaiado" toast, verbatim.
    notTestedToast: 'Marcada como não ensaiada — entra na seção 8',
    // The band's sentence around the reason (`key-sheet-states.html` `.band-reason`), split
    // so the reason renders as its own span, verbatim otherwise.
    notTestedBandBefore: 'Não ensaiado — ',
    notTestedBandAfter: '. Os campos ficam somente leitura; a ficha imprime com os dados de placa e o motivo, e entra na seção 8 automaticamente.',
    // `key-sheet-states.html` frame (a) `.not-tested-band .btn-text`.
    desfazer: 'Desfazer',
    // authored: the Confirm dialog that gates "Desfazer" once the mark has reached the server.
    notTestedConfirmTitle: 'Desfazer "Marcar não ensaiado"?',
    notTestedConfirmDescription: 'A marca já foi sincronizada com o servidor. A ficha volta a pedir os campos normalmente.',
    notTestedConfirmAction: 'Desfazer',
    // The Section stepper (`60-ficha.html` `.section-stepper`).
    stepperLabel: 'Seções da ficha — toque para ir à seção',
    steps: {
      placa: { long: 'Placa', short: 'Placa' },
      verificacoes: { long: 'Verificações', short: 'Verif.' },
      ensaios: { long: 'Ensaios', short: 'Ensaios' },
      conclusao: { long: 'Conclusão', short: 'Concl.' },
    },
    // EXPERIENCE.md › Autosave: the visually hidden status.
    saved: 'Salvo',
    // authored: the toast after "Concluir ficha" at Progress = Completa.
    concluded: 'Ficha concluída',
    // `60-ficha.html` "Concluir ficha: faltam obrigatórios — vai para o primeiro campo faltando" (announced).
    incomplete: 'Faltam obrigatórios — indo para o primeiro campo faltando',
    // authored: the TAG rename toast.
    renamed: 'TAG renomeada',
    // The rail beside the sheet (`shell-head.html`): the Sumário's `rail` words are reused.
    cabine: {
      // `key-equipment-sheet-v09.html` `.cabine-line` (Story 12.3): the group's name and its action.
      lineLabel: 'Da cabine',
      editar: 'Editar',
      seTitle: 'Características da SE',
      envTitle: 'Ambiente de ensaio',
      daCabine: (name: string) => `Da cabine · ${name}`,
      // `60-ficha.html` CB-ENT, shown on the cabine's first sheet only.
      seNote: 'Impressas uma vez, na primeira ficha da cabine. Editar aqui altera a cabine — todas as fichas da cabine passam a mostrar o mesmo valor.',
      // authored: the altitude is confirmed once in the relatório setup (Etapa 5).
      altitudeHelper: 'Do setup do relatório',
      copyPrevious: 'Copiar da cabine anterior',
      // "Copiado de ⟨cabine⟩ — Desfazer" (Story 5.2 AC 3); "Desfazer" is the toast action.
      copiedFrom: (name: string) => `Copiado de ${name}`,
      // authored: the select's empty option.
      selectEmpty: 'Selecione',
      // authored: a number the field cannot read (kept typed, not committed).
      invalidNumber: 'Número não reconhecido',
      quickNotesTitle: 'Observações rápidas',
      // `60-ficha.html` `.chips-recent` "Chuva e umidade elevada".
      rainNote: 'Chuva e umidade elevada',
      // authored: the toast after a quick note lands in the sheet observation.
      noteAdded: 'Observação adicionada à ficha',
    },
    nameplate: {
      title: 'Dados de placa',
      // `key-equipment-sheet-v09.html` TAG field helper (Story 12.3): the block's TAG, prefilled.
      tagHelper: 'Do bloco · editável',
      // authored: the chip row's name.
      chipsLabel: 'Copiar dados de placa',
      // FR-34 chips (`60-ficha.html`, epics.md Story 5.3).
      igualA: (tag: string) => `Igual à ${tag}?`,
      lastVisit: (tag: string) => `Copiar da última visita (${tag})`,
      copiedFrom: (tag: string) => `Copiado de ${tag}`,
      invalidNumber: 'Número não reconhecido',
      selectEmpty: 'Selecione',
    },
    checklist: {
      title: 'Verificações gerais',
      // `key-sheet-states.html` frame (a) `.section-head .btn-reason`, verbatim.
      readOnlyReason: 'Somente leitura — equipamento não ensaiado',
      bulkLabel: 'Ações em lote da verificação',
      markRest: 'Marcar os restantes como Conforme',
      repeat: 'Repetir da ficha anterior do mesmo tipo',
      // EXPERIENCE.md › Bulk action bar: the reasons beside a disabled action.
      allMarked: 'Todos os itens já estão marcados',
      noConcluded: 'Nenhuma ficha deste tipo concluída',
      legend: 'Legenda',
      legendText: 'C Conforme · NC Não conforme · NA Não se aplica',
      // `60-ficha.html` NC row: the Observation field and its required reason.
      observationLabel: (n: number) => `Observação do item ${n}`,
      observationRequired: 'Obrigatória em item não conforme',
      // authored: the NC chip row's name.
      chipsLabel: (n: number) => `Observações sugeridas do item ${n}`,
      // The row Overflow (`60-ficha.html` "Opções do item 1: Limpar · Observação").
      clear: 'Limpar',
      observation: 'Observação',
      // authored: the toast after "Repetir da ficha anterior do mesmo tipo".
      repeated: (tag: string) => `Padrão de ${tag} repetido`,
      // authored: nothing to repeat (the pattern already matches).
      repeatNothing: 'O padrão já é o mesmo desta ficha',
    },
    // The "Ensaios" step (Stories 5.5-5.7): the Measurement tables and the Instrument picker,
    // verbatim from `60-ficha.html` where it draws them.
    ensaios: {
      // `.mt-criterion`: the criterion value alone after the word (EXPERIENCE.md › Measurement table).
      criterion: (text: string) => `Aceitável ${text}`,
      sourceSummary: 'Fonte do critério',
      // The Instrument picker.
      instrumentLabel: 'Instrumento',
      // authored: the closed picker before any pick.
      instrumentEmpty: 'Selecione o instrumento',
      instrumentDetails: 'Série, RBC e validade',
      // `key-equipment-sheet-v09.html` suggested instrument helper (Story 12.3), verbatim.
      instrumentSuggestedHelper: 'Último usado neste relatório · confirmado ao concluir a ficha, ou toque para trocar',
      instrumentList: 'Instrumentos cadastrados',
      // EXPERIENCE.md › State patterns, Empty: Instrument picker.
      noInstruments: 'Nenhum instrumento cadastrado',
      registerInstrument: 'Cadastrar instrumento',
      // authored: a Measurement cell's accessible name, row + column ("Fase A, 1 minuto").
      cellLabel: (row: string, column: string) => `${row}, ${column}`,
      // authored: the TTR card's field label ("H1-H2 / X1-X2 (medido)", `60-ficha.html`).
      cardMeasured: (column: string) => `${column} (medido)`,
      // `60-ficha.html` TTR card: "Condição: Satisfatório".
      cardCondition: (text: string) => `Condição: ${text}`,
      // authored: the toast after "Marcar Com restrições".
      restrictionMarked: 'Com restrições marcado na conclusão',
    },
    // The "Conclusão" step (Story 5.8): the Conclusion control, its suggestion row, the
    // sheet Observation field and the Generated text field.
    conclusao: {
      title: 'Conclusão',
      resultGroup: 'Resultado',
      restrictionGroup: 'Restrições',
      aprovado: 'Aprovado',
      reprovado: 'Reprovado',
      semRestricoes: 'Sem restrições',
      comRestricoes: 'Com restrições',
      // authored: the suggestion row's field label.
      suggestionLabel: 'Sugestão',
      observationTitle: 'Observações',
      // `60-ficha.html` "Observações da ficha".
      observationLabel: 'Observações da ficha',
      // EXPERIENCE.md › Observation field.
      observationRequired: 'Obrigatória com restrições',
      // `key-equipment-sheet-v09.html` suggested sheet observation helper (Story 12.4), verbatim.
      observationSuggestedHelper: 'Montada dos itens NC · confirmada com o texto da conclusão',
      textLabel: 'Texto da conclusão',
      // `60-ficha.html` helper under the suggested text.
      textHelper: 'Montado no aparelho com os valores desta ficha e os critérios acima — funciona sem sinal. Impresso na linha Conclusão da seção 9 depois de confirmar.',
      textConfirmed: 'Confirmado · impresso na linha Conclusão da ficha (seção 9)',
    },
  },
  // Relatório setup (`50-relatorio-setup.html`, Story 4.2): the five Etapa bands plus the
  // "Conclusão e parecer" placeholder, per epics.md's AC band list (not the mock's own
  // six-band structure -- see the spec's Design Notes). Field-level copy is verbatim from
  // the mock where it draws the same field; the rest is `// authored:`.
  setup: {
    heading: 'Dados do relatório',
    notFound: 'Relatório não encontrado.',
    // Etapa 1 — Capa.
    etapa1Title: 'Etapa 1 — Capa',
    // authored: this batch's own band note, since the mock's Etapa 1 covers a superset.
    etapa1Note: 'Capa do relatório',
    clientLabel: 'Cliente',
    obraLabel: 'Local (obra)',
    startLabel: 'Início da execução',
    endLabel: 'Fim da execução',
    // authored: the echo line under "Fim da execução" (`50-relatorio-setup.html`'s own
    // wording is a fixed pt-BR date list; this batch's dates are the kernel's `dateRangeText`).
    datesEcho: (text: string) => `Na capa: ${text}`,
    additionalInfoLabel: 'Informações adicionais',
    coverPhotoLabel: 'Foto de capa',
    // Etapa 2 — Objetivo e escopo.
    etapa2Title: 'Etapa 2 — Objetivo e escopo',
    etapa2Note: 'Seções 1 e 3',
    empresaExecutoraLabel: 'Empresa executora',
    localLabel: 'Local',
    exclusionsLabel: 'Exclusões',
    addExclusion: 'Adicionar exclusão',
    // authored: the accessible name of one exclusion's typed field.
    exclusionFieldLabel: (n: number) => `Exclusão ${n}`,
    // Verbatim from `50-relatorio-setup.html`: one exclusion's `.overflow-trigger`.
    exclusionMenuLabel: (n: number) => `Mais opções da exclusão ${n}`,
    // authored: the mock marks the exclusion menu "não prototipado"; its one item.
    removeExclusion: 'Remover',
    // authored: the toast after "Remover", with "Desfazer".
    exclusionRemoved: (n: number) => `Exclusão ${n} removida`,
    undo: 'Desfazer',
    // Etapa 3 — Responsável.
    etapa3Title: 'Etapa 3 — Responsável',
    etapa3Note: 'Seção 10',
    responsibleLabel: 'Responsável técnico',
    councilLabel: 'Conselho',
    // authored: the ART/TRT field's fallback label before the responsible's council is known.
    artTrtFallbackLabel: 'Número ART/TRT',
    // authored: the registration-number field's fallback label before the council is known.
    registrationNumberFallbackLabel: 'Número de registro',
    // authored: the council is read-only here (it lives on the responsible's own account
    // profile, epics.md Story 4.2's 2026-09-24 narrowing), so this helper names where it
    // comes from and what it signs, in place of an editable Conselho segmented control.
    councilHelper: (title: string) => `Assina a seção 10 como ${title} · conselho e número vêm do perfil`,
    // Etapa 4 — Instrumentos e certificados.
    etapa4Title: 'Etapa 4 — Instrumentos e certificados',
    etapa4Note: 'Seção 11',
    // authored: the note above the instrument checklist.
    instrumentsNote: 'Marque os instrumentos desta obra: o certificado de cada um entra na seção 11.',
    // authored: the inline note beside an instrument a sheet still references.
    instrumentReferenced: 'Continua na seção 11 porque uma ficha usa este instrumento',
    // authored (Story 12.2): the note in place of the list while the registry is empty,
    // the same sentence the sheet's instrument picker says.
    noInstruments: 'Nenhum instrumento cadastrado',
    // Verbatim from `50-relatorio-setup.html` Etapa 4's row.
    registerInstrument: 'Cadastrar instrumento',
    registerInstrumentReason: 'Abre Cadastros › Instrumentos',
    // authored: the accessible name of the "m" unit suffix beside the altitude value.
    altitudeUnit: 'metros',
    // Etapa 5 — Local.
    etapa5Title: 'Etapa 5 — Local',
    etapa5Note: 'Ambiente de ensaio',
    altitudeLabel: 'Altitude do site',
    // Verbatim from `50-relatorio-setup.html`'s `.suggested-pill`.
    altitudeSuggestedPill: 'Sugerido',
    altitudeConfirm: 'Confirmar',
    // authored: the echo line once the altitude is confirmed.
    altitudeConfirmed: (text: string) => `Altitude do site: ${text} — confirmada`,
    // authored: the confirmed line's way back to the field (Epic 4 QA Q8), the value kept.
    altitudeChange: 'Alterar',
    // authored: its accessible name, naming what it changes.
    altitudeChangeLabel: 'Alterar altitude do site',
    nextInterventionDateLabel: 'Próxima intervenção recomendada',
    nextInterventionJustificationLabel: 'Justificativa',
    // "Conclusão e parecer" placeholder band.
    parecerTitle: 'Conclusão e parecer',
    // authored: the band is Epic 7's; the note says it comes later without naming an epic (Q10).
    parecerNote: 'Disponível em uma próxima etapa',
    // Sticky action bar.
    complete: 'Concluir dados do relatório',
    // authored: once the relatório has left Rascunho, the sticky bar has nothing left to do;
    // also the toast on the Sumário after "Concluir dados do relatório" (Story 12.2).
    completeDone: 'Dados salvos',
  },
  // The section text editor (`45-secao.html`, Story 4.7): plain text with variable chips,
  // autosaving to the block's own `config.section_text`.
  sectionText: {
    title: 'Seção',
    backToSumario: 'Voltar para o sumário',
    voltarAoSumario: 'Voltar ao sumário',
    // authored (Story 12.2): the sticky bar's way on to the next section text.
    proximaSecao: 'Próxima seção',
    notFound: 'Seção não encontrada.',
    fieldLabel: 'Texto da seção',
    insertVariable: 'Inserir dado do relatório',
    restore: 'Restaurar texto do template',
    // authored: the reason beside "Restaurar texto do template" once the section already
    // shows the seed's own text (nothing to restore).
    nothingToRestore: 'Restaurar texto do template: já é o texto do template',
    restored: 'Texto do template restaurado nesta seção',
    undo: 'Desfazer',
    // authored: the meta line, split so the middle clause renders in <strong> (verbatim `45-secao.html`).
    metaLead: (templateName: string | null) => `Texto do template${templateName === null ? '' : ` ${templateName}`}. `,
    metaStrong: 'O que você mudar aqui fica só neste relatório',
    metaTail: '; o template e os próximos relatórios não mudam.',
    autosaveNote: 'Salvo automaticamente. Texto simples; negrito e listas ficam para depois.',
  },
  // authored: the mocks are static frames and draw no boot state.
  common: {
    back: 'Voltar',
    loading: 'Carregando…',
  },
  // Registries (`80-cadastros.html`, `key-registries.html`). Empresa and Instrumentos are
  // the real tabs; the other four are placeholders (Stories 2.4-2.6), whose one shared
  // sentence lives in `ui.ts` (component chrome, reused verbatim by each).
  registries: {
    title: 'Cadastros',
    tabsLabel: 'Cadastros',
    tabEmpresa: 'Empresa',
    tabClientes: 'Clientes',
    tabInstrumentos: 'Instrumentos',
    tabFabricantes: 'Fabricantes',
    tabClassesTensao: 'Classes de tensão',
    tabCriterios: 'Critérios de aceitação',
    // authored: Story 2.4 AC1's literal "14 digits when present" length check (Boundaries),
    // no mock draws the error state. Shared by Clientes and, since Epic 2 retro D-8, Empresa.
    cnpjInvalid: 'CNPJ inválido — informe 14 dígitos',
    // Empresa (`key-registries.html` frame 0, `80-cadastros.html` Empresa panel): the
    // company's document identity, the only surface where the brand is edited.
    empresa: {
      note: 'Identidade do documento gerado: capa, cabeçalho, rodapé e a linha "Contratada" do controle do documento. Só aqui a marca é editada — o app continua PRODUTO.',
      // authored: the mock's "Salvar" button is dropped (every field autosaves), so the
      // sentence that used to sit beside it carries the rule on its own.
      autosaveNote: 'Salvo automaticamente. Vale para os relatórios gerados daqui em diante; revisões já emitidas não mudam.',
      groupIdentity: 'Empresa',
      groupBrand: 'Marca no documento',
      groupForm: 'Formulário',
      nameLabel: 'Razão social',
      nameHelper: 'Cabeçalho, capa e "Contratada" no controle do documento',
      cnpjLabel: 'CNPJ',
      phoneLabel: 'Telefone',
      emailLabel: 'E-mail',
      addressLabel: 'Endereço',
      addressHelper: 'Rodapé de todas as páginas, com o telefone e o e-mail',
      imagesLabel: 'Imagens do documento',
      logoLabel: 'Logo',
      logoHelper: 'PNG ou SVG · capa e cabeçalho',
      logoPlaceholder: 'Logo',
      coverLabel: 'Fundo de capa',
      coverHelper: 'Opcional · JPG ou PNG · atrás da capa',
      coverPlaceholder: 'Fundo',
      imagesHelper: 'A foto de capa de cada relatório vem de Dados do relatório; o fundo é o mesmo em todos.',
      formTitleLabel: 'Título do formulário',
      formTitleHelper: 'Impresso no cabeçalho de toda página e no controle do documento.',
      formCodeLabel: 'Código do formulário',
      formRevisionLabel: 'Revisão do formulário',
      formRevisionHelper: 'Vai no rodapé. A revisão do documento (Rev. n) é a da exportação e sai no controle do documento.',
      previewTitle: 'Pré-visualização do documento',
      previewMeta: 'Miniatura com os valores atuais · o PDF e o DOCX usam os mesmos dados',
      // authored: the three pages AC 2.3-2 names; the mock draws two.
      previewCover: 'Capa',
      previewHeader: 'Cabeçalho',
      previewFooter: 'Rodapé',
      previewNote: 'Sem logo, a capa e o cabeçalho mostram só a razão social.',
      // authored: the preview's own sample lines, so the miniature reads as a page.
      previewSampleTitle: 'Relatório de manutenção preventiva — cabine primária',
      previewPageNumber: 'Página X de Y',
    },
    instrumentos: {
      newInstrument: 'Novo instrumento',
      // authored: the mock's empty state for a fresh registry is not drawn; the label
      // doubles as the empty-state action per Story 2.1's AC.
      empty: 'Cadastrar instrumento',
      // authored: the sentence above the empty state's one action (Epic 2 retro D-8).
      emptyText: 'Nenhum instrumento cadastrado.',
      note: 'Ordenados por validade da calibração — vencidos primeiro. Selecionar por código na ficha preenche série, RBC e tensão de ensaio.',
      close: 'Fechar edição',
      // authored: AC2 drops the mock's "Salvar" button (every field autosaves); the
      // panel needs a close action in its place.
      panelClose: 'Fechar',
      codeLabel: 'Código',
      manufacturerLabel: 'Fabricante',
      nameLabel: 'Nome',
      modelLabel: 'Tipo / modelo',
      serialLabel: 'Nº de série',
      certNumberLabel: 'Certificado RBC nº',
      // authored: `rbc_accredited` is a schema field the mock does not draw a control
      // for; placed beside "Certificado RBC nº" since both describe the RBC certificate.
      rbcAccreditedLabel: 'Acreditado pela RBC',
      calibratedAtLabel: 'Data de calibração',
      // authored: the interval that feeds Validade is a schema field the mock's single
      // frame does not draw a control for (it only shows the computed result).
      calibrationIntervalLabel: 'Intervalo de calibração (meses)',
      // authored: worded to never repeat "Data de calibração" as a substring — the
      // helper sits inside this field's own <label>, which would otherwise fold that
      // text into its accessible name and collide with the other field's.
      calibrationIntervalHelper: 'Some-se à calibração para calcular a validade',
      validityLabel: 'Validade',
      validityHelper: 'Vencida = linha âmbar na ficha; nunca bloqueia',
      laboratoryLabel: 'Emissor do certificado',
      certificateLabel: 'Arquivo do certificado',
      // `key-registries.html` L154-172: the formats the tile takes. The file itself is
      // named by the kernel's tile line, not here.
      certificateHelper: 'PDF, JPG ou PNG · até 25 MB · enviado sozinho na próxima sincronização',
      // authored: one label per test type, reused for the three independent defaults
      // (AR-18 extends the mock's single "Isolação" row to the other two test types).
      testDefaultLabel: (testName: string) => `Padrão de ensaio — ${testName}`,
      testDefaultHelper: 'Preenche a ficha ao escolher o instrumento; o aceitável vem do critério, não daqui',
      testIsolacao: 'Isolação',
      testResistenciaContato: 'Resistência de contato',
      testRelacaoTransformacao: 'Relação de transformação',
      valueLabel: 'Valor',
      unitLabel: 'Unidade',
      archive: 'Arquivar',
      remove: 'Remover',
      // authored: no mock draws the referenced-instrument reason with real numbers (no
      // block exists before Epic 5); this states the true rule without inventing a count.
      archiveOnlyReason: (code: string) =>
        `Remover indisponível: ${code} está referenciado em fichas. Arquivar tira o ${code} das listas e mantém as fichas.`,
      archived: (code: string) => `${code} arquivado`,
      removeConfirmTitle: (code: string) => `Remover ${code}?`,
      removeConfirmBody: 'O instrumento sai do cadastro; nada o referencia hoje.',
      // authored: no mock draws the certificate file failing to open; offline on a device
      // that never held the file is the realistic case (AC 2.2-3, Epic 2 retro D-3).
      certificateUnavailable: 'Não foi possível abrir o certificado. Conecte-se e tente de novo.',
      removed: (code: string) => `${code} removido`,
      undo: 'Desfazer',
      cancel: 'Cancelar',
    },
    // Clientes (`80-cadastros.html` L191-216, Story 2.4).
    clientes: {
      newClient: 'Novo cliente',
      // authored: the mock's empty state for a fresh registry is not drawn; the label
      // doubles as the empty-state action per the Instrumentos tab's own convention.
      empty: 'Cadastrar cliente',
      // authored: the sentence above the empty state's one action (Epic 2 retro D-8).
      emptyText: 'Nenhum cliente cadastrado.',
      note: 'Cliente e obras alimentam a capa do relatório; o CNPJ (opcional) sai na linha "Contratante" do controle do documento. Um cliente com relatórios não pode ser excluído — só arquivado.',
      close: 'Fechar edição',
      panelClose: 'Fechar',
      nameLabel: 'Nome',
      cnpjLabel: 'CNPJ',
      contactNameLabel: 'Contato',
      contactPhoneLabel: 'Telefone do contato',
      sitesLabel: 'Obras',
      addSite: 'Adicionar obra',
      removeSite: (index: number) => `Remover obra ${index}`,
      archive: 'Arquivar',
      remove: 'Remover',
      archiveOnlyReason: (name: string) =>
        `Remover indisponível: ${name} está referenciado em projetos. Arquivar tira o cliente das listas e mantém os projetos.`,
      archived: (name: string) => `${name} arquivado`,
      removeConfirmTitle: (name: string) => `Remover ${name}?`,
      removeConfirmBody: 'O cliente sai do cadastro; nada o referencia hoje.',
      removed: (name: string) => `${name} removido`,
      undo: 'Desfazer',
      cancel: 'Cancelar',
    },
    // Fabricantes (`80-cadastros.html` L355-393, Story 2.5).
    fabricantes: {
      newRow: 'Novo fabricante',
      empty: 'Cadastrar fabricante',
      // authored: the sentence above the empty state's one action (Epic 2 retro D-8).
      emptyText: 'Nenhum fabricante cadastrado.',
      note: 'Fabricantes alimentam a legenda das placas de equipamento e o campo de fabricante do instrumento. Crie um novo a qualquer momento, mesmo offline.',
      panel: {
        newRow: 'Novo fabricante',
        close: 'Fechar edição',
        panelClose: 'Fechar',
        nameLabel: 'Nome',
        genderLabel: 'Gênero gramatical',
        genderMasculine: 'Masculino',
        genderFeminine: 'Feminino',
        genderUnset: 'Não definido',
        numberLabel: 'Número gramatical',
        numberSingular: 'Singular',
        numberPlural: 'Plural',
        numberUnset: 'Não definido',
        remove: 'Remover',
        removeConfirmTitle: (name: string) => `Remover ${name}?`,
        removeConfirmBody: 'O fabricante sai do cadastro; ele não é referenciado por id em nenhuma ficha.',
        removed: (name: string) => `${name} removido`,
        undo: 'Desfazer',
        cancel: 'Cancelar',
      },
    },
    // Classes de tensão (`80-cadastros.html` L396-411, Story 2.5).
    classesTensao: {
      newRow: 'Nova classe',
      empty: 'Cadastrar classe de tensão',
      // authored: the sentence above the empty state's one action (Epic 2 retro D-8).
      emptyText: 'Nenhuma classe de tensão cadastrada.',
      note: 'Classes de tensão alimentam a legenda das placas de equipamento. Crie uma nova a qualquer momento, mesmo offline.',
      panel: {
        newRow: 'Nova classe',
        close: 'Fechar edição',
        panelClose: 'Fechar',
        // authored: Story 2.5 AC1 "value in kV"; the unit and its spoken name follow the
        // mock's `.measurement-field` (`80-cadastros.html` L337).
        valueLabel: 'Valor em kV',
        valueUnit: 'kV',
        valueUnitName: 'quilovolts',
        // authored: no mock draws the refused value (Epic 2 retro D-6).
        valueInvalid: 'Informe só o número, por exemplo 15 ou 17,5',
        remove: 'Remover',
        removeConfirmTitle: (name: string) => `Remover ${name}?`,
        removeConfirmBody: 'A classe de tensão sai do cadastro; ela não é referenciada por id em nenhuma ficha.',
        removed: (name: string) => `${name} removido`,
        undo: 'Desfazer',
        cancel: 'Cancelar',
      },
    },
    // Critérios de aceitação (`80-cadastros.html` L415-455, Story 2.6): read-only, sourced from SEEDED_CRITERIA.
    criterios: {
      note: 'Somente leitura nesta versão. Os critérios vêm das fichas FO.SERV-03.',
      columnSubBlock: 'Sub-bloco de ensaio',
      columnCriterion: 'Critério',
      columnSource: 'Fonte',
      columnUsedBy: 'Aplica-se a',
    },
  },
} as const;
