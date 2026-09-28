import type { OcrProvider, StructuringProvider } from '@app/domain';
import { ProviderNotImplementedError } from './errors.ts';

/*
 * Story 8.4: the provider slots Epic 11 fills (Textract for OCR, the Claude structuring call
 * through the Anthropic API or Bedrock). They exist behind the env switch so choosing one is
 * a configuration change, and each fails every reading permanently until it is built. None
 * reads a credential.
 */

export function unimplementedOcrProvider(name: 'textract'): OcrProvider {
  return {
    async read() {
      throw new ProviderNotImplementedError(name);
    },
  };
}

export function unimplementedStructuringProvider(name: 'anthropic' | 'bedrock'): StructuringProvider {
  return {
    async structure() {
      throw new ProviderNotImplementedError(name);
    },
  };
}
