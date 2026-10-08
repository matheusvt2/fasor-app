import { describe, expect, it } from 'vitest';
import { callWithTimeout, classifyAwsError } from './aws.ts';
import { isPermanentReadingError, PermanentReadingError, ProviderError, ProviderRefusedError, ProviderTimeoutError } from './errors.ts';

/*
 * Review 2026-10-08 (C4, AIR-17/API-1, API-V2): the one AWS failure classification and call
 * timeout of the Bedrock adapter (reading and audit) and the Textract provider.
 */

const named = (name: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(`${name}: refused`), { name, ...extra });

describe('classifyAwsError', () => {
  it('a credential fetch or refresh that fails is transient, whatever the service', () => {
    for (const service of ['bedrock', 'textract']) {
      for (const error of [named('CredentialsProviderError'), named('ExpiredTokenException', { $fault: 'client' }), named('ExpiredToken', { $fault: 'client' })]) {
        const classified = classifyAwsError(service, error);
        expect(classified, `${service} ${error.name}`).toBeInstanceOf(ProviderError);
        expect(isPermanentReadingError(classified)).toBe(false);
      }
    }
  });

  it('throttles, quotas, server faults, network errors and unknown errors are transient', () => {
    for (const error of [
      named('ThrottlingException', { $fault: 'client' }),
      named('ServiceQuotaExceededException', { $fault: 'client' }),
      named('ProvisionedThroughputExceededException', { $fault: 'client' }),
      named('LimitExceededException', { $fault: 'client' }),
      named('InternalServerException', { $fault: 'server' }),
      named('SomethingNew', { $fault: 'server' }),
      named('RequestTimeoutException', { $fault: 'client', $retryable: {} }),
      Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
      'a string',
    ]) {
      expect(classifyAwsError('bedrock', error)).toBeInstanceOf(ProviderError);
    }
  });

  it('a refused call (rights, signature, model id, request shape, any other client fault) is a permanent refusal', () => {
    for (const error of [
      named('AccessDeniedException', { $fault: 'client' }),
      named('AccessDeniedException'),
      named('UnrecognizedClientException', { $fault: 'client' }),
      named('InvalidSignatureException', { $fault: 'client' }),
      named('ValidationException', { $fault: 'client' }),
      named('ResourceNotFoundException', { $fault: 'client' }),
      named('SignatureDoesNotMatch', { $fault: 'client' }),
    ]) {
      const classified = classifyAwsError('textract', error);
      expect(classified, error.name).toBeInstanceOf(ProviderRefusedError);
      expect(isPermanentReadingError(classified)).toBe(true);
    }
  });

  it('a service adds its own permanent input faults and transient client faults', () => {
    const permanent = classifyAwsError('textract', named('BadDocumentException', { $fault: 'client' }), { permanent: new Set(['BadDocumentException']) });
    expect(permanent).toBeInstanceOf(PermanentReadingError);
    expect(permanent).not.toBeInstanceOf(ProviderRefusedError);
    expect(classifyAwsError('bedrock', named('ModelNotReadyException', { $fault: 'client' }), { transient: new Set(['ModelNotReadyException']) })).toBeInstanceOf(ProviderError);
    expect(classifyAwsError('bedrock', named('ModelNotReadyException', { $fault: 'client' }))).toBeInstanceOf(ProviderRefusedError);
  });

  it('names the service and the AWS error, and keeps the original as its cause', () => {
    const original = named('AccessDeniedException', { $fault: 'client' });
    const classified = classifyAwsError('bedrock', original);
    expect(classified.message).toBe('bedrock: AccessDeniedException: AccessDeniedException: refused');
    expect(classified.cause).toBe(original);
  });
});

describe('callWithTimeout', () => {
  const classify = (error: unknown) => new ProviderError(`classified: ${String(error)}`);

  it('returns the answer of a call that ends in time', async () => {
    await expect(callWithTimeout('textract', 1000, async () => 'ok', classify)).resolves.toBe('ok');
  });

  it('aborts a call that outlives the timeout: ProviderTimeoutError naming the label', async () => {
    let seen: AbortSignal | undefined;
    const error = await callWithTimeout(
      'bedrock: m',
      20,
      (signal) =>
        new Promise<never>((_, reject) => {
          seen = signal;
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      classify,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderTimeoutError);
    expect((error as Error).message).toBe('bedrock: m: no answer within 20 ms');
    expect(seen?.aborted).toBe(true);
  });

  it('passes any other failure through the classifier', async () => {
    const error = await callWithTimeout(
      'textract',
      1000,
      async () => {
        throw new Error('boom');
      },
      classify,
    ).catch((caught: unknown) => caught);
    expect((error as Error).message).toBe('classified: Error: boom');
  });
});
