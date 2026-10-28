import { describe, expect, it } from 'vitest';
import { cameraAppDefault, cameraAppOf, cameraAppSchema } from './camera.ts';

/*
 * Story 17.2 (M1): the "Câmera do aparelho" preference and its default rule.
 */

describe('17.2-UNIT the camera-app preference', () => {
  it('defaults on with touch points and off without', () => {
    expect(cameraAppDefault(5)).toBe(true);
    expect(cameraAppDefault(1)).toBe(true);
    expect(cameraAppDefault(0)).toBe(false);
    expect(cameraAppOf(undefined, 5)).toBe(true);
    expect(cameraAppOf(undefined, 0)).toBe(false);
  });

  it('a stored boolean wins over the default', () => {
    expect(cameraAppOf(false, 5)).toBe(false);
    expect(cameraAppOf(true, 0)).toBe(true);
  });

  it('a stored value that does not parse reads the default', () => {
    expect(cameraAppOf('on', 0)).toBe(false);
    expect(cameraAppOf('off', 5)).toBe(true);
    expect(cameraAppOf(null, 5)).toBe(true);
    expect(cameraAppOf(1, 0)).toBe(false);
    expect(cameraAppSchema.safeParse(null).success).toBe(false);
  });
});
