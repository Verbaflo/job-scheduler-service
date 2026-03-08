import { DeleteMessageCommand, Message } from '@aws-sdk/client-sqs';
import { Consumer } from 'sqs-consumer';
import { Logger } from '../../../common/logger';
import {
  isRetryableError,
  retryWithBackoff,
} from '../../../common/retry_utils';
import { RequestContext } from '../../../middlewares/request_context';
import {
  CONSUMER_RETRY_BASE_DELAY_MS,
  CONSUMER_RETRY_MAX_JITTER_MS,
  CONSUMER_RETRY_MAX_RETRIES,
} from '../../../services/scheduler/constants';
import { SqsClient } from '../../sqsClient';
import { handleJobProcessor } from './handler';

const startJobProcessorConsumer = (): void => {
  const queueUrl = process.env.SQS_JOB_PROCESSOR_URL!;
  const consumer = Consumer.create({
    queueUrl,
    handleMessageBatch: async (
      messages: Message[],
    ): Promise<Message[] | undefined> => {
      await Promise.all(
        messages.map((message) => {
          const requestId = crypto.randomUUID();
          return RequestContext.runWithRequestId(requestId, async () => {
            const body = JSON.parse(message.Body!);
            try {
              await retryWithBackoff(() => handleJobProcessor(body), {
                maxRetries: CONSUMER_RETRY_MAX_RETRIES,
                baseDelayMs: CONSUMER_RETRY_BASE_DELAY_MS,
                maxJitterMs: CONSUMER_RETRY_MAX_JITTER_MS,
                operationName: 'handleJobProcessor',
                context: { jobId: body.jobId },
              });
              await SqsClient.send(
                new DeleteMessageCommand({
                  QueueUrl: queueUrl,
                  ReceiptHandle: message.ReceiptHandle,
                }),
              );
            } catch (err: any) {
              if (isRetryableError(err)) {
                Logger.error({
                  message:
                    'job processing failed after retries, leaving for SQS redelivery',
                  key1: 'jobId',
                  key1_value: body.jobId,
                  error_message: err.message,
                });
              } else {
                Logger.error({
                  message:
                    'job processing failed with non-retryable error, deleting message',
                  key1: 'jobId',
                  key1_value: body.jobId,
                  error_message: err.message,
                });
                await SqsClient.send(
                  new DeleteMessageCommand({
                    QueueUrl: queueUrl,
                    ReceiptHandle: message.ReceiptHandle,
                  }),
                );
              }
            }
            return undefined;
          });
        }),
      );
      return undefined;
    },
    sqs: SqsClient,
    batchSize: 10,
  });
  consumer.on('error', (err: any) => {
    Logger.error({ message: 'SQS consumer error', error_message: err.message });
  });
  consumer.on('processing_error', (err: any) => {
    Logger.error({ message: 'Processing error', error_message: err.message });
  });
  consumer.on('message_received', () => {
    Logger.info({ message: 'JobCreated message received' });
  });
  consumer.start();
  Logger.info({ message: 'Job processor consumer started succesfully' });
};

export { startJobProcessorConsumer };
