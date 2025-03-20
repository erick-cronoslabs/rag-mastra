import { openai } from "@ai-sdk/openai";
import { Agent, Step, Workflow } from "@mastra/core";
import { z } from "zod";
import { htmlAgent } from "../agents";
import { MDocument, rerank } from "@mastra/rag";
import { embed, embedMany } from "ai";
import { vectorQueryTool } from "../tools";

const agentSelector = new Agent({
  name: "CryptoAgentSelector",
  instructions:
    "You are a Crypto related knowledge agent selector your role is help user to select the approach agent to being in the future step base on the question user provided and the context you have.",
  model: openai("gpt-4o-mini"),
});

const vvsAgent = new Agent({
  name: "vvsAgent",
  instructions: `You are a helpful assistant focus on VVS Dapp that answers questions based on the provided context. Format your answers as follows:`,
  model: openai("gpt-4o-mini"),
  tools: {
    vectorQueryTool,
  },
});

export const URL_MAPS: Record<string, string[]> = {
  VVS: ["https://docs.vvs.finance"],
  Corgi: ["https://docs.corgiai.xyz/"],
};

export const AgentMap: Record<string, Agent> = {
  VVS: vvsAgent,
  Corgi: vvsAgent,
};

const myWorkflow = new Workflow({
  name: "my-workflow",
  triggerSchema: z.object({
    question: z.string(),
  }),
});

const outputSchema = {
  type: "object",
  properties: {
    agent: { type: "string", enum: ["VVS", "Corgi"] },
  },
  additionalProperties: false,
  required: ["agent"],
};

const selectAgent = new Step({
  id: "selectAgent",
  execute: async ({ context }) => {
    const question = context?.triggerData?.question;
    if (!question) {
      throw new Error("Question not found in trigger data");
    }

    const response = await agentSelector.generate(
      `Please help me to select the most approach agent to be use? if you don't know which agent should be selected then respond you don't know`,
      {
        context: [
          {
            role: 'user',
            content: question,
          },
          {
            role: "assistant",
            content:
              "VVS Agent is your gateway to the world of decentralized finance (DeFi), designed with simplicity in mind. We've made it easy for anyone to swap tokens, earn high yields, and, most importantly, have fun while doing it!",
          },
          {
            role: "assistant",
            content: "Corgi Agent is agent related to NFT",
          },
        ],
        output: outputSchema,
      }
    );

    return {
      agent: (response.object as { agent: string }).agent,
    };
  },
});

const loadDocuments = new Step({
  id: "loadDocuments",
  execute: async ({ context, mastra }) => {
    const question = context?.triggerData?.question;

    try {
      const agent = context.getStepResult<{ agent: string }>(
        "selectAgent"
      )?.agent;

      const htmlResponse = await htmlAgent.generate(
        "Please help to me to visit all the possible link in the html and then get all the html content base on the context provided",
        {
          context: [
            {
              role: "assistant",
              content: `Pleas visit the following URLS:${URL_MAPS[agent]}`,
            },
          ],
          output: {
            type: "object",
            properties: {
              htmlText: { type: "string" },
            },
            additionalProperties: false,
            required: ["htmlText"],
          },
        }
      );

      const doc = MDocument.fromHTML(
        (htmlResponse.object as { htmlText: string }).htmlText
      );

      const chunks = await doc.chunk({
        headers: [
          ["h1", "Header 1"],
          ["p", "Paragraph"],
        ],
      });

      console.log('chunks', chunks)

      const pgVector = mastra?.getVector("pgVector");

      const { embeddings } = await embedMany({
        model: openai.embedding("text-embedding-3-small"),
        values: chunks
          .map((chunk) => chunk.text)
          .filter((text) => text.trim() !== ""),
      });

      await pgVector?.createIndex({
        indexName: "embeddings",
        dimension: 1536,
      });

      await pgVector?.upsert({
        indexName: "embeddings",
        vectors: embeddings,
      });

      const { embedding } = await embed({
        model: openai.embedding("text-embedding-3-small"),
        value: question,
      });

      const initialResults = await pgVector?.query({
        indexName: "embeddings",
        queryVector: embedding,
        topK: 3,
      });
      
      console.log('initialResults', initialResults)

      return {
        result: initialResults
      }
    } catch (e) {
      console.log("error", e);
    }
  },
});

const generateAnswer = new Step({
  id: "generateAnswer",
  execute: async ({ context, mastra }) => {
    try {
      const question = context?.triggerData?.question;
      if (!question) {
        throw new Error("Question not found in trigger data");
      }

      const selectedAgent = context.getStepResult<{ agent: string }>(
        "selectAgent"
      )?.agent;

      const agent = AgentMap[selectedAgent];

      const relevantDocuments: MDocument[] = []
      // Format the relevant documents as context
      const documentContext = relevantDocuments.length > 0 
        ? `Here are the relevant documents:\n${relevantDocuments.map(doc => doc.text).join('\n\n')}`
        : "No relevant documents found.";

      const prompt = `
        Please base your answer only on the context provided below. 
        If the context doesn't contain enough information to fully answer the question, please state that explicitly.
        
        ${documentContext}
        `;

      const completion = await agent.generate(prompt, {
        context: [
          {
            role: "user",
            content: question,
          },
        ],
      });
      
      console.log("completion.text", completion.text);
      return { answer: completion.text };
    } catch (e) {
      console.log("error", e);
    }
  },
});
myWorkflow.step(selectAgent).then(loadDocuments).then(generateAnswer).commit();

export { myWorkflow };
