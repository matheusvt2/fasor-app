import { describe, expect, it } from 'vitest';
import { PERMISSION_KEYS } from './keys.ts';
import { permissionRefusalText, READ_ONLY_BANNER_TEXT, SCREEN_UNAVAILABLE_TEXT } from './refusal.ts';
import { permissionForScreen } from './screens.ts';

const ID = '019966b0-0000-7000-8000-0000000000aa';

describe('26.5-UNIT-001 the screen map names the key of every web route', () => {
  it.each([
    ['/cadastros', 'registry.edit'],
    ['/templates', 'template.edit'],
    [`/templates/${ID}`, 'template.edit'],
    [`/templates/tipos/${ID}`, 'equipment_type.edit'],
    [`/project/${ID}`, 'relatorio.view'],
    [`/relatorio/${ID}`, 'relatorio.view'],
    [`/relatorio/${ID}/setup`, 'relatorio.view'],
    [`/relatorio/${ID}/arvore`, 'relatorio.view'],
    [`/relatorio/${ID}/ficha/${ID}`, 'relatorio.view'],
    [`/relatorio/${ID}/local/${ID}/verificacoes`, 'relatorio.view'],
    [`/relatorio/${ID}/fotos`, 'relatorio.view'],
    [`/relatorio/${ID}/pontos`, 'relatorio.view'],
    [`/relatorio/${ID}/secao/${ID}`, 'relatorio.view'],
    ['/usuarios', 'users.manage'],
    ['/usuarios/papeis', 'roles.manage'],
    ['/', 'none'],
    ['/account', 'none'],
    ['/sync', 'none'],
    ['/login', 'none'],
    ['/__fixture/field', 'none'],
    ['/nao-existe', 'none'],
    ['/relatorio', 'none'],
  ] as const)('%s needs %s', (path, need) => {
    expect(permissionForScreen(path)).toBe(need);
  });

  it('a trailing slash reads as the same screen', () => {
    expect(permissionForScreen('/templates/')).toBe('template.edit');
    expect(permissionForScreen(`/relatorio/${ID}/`)).toBe('relatorio.view');
  });
});

describe('26.5-UNIT-002 every key has its refusal sentence', () => {
  it.each(PERMISSION_KEYS.map((key) => [key]))('%s', (key) => {
    const text = permissionRefusalText(key);
    expect(text.length).toBeGreaterThan(0);
    expect(text.startsWith('Seu papel não permite ')).toBe(true);
    expect(text.endsWith('.')).toBe(true);
  });

  it('the frames read verbatim', () => {
    expect(permissionRefusalText('relatorio.create')).toBe('Seu papel não permite criar relatórios.');
    expect(permissionRefusalText('relatorio.issue')).toBe('Seu papel não permite pré-visualizar nem gerar o relatório.');
    expect(SCREEN_UNAVAILABLE_TEXT).toBe('Essa tela não está disponível para o seu papel.');
    expect(READ_ONLY_BANNER_TEXT).toBe('Somente leitura. Seu papel não permite preencher fichas, fotos e pontos.');
  });
});
