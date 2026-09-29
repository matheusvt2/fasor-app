import type { BrowserContext, Page } from '@playwright/test';
import { expect } from './merged-fixtures.ts';

/*
 * Story 9.4: the fake speech engine the `build:e2e` bundle carries (`VITE_SPEECH_ENGINE=fake`,
 * `apps/web/src/speech/fake-engine.ts`). Playwright cannot speak: while a Dictation button
 * listens, `speak` hands the page a transcript and `failSpeech` a recognition error.
 */

interface FakeSpeechWindow {
  __fakeSpeech?: { listening: boolean; say(text: string): boolean; fail(reason?: string): boolean };
}

/** Whether a Dictation button listens now. */
export function isListening(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as FakeSpeechWindow).__fakeSpeech?.listening === true);
}

/** Waits until a Dictation button listens, then hands it `text` as heard. */
export async function speak(page: Page, text: string): Promise<void> {
  await expect.poll(() => isListening(page), { timeout: 10_000 }).toBe(true);
  const heard = await page.evaluate((t) => (window as unknown as FakeSpeechWindow).__fakeSpeech!.say(t), text);
  expect(heard).toBe(true);
}

/** Waits until a Dictation button listens, then fails its recognition. */
export async function failSpeech(page: Page): Promise<void> {
  await expect.poll(() => isListening(page), { timeout: 10_000 }).toBe(true);
  await page.evaluate(() => (window as unknown as FakeSpeechWindow).__fakeSpeech!.fail());
}

/** From the next document on, the fake engine says it is unavailable (no Dictation button renders). */
export async function disableSpeech(target: BrowserContext | Page): Promise<void> {
  await target.addInitScript(() => {
    (globalThis as unknown as { __FAKE_SPEECH__?: { available?: boolean } }).__FAKE_SPEECH__ = { available: false };
  });
}
