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
    // later epic (Sumário, Templates, Cadastros, relatório creation), so the screen
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
    // authored: the recovery action is the persistent toast of `key-sheet-states.html`;
    // this candidate exists only so the "+N" chip counts the condition when something of
    // higher priority already holds the slot, so it carries no action of its own.
    draftFoundText: 'Há um rascunho para recuperar neste aparelho.',
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
  // authored: the mocks are static frames and draw no boot state.
  common: {
    back: 'Voltar',
    loading: 'Carregando…',
  },
} as const;
