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
    // authored: one reason shared by every affordance whose destination belongs to a
    // later epic ("Continuar" opens the last sheet, Epic 5), so the screen never argues
    // with itself about what is missing.
    notAvailableYet: 'Disponível em uma próxima etapa',
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
    // authored: the draft preview is Story 4.8's.
    previewReason: 'Pré-visualizar: disponível na pré-visualização do documento',
    generate: 'Gerar relatório',
    // authored: the generate wiring is Story 4.8's (batch D).
    generateStub: 'Gerar relatório: disponível na próxima etapa',
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
      rename: 'Renomear',
      moveUp: 'Subir',
      moveDown: 'Descer',
      // The equipment row Overflow (DESIGN.md › Overflow menu order); "Renomear TAG" is authored.
      addBelow: 'Adicionar abaixo',
      duplicate: 'Duplicar',
      renameTag: 'Renomear TAG',
      remove: 'Remover',
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
      // authored: tracked stub, owner Epic 5 Story 5.1 (the sheet surface).
      openStub: 'Abrir a ficha: disponível na próxima etapa',
      // authored: the sheet or the location the action names changed on another device.
      gone: 'A ficha mudou em outro aparelho; nada foi alterado.',
      locationGone: 'O local mudou em outro aparelho; nada foi alterado.',
    },
    // The TAG and name dialogs of the tree (authored: no mock draws them; EXPERIENCE.md ›
    // Equipment identity and Form dialog).
    tagDialogs: {
      duplicateTitle: (tag: string) => `Duplicar ${tag}`,
      duplicate: 'Duplicar',
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
      close: 'Fechar',
      where: (path: string) => `Em: ${path}`,
      // authored from the mock's "Ou escolha o tipo · …": the camera tile above it is out of the slice.
      chooseType: 'Escolha o tipo · TAG sugerida por tipo + coluna',
      officeNote: 'Seções de texto e sub-blocos (ensaios, placa, itens) são do escritório: Compositor de template e paleta aberta de dentro da ficha no desktop.',
      // The office confirm (EXPERIENCE.md › Block palette, office variant: TAG and location, prefilled).
      tagLabel: 'TAG',
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
  // Story 4.2's page, a tracked stub here (batch C replaces the file and keeps the route).
  setupStub: {
    title: 'Dados do relatório',
    // authored: the stub's one sentence.
    note: (etapa: number) => `Etapa ${etapa} — disponível na próxima etapa deste épico`,
    backToSumario: 'Voltar para o sumário',
  },
  // Story 4.7's editor is batch C; this batch shows the resolved text read-only.
  sectionText: {
    title: 'Seção',
    backToSumario: 'Voltar para o sumário',
    // authored: no text is in force for this section (8 and 11 carry none).
    noText: 'Esta seção não tem texto fixo; o conteúdo vem do relatório.',
    notFound: 'Seção não encontrada.',
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
