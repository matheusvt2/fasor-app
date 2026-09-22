/**
 * Every pt-BR string of Login and Account, in one module (UX-DR75).
 *
 * Most are verbatim from `mockups/prototype/screens/10-login.html`, `key-login.html` and
 * `90-account.html`. The rest cover states the mocks do not draw — a save in flight, a
 * failed request, the placeholder Home, the re-auth banner — and each of those carries an
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
    // and no offline or failure state for one.
    saveOfflineReason: 'Salvar precisa de conexão',
    saveFailed: 'Não foi possível salvar. Tente de novo.',
    registrationIncomplete: 'Informe o número do registro e o título impresso.',
    // authored: the mock groups the pending-upload row under its storage section, which
    // Story 1.6 builds; until then the row has a heading of its own.
    syncHeading: 'Sincronização',
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
    // The mock's plural sentence; the singular is authored for "1 ficha".
    signOutPendingDialogBody: (pending: string, count: number) =>
      count === 1
        ? `${pending} ainda não foi enviada. Ela continua neste aparelho e sobe quando você entrar de novo com conexão.`
        : `${pending} ainda não foram enviadas. Elas continuam neste aparelho e sobem quando você entrar de novo com conexão.`,
    signOutConfirm: 'Sair mesmo assim',
    // authored: the mock has no offline or failure state for "Sair".
    signOutOfflineReason: 'Sair precisa de conexão',
    signOutFailed: 'Não foi possível sair. Tente de novo.',
  },
  // authored: Home is a placeholder until Story 1.6 builds the status board from
  // `key-home.html`, so none of this comes from a mock.
  home: {
    title: 'Início',
    accountLink: 'Conta',
    placeholder: 'Seus relatórios aparecem aqui.',
  },
  // authored: `source-deltas.md` gave the re-auth banner the slot the removed install
  // banner had, so no mock draws it yet.
  banner: {
    reAuthText: 'Sua sessão expirou. Nada foi apagado deste aparelho.',
    reAuthAction: 'Entrar de novo',
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
    // authored: the dead-op row lives here until the Sumário pre-issue list of Epic 5.
    rejected: (count: number) => (count === 1 ? '1 alteração rejeitada' : `${count} alterações rejeitadas`),
    resend: 'Reenviar',
    // authored: the mock has no line for the server's `superseded` signal.
    superseded: (count: number) =>
      count === 1 ? '1 alteração mesclada pelo servidor' : `${count} alterações mescladas pelo servidor`,
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
  // authored: the mocks are static frames and draw no boot state.
  common: {
    back: 'Voltar',
    loading: 'Carregando…',
  },
} as const;
