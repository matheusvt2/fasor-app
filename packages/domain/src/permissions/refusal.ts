import type { PermissionKey } from './keys.ts';

/*
 * AD-29 (Story 26.5): the words the app says when a role refuses a control or a screen
 * (`MOCK-GUIDE.md` § 2026-11-21, the three rules; EXPERIENCE.md § State Patterns, "A module the
 * role lacks", "A control the role lacks", "A relatório the role cannot fill"). Derived text of the
 * kernel: `apps/web` never writes a refusal sentence of its own. A total record over the keys, so a
 * key added to `PERMISSION_KEYS` fails `pnpm static` here until its sentence is written.
 */

const REFUSALS: Readonly<Record<PermissionKey, string>> = {
  // authored (Story 26.5)
  'relatorio.view': 'Seu papel não permite ver relatórios.',
  // frame 21-home-campo.html
  'relatorio.create': 'Seu papel não permite criar relatórios.',
  // authored (Story 26.5)
  'relatorio.delete': 'Seu papel não permite remover relatórios.',
  // frame 62-ficha-consulta.html
  'relatorio.fill': 'Seu papel não permite preencher fichas, fotos e pontos.',
  // frame 44-sumario-sem-emissao.html: the Sumário's one line under "Pré-visualizar" and "Gerar relatório"
  'relatorio.issue': 'Seu papel não permite pré-visualizar nem gerar o relatório.',
  // authored (Story 26.5)
  'export.download': 'Seu papel não permite baixar os arquivos emitidos.',
  // authored (Story 26.5); the module is "Templates" on screen (MOCK-GUIDE § 2026-11-21, question 2)
  'template.edit': 'Seu papel não permite editar templates.',
  // authored (Story 26.5)
  'equipment_type.edit': 'Seu papel não permite editar tipos de equipamento.',
  // authored (Story 26.5)
  'registry.edit': 'Seu papel não permite editar cadastros.',
  // authored (Story 26.5)
  'suggestion.review': 'Seu papel não permite aceitar sugestões.',
  // authored (Story 26.5)
  'users.manage': 'Seu papel não permite gerenciar usuários.',
  // authored (Story 26.5)
  'roles.manage': 'Seu papel não permite gerenciar papéis e permissões.',
};

/** The one line of reason beside a control the role refuses ("Seu papel não permite …"). */
export function permissionRefusalText(key: PermissionKey): string {
  return REFUSALS[key];
}

/** The Toast of a direct address of a screen the role does not hold (rule 3, `21-home-campo.html`). */
export const SCREEN_UNAVAILABLE_TEXT = 'Essa tela não está disponível para o seu papel.';

/** The lead of the read-only Banner (`62-ficha-consulta.html`, its `<strong>`). */
export const READ_ONLY_LEAD_TEXT = 'Somente leitura.';

/** The read-only Banner of a screen the role cannot fill, lead and reason (`62-ficha-consulta.html`). */
export const READ_ONLY_BANNER_TEXT = `${READ_ONLY_LEAD_TEXT} ${REFUSALS['relatorio.fill']}`;

/**
 * Story 26.10 (authored): the line a screen shows, instead of an empty one, while the device is offline and
 * does not hold the user's own role yet (a first sign-in cut off before its company pull). Fails closed as
 * the provider does; the access comes when the device reaches the server.
 */
export const ROLE_UNKNOWN_TEXT = 'Seu acesso será carregado quando houver conexão.';
