import moment from 'moment';
import { Logger } from '../../../common/logger';
import { enqueueJob } from '../../../sqs/producers/job_processor';
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
  try {
    await enqueueJob(
      { jobId: claimed.jobId, version: claimed.version },
      computeDelaySeconds(claimed.callbackTime),
    );
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
  const results = await Promise.allSettled(
    jobs.map((job) => claimAndEnqueueJob(job)),
  );
  const failedJobIds = results
    .map((result, index) => ({
      status: result.status,
      jobId: jobs[index].jobId,
    }))
    .filter((entry) => entry.status === 'rejected')
    .map((entry) => entry.jobId);
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
