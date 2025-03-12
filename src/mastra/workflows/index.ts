import { openai } from "@ai-sdk/openai";
import { Agent, Step, Workflow } from "@mastra/core";
import { z } from "zod";
import { htmlAgent } from "../agents";
import { MDocument } from "@mastra/rag";
import { embed, embedMany } from "ai";

const agentSelector = new Agent({
  name: "CryptoAgentSelector",
  instructions:
    "You are a Crypto related knowledge agent selector your role is help user to select the approach agent to being in the future step base on the question user provided and the context you have.",
  model: openai("gpt-4o-mini"),
});

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
            role: "user",
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

export const URL_MAPS: Record<string, string[]> = {
  VVS: ["https://docs.vvs.finance"],
  Corgi: ["https://docs.corgiai.xyz/"],
};

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

      const pgVector = mastra?.getVector("pgVector");

      const { embeddings } = await embedMany({
        model: openai.embedding("text-embedding-3-small"),
        values: chunks.map((chunk) => chunk.text),
      });

      console.log("successfull embedMany ");

      await pgVector?.createIndex({
        indexName: "embeddings",
        dimension: 1536,
      });

      await pgVector?.upsert({
        indexName: "embeddings",
        vectors: embeddings,
      });

      const { embedding } = await embed({
        value: question,
        model: openai.embedding("text-embedding-3-small"),
      });

      // Query vector store
      const results = await pgVector?.query({
        indexName: "embeddings",
        queryVector: embedding,
        topK: 10,
      });

      console.log("results", results);
    } catch (e) {
      console.log("error", e);
    }
  },
});
myWorkflow.step(selectAgent).then(loadDocuments).commit();

export { myWorkflow };
