import { describe, expect, it } from 'vitest';
import { insertPhrase, ncObservationOnLeave } from './ficha.ts';

/*
 * Fix batch e24x (A1 and A2; Matheus's decision 17 of 2026-11-11): an NC row's observation leaves
 * with the NC only while it is made of the item's seed phrases alone. A phrase learned from a typed
 * observation, or another sheet's observation (a recent), is a text someone typed, so an
 * observation equal to one is edited and kept with the warning. A text still being saved is kept
 * when non-blank. The rule reads stored text only: no op id, no clock. (The e24b review's
 * `learnedBefore` and its test are gone with the op-id cut.)
 */

const SEED = ['Trinca no isolador', 'Isolador sujo', 'Fixação solta.'];
const TYPED = 'Trinca fina vista de cima';
const LEARNED = 'Oxidação nos terminais do polo B';

describe('e24x-UNIT A1 ncObservationOnLeave: the seed\'s phrases alone are automatic', () => {
  it.each([
    ['one seed chip, NC to C', 'C', SEED[0]!, 'clear'],
    ['one seed chip, NC to N.A.', 'NA', SEED[0]!, 'clear'],
    ['two seed chips joined as a tap joins them', 'C', insertPhrase(SEED[0]!, SEED[1]!).text, 'clear'],
    ['two seed chips and a final period', 'NA', `${insertPhrase(SEED[0]!, SEED[1]!).text}.`, 'clear'],
    ['a seed phrase offered with its period, stored without it', 'C', 'Fixação solta', 'clear'],
    ['a typed text the server learned, then a seed chip tapped after it', 'C', insertPhrase(TYPED, SEED[0]!).text, 'keep'],
    ['the same, NC to N.A.', 'NA', insertPhrase(TYPED, SEED[0]!).text, 'keep'],
    ['a phrase learned from another sheet, alone (a learned chip tapped, untouched)', 'C', LEARNED, 'keep'],
    ['another sheet\'s observation (a recent chip), alone', 'C', 'Barramento escurecido.', 'keep'],
    ['a blank observation', 'C', '  ', null],
  ] as const)('%s: %s', (_name, to, stored, expected) => {
    expect(ncObservationOnLeave('NC', to, stored, SEED)).toBe(expected);
  });

  it('answers the same for any other change: null', () => {
    for (const [from, to] of [['NC', null], ['C', 'NC'], ['NA', 'C'], ['C', 'C']] as const) expect(ncObservationOnLeave(from, to, SEED[0]!, SEED)).toBeNull();
  });

  it('a site item judges against its own seed phrases the same way', () => {
    const site = ['Extintor vencido', 'Sinalização ausente'];
    expect(ncObservationOnLeave('NC', 'C', insertPhrase(site[0]!, site[1]!).text, site)).toBe('clear');
    expect(ncObservationOnLeave('NC', 'C', 'Extintor vencido no corredor', site)).toBe('keep');
  });
});

describe('e24x-UNIT A2 ncObservationOnLeave: a text still being saved', () => {
  it('non-blank and ahead of the store: keep, even when it is a seed chip alone', () => {
    expect(ncObservationOnLeave('NC', 'C', '', SEED, SEED[0]!)).toBe('keep');
    expect(ncObservationOnLeave('NC', 'NA', SEED[0]!, SEED, insertPhrase(SEED[0]!, SEED[1]!).text)).toBe('keep');
    expect(ncObservationOnLeave('NC', 'C', 'Texto antigo', SEED, 'Texto novo')).toBe('keep');
  });

  it('blank while it is being saved: nothing is asked', () => {
    expect(ncObservationOnLeave('NC', 'C', 'Texto antigo', SEED, '')).toBeNull();
    expect(ncObservationOnLeave('NC', 'C', SEED[0]!, SEED, '   ')).toBeNull();
  });

  it('only a row leaving NC asks, pending or not', () => {
    expect(ncObservationOnLeave('C', 'NC', '', SEED, SEED[0]!)).toBeNull();
    expect(ncObservationOnLeave('NC', null, '', SEED, SEED[0]!)).toBeNull();
  });
});
