import moment from 'moment';
import { Logger } from '../../../common/logger';
import { enqueueJob } from '../../../sqs/producers/job_processor';
import { DISPATCH_CONCURRENCY, SQS_MAX_DELAY_SECONDS } from '../constants';
import { JobRepository } from '../repositories/job.repository';
import { JobDocument } from '../types';

const computeDelaySeconds = (callbackTime: Date): number => {
  const diffInSeconds = moment(callbackTime).diff(moment(), 'seconds');
  return diffInSeconds > 0 ? diffInSeconds : 0;
};

const claimAndEnqueueJob = async (job: JobDocument): Promise<void> => {
  const claimed = await JobRepository.claimScheduledJob(job.jobId);
  if (!claimed) {
    Logger.info({
      message: 'job already claimed by another run, skipping enqueue',
      key1: 'jobId',
      key1_value: job.jobId,
    });
    return;
  }
  const delaySeconds = computeDelaySeconds(claimed.callbackTime);
  if (delaySeconds > SQS_MAX_DELAY_SECONDS) {
    await JobRepository.revertJobToScheduled(claimed.jobId);
    Logger.info({
      message: 'claimed job is beyond SQS delay window, reverted for main cron',
      key1: 'jobId',
      key1_value: claimed.jobId,
      num_key1: 'delaySeconds',
      num_key1_value: delaySeconds,
    });
    return;
  }
  try {
    await enqueueJob({ jobId: claimed.jobId, version: claimed.version }, delaySeconds);
  } catch (err: any) {
    await JobRepository.revertJobToScheduled(claimed.jobId);
    Logger.error({
      message: 'failed to enqueue claimed job, reverted to scheduled',
      key1: 'jobId',
      key1_value: claimed.jobId,
      error_message: err?.message,
    });
    throw err;
  }
};

const dispatchJobs = async (jobs: JobDocument[]): Promise<void> => {
  const failedJobIds: string[] = [];
  for (let start = 0; start < jobs.length; start += DISPATCH_CONCURRENCY) {
    const chunk = jobs.slice(start, start + DISPATCH_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((job) => claimAndEnqueueJob(job)),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        failedJobIds.push(chunk[index].jobId);
      }
    });
  }
  if (failedJobIds.length > 0) {
    Logger.error({
      message: 'Some jobs failed to dispatch to SQS',
      num_key1: 'failedCount',
      num_key1_value: failedJobIds.length,
      key1: 'failedJobIds',
      key1_value: JSON.stringify(failedJobIds),
    });
  }
};

export { claimAndEnqueueJob, dispatchJobs };
