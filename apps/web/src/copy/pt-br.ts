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
    // later epic (Sumário, relatório creation), so the screen
    // never argues with itself about what is missing.
    notAvailableYet: 'Disponível em uma próxima etapa',
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
  // Templates (`41-templates.html`, Story 3.2). The heading's count is the kernel's
  // (`templatesHeading`); the list's rows, actions and archived group are Story 3.3's.
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
