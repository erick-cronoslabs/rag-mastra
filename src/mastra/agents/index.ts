import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { urlFetcherTool } from "../tools";

export const htmlAgent = new Agent({
  name: 'HTML Agent',
  instructions:
    'You are html agent please help me to get the html content by using the tools provided',
  model: openai('gpt-4o-mini'),
  tools: {
    urlFetcherTool,
  },
});

