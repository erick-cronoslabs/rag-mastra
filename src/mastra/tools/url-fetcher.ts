import { Tool } from '@mastra/core/tools';
import axios from 'axios';
import { z } from "zod";

export const urlFetcherTool = new Tool({
  id: 'urlFetcher',
  description: 'Fetches HTML content from a specified URL',
  inputSchema: z.object({
    url: z.string().url(),
    timeout: z.number(),
  }),
  execute: async ({ context }) => {
    try {
      const response = await axios.get(context.url, {
        timeout: context.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });
      
      return {
        html: response.data,
        status: response.status,
        headers: response.headers,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          error: error.message,
          status: error.response?.status || 'unknown',
        };
      }
      return {
        error: 'An unexpected error occurred',
      };
    }
  },
}); 