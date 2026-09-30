import type { ProseProvider, StructuringProvider } from '@app/domain';
import { AiFeaturesOffError, ProviderNotImplementedError } from './errors.ts';

/*
 * Story 8.4: the provider slots Epic 11 fills (the Claude structuring call through the
 * Anthropic API or Bedrock; Story 11.7 built Textract, `textract.ts`). They exist behind the
 * env switch so choosing one is a configuration change, and each fails every reading
 * permanently until it is built. None reads a credential.
 */

export function unimplementedStructuringProvider(name: 'anthropic' | 'bedrock'): StructuringProvider {
  return {
    async structure() {
      throw new ProviderNotImplementedError(name);
    },
  };
}

/** Stories 9.3 and 9.5: the prose slot of the same Epic 11 providers. */
export function unimplementedProseProvider(name: 'anthropic' | 'bedrock'): ProseProvider {
  return {
    async describe() {
      throw new ProviderNotImplementedError(name);
    },
  };
}

/** Story 11.8 follow-up: the structuring slot while `AI_FEATURES=off`; every call fails permanently. */
export function aiFeaturesOffStructuringProvider(): StructuringProvider {
  return {
    async structure() {
      throw new AiFeaturesOffError();
    },
  };
}

/** Story 11.8 follow-up: the prose slot while `AI_FEATURES=off`; every call fails permanently. */
export function aiFeaturesOffProseProvider(): ProseProvider {
  return {
    async describe() {
      throw new AiFeaturesOffError();
    },
  };
}
