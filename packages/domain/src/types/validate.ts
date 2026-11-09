import type { z } from 'zod';
import { companyTypeDefinitionSchema, type CompanyTypeDraft } from './definition.ts';

/*
 * Story 14.6 (AD-21 note of 2026-11-06, item 9): what keeps a draft from being published, each
 * issue with its path and its pt-BR sentence (derived text, so it lives in the kernel). It is
 * exactly what the strict `companyTypeDefinitionSchema` refuses: every issue the schema raises is
 * one issue here, read back as the sentence the editor shows inline beside the part it concerns,
 * so the editor and `applyOp` can never disagree on whether a draft publishes. The editor keeps
 * "Publicar" disabled with the first issue as its reason (`publishBlockedText`).
 */

/** The editor tab an issue belongs to (`43-tipo-equipamento.html`). */
export type TypeEditorPart = 'identificacao' | 'placa' | 'verificacoes' | 'ensaios' | 'criterios';

/** The tabs in their order on screen. */
export const TYPE_EDITOR_PARTS: readonly TypeEditorPart[] = ['identificacao', 'placa', 'verificacoes', 'ensaios', 'criterios'];

export interface TypeDraftIssue {
  /** Where in the draft, as the strict schema names it (`['criteria', 3, 'source', 'name']`). */
  path: (string | number)[];
  part: TypeEditorPart;
  /** The sentence shown inline beside the part ("Informe a fonte do critério."). */
  message: string;
  /** The short form the publish bar reads ("Critérios › Flutuação do banco sem fonte"). */
  summary: string;
}

const PART_OF: Readonly<Record<string, TypeEditorPart>> = {
  label: 'identificacao',
  print_title: 'identificacao',
  tag_prefix: 'identificacao',
  noun: 'identificacao',
  nameplate: 'placa',
  checklist: 'verificacoes',
  tests: 'ensaios',
  measurement_tests: 'ensaios',
  config_fields: 'ensaios',
  criteria: 'criterios',
  // Fix batch e22h (S1): the oil rule names nameplate fields (its items are on the checklist, `partOf`).
  oil_rule: 'placa',
};

/** The tab of an issue at `path`: its head's, the oil rule's items on Verificações. */
function partOf(path: readonly (string | number)[]): TypeEditorPart {
  if (path[0] === 'oil_rule' && path[1] === 'items') return 'verificacoes';
  return PART_OF[String(path[0])] ?? 'identificacao';
}

/** A nameplate field's label in the draft by its key, or null. */
function fieldLabelOf(draft: Draft, key: unknown): string | null {
  const fields = draft.nameplate;
  if (!Array.isArray(fields) || typeof key !== 'string') return null;
  const field: unknown = fields.find((entry) => entry !== null && typeof entry === 'object' && (entry as Record<string, unknown>).key === key);
  return field === undefined ? null : textOf((field as Record<string, unknown>).label);
}

// authored (Story 14.6): the tab names as the summaries say them, the editor's own tab words.
const PART_WORD: Readonly<Record<TypeEditorPart, string>> = {
  identificacao: 'Identificação',
  placa: 'Placa',
  verificacoes: 'Verificações',
  ensaios: 'Ensaios',
  criterios: 'Critérios',
};

type Draft = Record<string, unknown>;

function itemAt(draft: Draft, part: string, index: unknown): Record<string, unknown> | null {
  const list = draft[part];
  if (!Array.isArray(list) || typeof index !== 'number') return null;
  const item: unknown = list[index];
  return item !== null && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** "campo 3", or the field's own label when it has one ("Tipo de bateria"). */
function nameOf(item: Record<string, unknown> | null, noun: string, index: unknown): string {
  const label = item === null ? null : textOf(item.label);
  if (label !== null) return label;
  return typeof index === 'number' ? `${noun} ${index + 1}` : noun;
}

/** The sentence and summary of one schema issue, by where it sits. */
function sentenceOf(issue: z.core.$ZodIssue, draft: Draft): { message: string; summary: string } {
  const [head, index, sub, subIndex, leaf] = issue.path as (string | number | undefined)[];
  const part = partOf(issue.path as (string | number)[]);
  const word = PART_WORD[part];
  const plain = (message: string, what: string) => ({ message, summary: `${word} › ${what}` });

  // authored (Story 14.6): every sentence below, listed for Bruno in the PR.
  if (index === undefined && issue.code === 'invalid_type' && head !== 'label' && head !== 'tag_prefix' && head !== 'print_title' && head !== 'noun') {
    // A whole part is missing (a draft written by hand, never one "Duplicar" made).
    return plain(`Preencha a aba ${word}.`, 'aba vazia');
  }
  switch (head) {
    case 'label':
      return plain('Informe o nome do tipo.', 'nome do tipo');
    case 'print_title':
      return plain('O título impresso não pode ficar em branco.', 'título impresso');
    case 'tag_prefix':
      return plain('O prefixo da TAG começa com uma letra e tem até 6 letras maiúsculas ou números.', 'prefixo da TAG');
    case 'noun':
      if (index === 'singular') return plain('Informe o nome no singular.', 'nome no singular');
      if (index === 'plural') return plain('Informe o nome no plural.', 'nome no plural');
      if (index === 'gender') return plain('Escolha o gênero.', 'gênero');
      return plain('Informe o nome no singular, no plural e o gênero.', 'nome e gênero');
    case 'nameplate': {
      const item = itemAt(draft, 'nameplate', index);
      const name = nameOf(item, 'campo', index);
      if (typeof index !== 'number') return plain('Dois campos da placa têm a mesma chave.', 'campos repetidos');
      if (sub === 'label') return plain(`Campo ${index + 1}: informe o rótulo.`, `campo ${index + 1} sem rótulo`);
      if (sub === 'kind') return plain(`${name}: escolha o tipo do campo.`, `${name} sem tipo`);
      if (sub === 'unit') return plain(`${name}: a unidade não pode ficar em branco.`, `${name} sem unidade`);
      if (sub === 'options') return plain(`${name}: cada opção da lista precisa de um texto.`, `${name} com opção vazia`);
      if (issue.message.includes('options exist exactly')) return plain(`${name}: uma lista precisa de opções, e só uma lista tem opções.`, `${name} sem opções`);
      if (issue.message.includes('a unit belongs')) return plain(`${name}: só um número ou uma classe de tensão tem unidade.`, `${name} com unidade`);
      // authored (Story 23.7, listed for Bruno): the v13 nameplate keys a copy carries (TAPS, TAP ATUAL, "115/√3", "200-5").
      if (sub === 'pick_from') return plain(`${name}: o valor é escolhido de um campo de lista da placa; mantenha esse campo como uma lista de números na mesma unidade.`, `${name} sem lista`);
      if (issue.message.includes('belong to a number field') || issue.message.includes('a list field is')) return plain(`${name}: só um campo numérico guarda uma lista de valores ou um valor sobre √3.`, `${name} com lista`);
      if (issue.message.includes('dash_ratio')) return plain(`${name}: só um campo de texto lê a relação com traço.`, `${name} com relação`);
      return plain(`${name}: confira o campo.`, name);
    }
    case 'checklist': {
      const item = itemAt(draft, 'checklist', index);
      if (typeof index !== 'number') return plain('Dois itens de verificação têm a mesma chave.', 'itens repetidos');
      const name = `Item ${index + 1}`;
      if (sub === 'label') return plain(`${name}: informe o texto do item.`, `item ${index + 1} sem texto`);
      if (sub === 'nc_phrases') {
        const phrases = item === null || !Array.isArray(item.nc_phrases) ? 0 : item.nc_phrases.length;
        return phrases >= 3 && phrases <= 4
          ? plain(`${name}: nenhuma frase de NC pode ficar em branco.`, `item ${index + 1} com frase vazia`)
          : plain(`${name}: informe de 3 a 4 frases de NC.`, `item ${index + 1} com ${phrases} frases de NC`);
      }
      if (sub === 'hint') return plain(`${name}: o lembrete não pode ficar em branco.`, `item ${index + 1} com lembrete vazio`);
      return plain(`${name}: confira o item.`, `item ${index + 1}`);
    }
    case 'tests': {
      if (typeof index !== 'number') return plain('Só um ensaio de cada formato.', 'formato repetido');
      const item = itemAt(draft, 'tests', index);
      const name = nameOf(item, 'ensaio', index);
      if (sub === 'criterion_key') return plain(`${name}: o critério do ensaio não está na aba Critérios.`, `${name} sem critério`);
      // authored: e22h S1, a criterion the plate picks whose field changed.
      if (sub === 'criterion_class_field') {
        const field = fieldLabelOf(draft, item?.criterion_class_field) ?? 'da classe de exatidão';
        return plain(`${name}: a classe de exatidão é lida do campo ${field} da placa; mantenha esse campo como uma lista.`, `${name} sem campo da classe`);
      }
      if (sub === 'criterion_bands') {
        const bands = item?.criterion_bands;
        const at = bands !== null && typeof bands === 'object' ? (bands as Record<string, unknown>)[subIndex === 'selv_field' ? 'selv_field' : 'field'] : undefined;
        const field = fieldLabelOf(draft, at) ?? (subIndex === 'selv_field' ? 'SELV/PELV' : 'da tensão');
        return subIndex === 'selv_field'
          ? plain(`${name}: o critério SELV/PELV é escolhido pelo campo ${field} da placa; mantenha esse campo como uma lista com SIM.`, `${name} sem campo SELV/PELV`)
          : plain(`${name}: o critério é escolhido pela tensão do campo ${field} da placa; mantenha esse campo como um número em V.`, `${name} sem campo da tensão`);
      }
      if (sub === 'tables' && leaf === 'voltage_rows') return plain(`${name}: a tensão de uma linha vem de um campo numérico da placa; mantenha esse campo como um número.`, `${name} sem campo da tensão`);
      // authored (Stories 23.8 and 23.9, listed for Bruno): the tap rows and the applicability condition a copy carries.
      if (sub === 'tables' && leaf === 'rows_from' && issue.message.includes('one seeded row')) return plain(`${name}: as linhas vêm da lista de taps da placa; mantenha a tabela com uma linha e uma coluna de conexão.`, `${name} com linhas a mais`);
      if (sub === 'tables' && leaf === 'rows_from') return plain(`${name}: as linhas vêm de uma lista da placa em V ou kV; mantenha esse campo como uma lista de números.`, `${name} sem lista de taps`);
      if (sub === 'applies_when') return plain(`${name}: a condição de aplicação lê um campo da placa; mantenha esse campo e as suas opções como a condição pede.`, `${name} sem campo da condição`);
      if (sub === 'label') return plain(`Ensaio ${index + 1}: informe o título do ensaio.`, `ensaio ${index + 1} sem título`);
      return plain(`${name}: confira as tabelas do ensaio.`, name);
    }
    case 'measurement_tests': {
      if (typeof index !== 'number') return plain('Dois ensaios têm a mesma chave.', 'ensaios repetidos');
      const item = itemAt(draft, 'measurement_tests', index);
      const name = nameOf(item, 'tabela de medições', index);
      if (sub === 'label') return plain(`Tabela de medições ${index + 1}: informe o título do ensaio.`, `tabela ${index + 1} sem título`);
      if (sub === 'key') return plain(`${name}: escolha outro nome interno para o ensaio.`, `${name} com chave reservada`);
      if (sub === 'rows' && typeof subIndex === 'number' && leaf === 'label') return plain(`${name}, linha ${subIndex + 1}: informe o nome da linha.`, `${name} com linha sem nome`);
      if (sub === 'rows') return plain(`${name}: confira as linhas da tabela.`, `${name} linhas`);
      if (sub === 'columns') return plain(`${name}: confira as colunas da tabela.`, `${name} colunas`);
      if (sub === 'criteria' && leaf === 'seeded') return plain(`${name}: o critério de uma linha não está na aba Critérios.`, `${name} sem critério`);
      if (sub === 'criteria') return plain(`${name}: confira os critérios da tabela.`, `${name} critérios`);
      if (sub === 'row_header') return plain(`${name}: informe o título da coluna das linhas.`, `${name} sem título de linha`);
      // authored (Story 23.9, listed for Bruno).
      if (sub === 'applies_when') return plain(`${name}: a condição de aplicação lê um campo da placa; mantenha esse campo e as suas opções como a condição pede.`, `${name} sem campo da condição`);
      if (sub === 'initial_off') return plain(`${name}: só um ensaio opcional na ficha começa desligado.`, `${name} desligado`);
      return plain(`${name}: confira a tabela de medições.`, name);
    }
    case 'config_fields':
      return plain('Confira os campos de configuração do ensaio.', 'configuração');
    case 'oil_rule': {
      // authored: e22h S1, the oil rule a copy carries (its field, values, items and fields).
      const rule = draft.oil_rule;
      const at = rule !== null && typeof rule === 'object' ? (rule as Record<string, unknown>).field : undefined;
      const field = fieldLabelOf(draft, at) ?? 'do tipo de isolação';
      if (index === 'items') return plain('A regra do óleo cita um item que não está na lista de verificação.', 'regra do óleo sem item');
      if (index === 'fields' || index === 'dry_fields') return plain('A regra do óleo cita um campo que não está na placa.', 'regra do óleo sem campo');
      if (index === 'oil_values' || index === 'full_values') return plain(`A regra do óleo cita uma opção que o campo ${field} não tem; mantenha as opções desse campo.`, 'regra do óleo sem opção');
      return plain(`A regra do óleo lê o campo ${field} da placa; mantenha esse campo como uma lista.`, 'regra do óleo sem campo');
    }
    case 'criteria': {
      if (typeof index !== 'number') return plain('Dois critérios têm a mesma chave.', 'critérios repetidos');
      const item = itemAt(draft, 'criteria', index);
      const name = nameOf(item, 'critério', index);
      if (sub === 'source') return { message: 'Informe a fonte do critério.', summary: `${word} › ${name} sem fonte` };
      if (sub === 'label') return plain(`Critério ${index + 1}: informe o nome do critério.`, `critério ${index + 1} sem nome`);
      // A rule that would fail every reading its tests judge (`criterionRulesFor`).
      if (sub === 'operator' && issue.message.startsWith('± judges')) return plain(`${name}: a regra ± vale para o desvio da relação de transformação; escolha outra regra.`, `${name} com regra ±`);
      // authored: e22h N1, no grammar judges "aprovado ou reprovado" yet.
      if (sub === 'operator' && issue.message.startsWith('pass_fail judges')) return plain(`${name}: nenhum ensaio julga "aprovado ou reprovado"; escolha outra regra.`, `${name} com aprovado ou reprovado`);
      if (sub === 'operator') return plain(`${name}: escolha a regra.`, `${name} sem regra`);
      if (sub === 'value') return plain(`${name}: informe o valor.`, `${name} sem valor`);
      if (sub === 'value_max') {
        if (issue.message.includes('below')) return plain(`${name}: o valor máximo é menor que o mínimo.`, `${name} com máximo abaixo do mínimo`);
        if (issue.message.includes('only between')) return plain(`${name}: só a regra "entre" tem valor máximo.`, `${name} com máximo`);
        return plain(`${name}: informe o valor máximo.`, `${name} sem máximo`);
      }
      if (sub === 'unit') return plain(`${name}: a unidade não pode ficar em branco.`, `${name} sem unidade`);
      if (sub === 'type') return plain(`${name}: escolha a regra.`, `${name} sem regra`);
      return plain(`${name}: confira o critério.`, name);
    }
    default:
      return plain('Confira o rascunho.', 'rascunho');
  }
}

/** Whether the measurement criterion at `[test, criterion]` names a row of the criteria table (`seeded`) whose source it mirrors. */
function seededCriterionAt(draft: Draft, test: unknown, criterion: unknown): boolean {
  const item = itemAt(draft, 'measurement_tests', test);
  const list = item === null ? undefined : item.criteria;
  if (!Array.isArray(list) || typeof criterion !== 'number') return false;
  const entry: unknown = list[criterion];
  if (entry === null || typeof entry !== 'object') return false;
  const seeded = (entry as Record<string, unknown>).seeded;
  if (typeof seeded !== 'string') return false;
  // Left to the Critérios tab only while that row's own source is missing too, so a draft this
  // skips an issue of always has another and never publishes (the editor and `applyOp` agree).
  const criteria = draft.criteria;
  return (
    Array.isArray(criteria) &&
    criteria.some((row) => {
      if (row === null || typeof row !== 'object' || (row as Record<string, unknown>).key !== seeded) return false;
      const source = (row as Record<string, unknown>).source;
      const name = source !== null && typeof source === 'object' ? (source as Record<string, unknown>).name : undefined;
      return typeof name !== 'string' || name.trim() === '';
    })
  );
}

/**
 * The draft's issues, in the order of the editor's tabs and then of the draft; none when the draft
 * publishes as it is. One issue per place: a field missing several things is named once, by the
 * first rule it breaks.
 */
export function validateTypeDraft(draft: CompanyTypeDraft | null | undefined): TypeDraftIssue[] {
  const value: Draft = draft !== null && typeof draft === 'object' && !Array.isArray(draft) ? (draft as Draft) : {};
  const parsed = companyTypeDefinitionSchema.safeParse(value);
  if (parsed.success) return [];
  const seen = new Set<string>();
  const out: TypeDraftIssue[] = [];
  for (const issue of parsed.error.issues) {
    const path = issue.path.filter((segment): segment is string | number => typeof segment === 'string' || typeof segment === 'number');
    const head = String(path[0] ?? '');
    // Story 14.7: a measurement criterion that names a row of the criteria table carries that
    // row's source (`updateDraftCriterion` copies it), so a missing source is said once, on the
    // Critérios tab, where it is typed.
    if (head === 'measurement_tests' && path[2] === 'criteria' && path[4] === 'source' && seededCriterionAt(value, path[1], path[3])) continue;
    const part = partOf(path);
    const { message, summary } = sentenceOf(issue, value);
    const at = `${JSON.stringify(path.slice(0, 2))}\u0000${message}`;
    if (seen.has(at)) continue;
    seen.add(at);
    out.push({ path, part, message, summary });
  }
  const order = (part: TypeEditorPart) => TYPE_EDITOR_PARTS.indexOf(part);
  return out.map((issue, i) => ({ issue, i })).sort((a, b) => order(a.issue.part) - order(b.issue.part) || a.i - b.i).map(({ issue }) => issue);
}

/** How many issues fall in one tab: the count its label carries ("Critérios (4) · 1 aviso"). */
export function typeDraftIssueCount(issues: readonly TypeDraftIssue[], part: TypeEditorPart): number {
  return issues.filter((issue) => issue.part === part).length;
}

/**
 * The publish bar's reason while the draft does not publish: the count and the first issue
 * ("1 aviso antes de publicar: Critérios › Flutuação do banco sem fonte"); null when none.
 */
export function publishBlockedText(issues: readonly TypeDraftIssue[]): string | null {
  const first = issues[0];
  if (first === undefined) return null;
  // authored (Story 14.6): the mock's reason, with its plural.
  const count = issues.length === 1 ? '1 aviso' : `${issues.length} avisos`;
  return `${count} antes de publicar: ${first.summary}`;
}
