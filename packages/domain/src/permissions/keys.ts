import { z } from 'zod';

/*
 * AD-29 (Story 26.2): the twelve permission keys of the kernel and the module each one belongs to.
 * A key is a fixed word; a module is the group of keys the Admin sees as one line of the grid.
 * The list is closed and its order is the grid's (the epic's module table, `epics.md` Epic 26).
 * The module names are the epic's table verbatim; the key labels are derived text of the kernel.
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

/** The module names as the grid shows them (the epic's module table, verbatim). */
const MODULE_NAMES: Readonly<Record<PermissionModule, string>> = {
  relatorios: 'Relatórios',
  preenchimento: 'Preenchimento em campo',
  emissao: 'Emissão',
  modelos: 'Modelos',
  tipos_de_equipamento: 'Tipos de equipamento',
  cadastros: 'Cadastros',
  usuarios_e_papeis: 'Usuários e papéis',
};

/** The pt-BR label of each key, one line of the grid. */
const KEY_LABELS: Readonly<Record<PermissionKey, string>> = {
  // authored (Story 26.2)
  'relatorio.view': 'Ver relatórios',
  // authored (Story 26.2)
  'relatorio.create': 'Criar relatórios',
  // authored (Story 26.2)
  'relatorio.delete': 'Remover relatórios',
  // authored (Story 26.2)
  'relatorio.fill': 'Preencher em campo',
  // authored (Story 26.2)
  'relatorio.issue': 'Gerar e emitir relatórios',
  // authored (Story 26.2)
  'export.download': 'Baixar DOCX e PDF emitidos',
  // authored (Story 26.2)
  'template.edit': 'Editar modelos',
  // authored (Story 26.2)
  'equipment_type.edit': 'Editar tipos de equipamento',
  // authored (Story 26.2)
  'registry.edit': 'Editar cadastros',
  // authored (Story 26.2)
  'suggestion.review': 'Aceitar sugestões',
  // authored (Story 26.2)
  'users.manage': 'Gerenciar usuários',
  // authored (Story 26.2)
  'roles.manage': 'Gerenciar papéis e permissões',
};

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
