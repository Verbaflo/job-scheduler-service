import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { Logger } from '../../../common/logger';
import { SqsClient } from '../../sqsClient';
import { JobProcessorInput } from '../../types';

const enqueueJob = async (
  payload: JobProcessorInput,
  delaySeconds: number = 0,
) => {
  const queueUrl = process.env.SQS_JOB_PROCESSOR_URL!;
  try {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload),
      DelaySeconds: delaySeconds,
    });
    const response = await SqsClient.send(command);
    Logger.info({
      message: 'Job enqueued successfully',
      key1: 'MessageId',
      key1_value: response.MessageId,
    });
    return response;
  } catch (err: any) {
    Logger.error({
      message: 'Failed to enqueue job',
      error_message: err.message,
      key1: 'payload',
      key1_value: JSON.stringify(payload),
    });
    throw err;
  }
};

export { enqueueJob };
