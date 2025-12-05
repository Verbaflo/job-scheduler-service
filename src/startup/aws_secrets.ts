import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import dotenv from 'dotenv';
import { Logger } from '../common/logger';

dotenv.config();

async function fetchAwsSecrets(): Promise<void> {
  const secretId = process.env.AWS_SECRETS_ID;
  const region = process.env.AWS_REGION;
  if (!secretId || !region) {
    return;
  }
  const hasStaticCreds =
    !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;
  const client = new SecretsManagerClient({
    region,
    ...(hasStaticCreds
      ? {
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
          },
        }
      : {}),
  });
  Logger.info({
    message: 'fetching aws secrets',
    key1: 'region',
    key1_value: region,
    key2: 'secret_id',
    key2_value: secretId,
  });
  const cmd = new GetSecretValueCommand({ SecretId: secretId });
  try {
    const response = await client.send(cmd);
    if (response.SecretString) {
      const parsed = JSON.parse(response.SecretString);
      for (const [k, v] of Object.entries(parsed)) {
        // [IMPORTANT] do not overwrite already-set env vars (local .env should take precedence)
        if (!process.env[k]) {
          process.env[k] = String(v);
        }
      }
    }
  } catch (error: any) {
    Logger.error({
      message: 'failed to fetch aws secrets',
      error_message: error.message,
    });
  }
}

export async function initConfig(): Promise<void> {
  if (process.env.USE_AWS_SECRETS === 'true') {
    await fetchAwsSecrets();
  }
}
