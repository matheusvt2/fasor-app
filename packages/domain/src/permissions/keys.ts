import { z } from 'zod';

/*
 * AD-29 (Story 26.2): the twelve permission keys of the kernel and the module each one belongs to.
 * A key is a fixed word; a module is the group of keys the Admin sees as one line of the grid.
 * The list is closed and its order is the grid's (the epic's module table, `epics.md` Epic 26).
 * The module names are the epic's table verbatim; the key labels are derived text of the kernel.
 * 2026-11-22, Story 26.10: the grid's words (`mockups/prototype/screens/93-papeis.html`, approved
 * 2026-11-21): the module of `template.edit` reads "Templates" (MOCK-GUIDE § 2026-11-21, answer 2),
 * the key labels are the frame's cell names, and each module carries the frame's line of what it opens.
 */

export const PERMISSION_KEYS = [
  'relatorio.view',
  'relatorio.create',
  'relatorio.delete',
  'relatorio.fill',
  'relatorio.issue',
  'export.download',
  'template.edit',
  'equipment_type.edit',
  'registry.edit',
  'suggestion.review',
  'users.manage',
  'roles.manage',
] as const;

export const permissionKeySchema = z.enum(PERMISSION_KEYS);
export type PermissionKey = z.infer<typeof permissionKeySchema>;

export const PERMISSION_MODULES = ['relatorios', 'preenchimento', 'emissao', 'modelos', 'tipos_de_equipamento', 'cadastros', 'usuarios_e_papeis'] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

/** The module of each key (the epic's module table). */
const MODULE_OF: Readonly<Record<PermissionKey, PermissionModule>> = {
  'relatorio.view': 'relatorios',
  'relatorio.create': 'relatorios',
  'relatorio.delete': 'relatorios',
  'relatorio.fill': 'preenchimento',
  'relatorio.issue': 'emissao',
  'export.download': 'emissao',
  'template.edit': 'modelos',
  'equipment_type.edit': 'tipos_de_equipamento',
  'registry.edit': 'cadastros',
  'suggestion.review': 'cadastros',
  'users.manage': 'usuarios_e_papeis',
  'roles.manage': 'usuarios_e_papeis',
};

/** The module names as the grid shows them (the epic's module table, verbatim, but for "Templates"). */
const MODULE_NAMES: Readonly<Record<PermissionModule, string>> = {
  relatorios: 'Relatórios',
  preenchimento: 'Preenchimento em campo',
  emissao: 'Emissão',
  // frame 93-papeis.html (MOCK-GUIDE § 2026-11-21, answer 2: the word of its screen and shortcut, not the epic's "Modelos")
  modelos: 'Templates',
  tipos_de_equipamento: 'Tipos de equipamento',
  cadastros: 'Cadastros',
  usuarios_e_papeis: 'Usuários e papéis',
};

/** The pt-BR label of each key, one line of the grid (Story 26.10: the frame's cell names). */
const KEY_LABELS: Readonly<Record<PermissionKey, string>> = {
  // frame 93-papeis.html
  'relatorio.view': 'Ver relatórios',
  // frame 93-papeis.html
  'relatorio.create': 'Criar relatório',
  // frame 93-papeis.html
  'relatorio.delete': 'Remover relatório',
  // frame 93-papeis.html
  'relatorio.fill': 'Preencher fichas, fotos e pontos',
  // frame 93-papeis.html
  'relatorio.issue': 'Gerar e emitir relatório',
  // frame 93-papeis.html
  'export.download': 'Baixar DOCX e PDF emitidos',
  // frame 93-papeis.html
  'template.edit': 'Editar templates',
  // frame 93-papeis.html
  'equipment_type.edit': 'Editar tipos de equipamento',
  // frame 93-papeis.html
  'registry.edit': 'Editar cadastros',
  // frame 93-papeis.html
  'suggestion.review': 'Aceitar sugestões de cadastro',
  // frame 93-papeis.html
  'users.manage': 'Gerenciar usuários',
  // frame 93-papeis.html
  'roles.manage': 'Gerenciar papéis e permissões',
};

/** Story 26.10: the grid's line under each module name, what the module opens (frame 93-papeis.html `.pp-mod-meta`, verbatim). */
const MODULE_HELP: Readonly<Record<PermissionModule, string>> = {
  relatorios: 'Início, projeto e sumário; criar e remover relatórios',
  preenchimento: 'Fichas, fotos, pontos, textos das seções e verificações do local',
  emissao: 'Gerar relatório, pré-visualizar, Conferência por IA, Emitido; baixar DOCX e PDF',
  modelos: 'A lista de templates e o compositor',
  tipos_de_equipamento: 'O editor de tipos e a base de ensaios',
  cadastros: 'As abas de Cadastros; aceitar sugestões',
  usuarios_e_papeis: 'A tela Usuários; esta grade e os papéis criados',
};

/**
 * Story 26.10: the keys that make a role's users able to manage users and roles (rule 4 of the
 * story: the screen says so before saving), each with the frame's `.pp-key-help` line.
 */
export const MANAGEMENT_KEYS: readonly PermissionKey[] = ['users.manage', 'roles.manage'];

// frame 93-papeis.html `.pp-key-help`
const MANAGEMENT_KEY_HELP = 'Quem tem esta permissão pode mudar usuários e papéis, inclusive os próprios.';

export function permissionModuleOf(key: PermissionKey): PermissionModule {
  return MODULE_OF[key];
}

export function permissionModuleName(module: PermissionModule): string {
  return MODULE_NAMES[module];
}

export function permissionKeyLabel(key: PermissionKey): string {
  return KEY_LABELS[key];
}

/** The keys of one module, in the catalog's order. */
export function permissionKeysOf(module: PermissionModule): readonly PermissionKey[] {
  return PERMISSION_KEYS.filter((key) => MODULE_OF[key] === module);
}

/** Story 26.10: the grid's line of what a module opens. */
export function permissionModuleHelp(module: PermissionModule): string {
  return MODULE_HELP[module];
}

/** Story 26.10: the grid's line under a key, or null (only the two management keys carry one). */
export function permissionKeyHelp(key: PermissionKey): string | null {
  return MANAGEMENT_KEYS.includes(key) ? MANAGEMENT_KEY_HELP : null;
}
