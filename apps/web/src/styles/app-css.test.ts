import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The mock container translation rule (AGENTS.md "Mock container selectors", retro
 * F-PAT-2): every `.frame-phone|tablet|tablet-landscape|desktop X { … }` rule of the
 * locked `components.css` has a copy in `app.css`, inside a media query that covers
 * that frame's viewport range and nothing outside the frames the rule names, with the
 * same declarations. A new mock rule without its translation fails here, which is how
 * the status board stayed in one row on a phone (U1).
 */

const components = readFileSync(resolve(__dirname, 'components.css'), 'utf8');
const app = readFileSync(resolve(__dirname, 'app.css'), 'utf8');

type Frame = 'phone' | 'tablet' | 'tablet-landscape' | 'desktop';

const RANGES: Record<Frame, [number, number]> = {
  phone: [0, 767.98],
  tablet: [768, 1279.98],
  'tablet-landscape': [1024, 1279.98],
  desktop: [1280, Number.POSITIVE_INFINITY],
};

/** Mock-only: sized to the bezel and its fake browser chrome (see app.css). */
const NOT_TRANSLATED = new Set(['.frame-desktop .screen']);

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();
const declarations = (body: string) =>
  body
    .split(';')
    .map(squash)
    .filter((d) => d !== '');

interface MediaBlock {
  min: number;
  max: number;
  rules: Map<string, string[]>;
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function mediaBlocks(css: string): MediaBlock[] {
  const blocks: MediaBlock[] = [];
  const source = stripComments(css);
  const pattern = /@media([^{]*)\{/g;
  for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
    const query = match[1]!;
    if (!/width/.test(query)) continue;
    let depth = 1;
    let i = pattern.lastIndex;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
    }
    const body = source.slice(pattern.lastIndex, i - 1);
    const min = Number(/min-width:\s*([\d.]+)px/.exec(query)?.[1] ?? 0);
    const max = Number(/max-width:\s*([\d.]+)px/.exec(query)?.[1] ?? Number.POSITIVE_INFINITY);
    const rules = new Map<string, string[]>();
    for (const rule of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const selector of rule[1]!.split(',')) rules.set(squash(selector), declarations(rule[2]!));
    }
    blocks.push({ min, max, rules });
  }
  return blocks;
}

interface FrameRule {
  line: string;
  targets: { frame: Frame; selector: string }[];
  declarations: string[];
}

function frameRules(css: string): FrameRule[] {
  const rules: FrameRule[] = [];
  for (const match of stripComments(css).matchAll(/([^{}]*\.frame-(?:phone|tablet|tablet-landscape|desktop)\b[^{}]*)\{([^{}]*)\}/g)) {
    const selectors = match[1]!.split(',').map(squash);
    const targets = selectors.flatMap((selector) => {
      const frame = /^\.frame-(phone|tablet-landscape|tablet|desktop)\s+(.+)$/.exec(selector);
      if (frame === null || NOT_TRANSLATED.has(selector)) return [];
      return [{ frame: frame[1] as Frame, selector: squash(frame[2]!) }];
    });
    if (targets.length > 0) rules.push({ line: squash(match[0]), targets, declarations: declarations(match[2]!) });
  }
  return rules;
}

describe('app.css translates the mock container selectors', () => {
  const blocks = mediaBlocks(app);
  const rules = frameRules(components);

  it('finds the frame rules the app can hit', () => {
    // Content padding, the status board (U1), the Sync badge words, the form-dialog pair...
    expect(rules.length).toBeGreaterThan(20);
  });

  for (const rule of frameRules(components)) {
    it(`mirrors ${rule.line.slice(0, 90)}`, () => {
      const frames = rule.targets.map((t) => t.frame);
      const unionMin = Math.min(...frames.map((f) => RANGES[f][0]));
      const unionMax = Math.max(...frames.map((f) => RANGES[f][1]));
      for (const { frame, selector } of rule.targets) {
        const [min, max] = RANGES[frame];
        const block = blocks.find(
          (b) => b.min <= min && b.max >= max && b.min >= unionMin && b.max <= unionMax && b.rules.has(selector),
        );
        expect(block, `${selector} for .frame-${frame} has no media-query copy in app.css`).toBeDefined();
        expect(block!.rules.get(selector)).toEqual(rule.declarations);
      }
    });
  }

  it('scopes the base font to the root, so portaled dialogs inherit it (U2)', () => {
    expect(squash(stripComments(app))).toContain(':root, :root * { font-family: var(--font-ui); }');
  });

  it('mirrors the value chip on state for a grouped chip, which carries aria-checked (F-SPEC-6)', () => {
    const mock = /\.chip\[aria-pressed="true"\]\s*\{([^}]*)\}/.exec(components);
    const alias = /\.chip\[role='radio'\]\[aria-checked='true'\]\s*\{([^}]*)\}/.exec(app);
    expect(mock).not.toBeNull();
    expect(alias).not.toBeNull();
    expect(declarations(alias![1]!)).toEqual(declarations(mock![1]!));
  });
});
