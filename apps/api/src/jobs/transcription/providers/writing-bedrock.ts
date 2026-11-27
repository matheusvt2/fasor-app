import { audioContextText, type WritingProvider } from '@app/domain';
import { z } from 'zod';
import { assertPricedModel, converseTool, type BedrockProviderOptions } from '../../../ai/bedrock.ts';
import { BilledCallError } from '../../../ai/errors.ts';
import { AI_WRITE_PROMPT_VERSION, TRANSCRIPTION_PROMPT_VERSION, WRITING_MAX_TOKENS, WRITING_SYSTEM, WRITING_TOOL, WRITING_TOOL_DESCRIPTION, WRITING_TOOL_SCHEMA, writingPrompt } from '../prompt.ts';

/*
 * Story 31.2 (AD-30): the `bedrock` writing step (`LLM_PROVIDER=bedrock`), one Converse tool call
 * on the prose model through the api's Converse layer (`apps/api/src/ai/bedrock.ts`), on the
 * process's one Bedrock client. Credentials come only from the AWS SDK default chain; the backend
 * never uses a personal Claude subscription. The context sent is the kernel's, of the audio's own
 * relatório only. A tool input that is not one non-empty text is permanent, its call still counted.
 */

const toolInputSchema = z.object({ text: z.string().trim().min(1) });

export function bedrockWritingProvider(options: BedrockProviderOptions): WritingProvider {
  assertPricedModel(options.modelId);
  return {
    async write(input) {
      // Story 31.9: a tap on the AI control rewrites a field's own text, under its own prompt version.
      const promptVersion = input.source === 'field' ? AI_WRITE_PROMPT_VERSION : TRANSCRIPTION_PROMPT_VERSION;
      const answer = await converseTool(options, {
        modelId: options.modelId,
        system: WRITING_SYSTEM,
        content: [{ text: writingPrompt({ level: input.level, context: audioContextText(input.context), text: input.text, ...(input.source === undefined ? {} : { source: input.source }) }) }],
        tool: { name: WRITING_TOOL, description: WRITING_TOOL_DESCRIPTION, schema: WRITING_TOOL_SCHEMA },
        maxTokens: WRITING_MAX_TOKENS,
      });
      const parsed = toolInputSchema.safeParse(answer.input);
      if (!parsed.success) {
        throw new BilledCallError(`bedrock: ${options.modelId}: the writing tool input is not {text}`, { model: options.modelId, prompt_version: promptVersion, usage: answer.usage });
      }
      return { text: parsed.data.text, model: options.modelId, prompt_version: promptVersion, usage: answer.usage };
    },
  };
}
