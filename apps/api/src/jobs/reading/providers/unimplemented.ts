import type { ProseProvider, StructuringProvider } from '@app/domain';
import { AiFeaturesOffError } from './errors.ts';

/*
 * Story 11.8 follow-up: the LLM slots while `AI_FEATURES=off`. Story 11.6 removed the Epic 11
 * stubs that stood here for the `anthropic` and `bedrock` providers: `bedrock` is built
 * (`bedrock.ts`) and `anthropic` is dropped.
 */

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
