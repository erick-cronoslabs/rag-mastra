import { Mastra } from '@mastra/core/mastra';
import { PgVector } from '@mastra/pg';
import { myWorkflow } from './workflows';

// Provide a default value or throw an error if the environment variable is not set
const connectionString = process.env.POSTGRES_CONNECTION_STRING || 'default_connection_string';
const pgVector = new PgVector(connectionString);

export const mastra = new Mastra({
  workflows: { myWorkflow },
  vectors: { pgVector },
});
