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
    sessionHeading: 'Sessão',
    signOut: 'Sair',
    // The mock's note is "31 fotos e 3 fichas aguardando envio. Sair antes do envio pede
    // confirmação; nada é apagado deste aparelho." Only the second sentence is kept: the
    // counts need the sync state of Story 1.5.
    signOutNote: 'Sair antes do envio pede confirmação; nada é apagado deste aparelho.',
    // authored: the mock's Confirm dialog is the pending-sync variant ("Sair com envios
    // pendentes?" / "31 fotos e 3 fichas ainda não foram enviadas"), which would be false
    // until Story 1.5 counts them. Its action labels are the mock's.
    signOutDialogTitle: 'Sair desta conta?',
    signOutDialogBody:
      'Nada é apagado deste aparelho. O que estiver aqui continua aqui e sobe quando você entrar de novo com conexão.',
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
  // authored: the mocks are static frames and draw no boot state.
  common: {
    back: 'Voltar',
    loading: 'Carregando…',
  },
} as const;
