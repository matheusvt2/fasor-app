import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * E9-A9: a default install dictates nothing. `webspeech` sends the audio to the browser
 * vendor's service, so it stays opt-in until Matheus approves vendor audio (Q18): the
 * compose default and the `.env.example` value of `VITE_SPEECH_ENGINE` are both `none`.
 */

const root = resolve(import.meta.dirname, '..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('E9-A9 speech engine default', () => {
  it('docker-compose.yml defaults VITE_SPEECH_ENGINE to none', () => {
    const lines = read('docker-compose.yml')
      .split('\n')
      .filter((line) => /^\s*VITE_SPEECH_ENGINE:/.test(line));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.trim()).toBe('VITE_SPEECH_ENGINE: ${VITE_SPEECH_ENGINE:-none}');
  });

  it('.env.example sets VITE_SPEECH_ENGINE=none', () => {
    const lines = read('.env.example')
      .split('\n')
      .filter((line) => /^\s*VITE_SPEECH_ENGINE=/.test(line));
    expect(lines).toEqual(['VITE_SPEECH_ENGINE=none']);
  });
});
