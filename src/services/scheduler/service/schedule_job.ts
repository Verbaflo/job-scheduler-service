import { isEmpty } from 'lodash';
import moment, { Moment } from 'moment';
import { AppError } from '../../../common/app_error';
import { LockUtils } from '../../../common/lock_utils';
import { Logger } from '../../../common/logger';
import { enqueueJob } from '../../../sqs/producers/job_processor';
import {
  LOCK_TTL_IN_SECONDS,
  SCHEDULE_JOB_BASE_DELAY_MS,
  SCHEDULE_JOB_MAX_JITTER_MS,
  SCHEDULE_JOB_MAX_RETRIES,
} from '../constants';
import { JobNotFoundError } from '../errors/job_not_found_error';
import { JobRepository } from '../repositories/job.repository';
import { JobSchedulerRunDetailsRepository } from '../repositories/job_run_details.repository';
import {
  JobSchedulerRunDetails,
  JobStatus,
  ScheduleJobRequest,
  ScheduleJobResponse,
} from '../types';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const calculateBackoffDelay = (attempt: number): number => {
  const baseDelay = Math.min(
    SCHEDULE_JOB_BASE_DELAY_MS * 2 ** attempt,
    2000,
  );
  const jitter = Math.floor(Math.random() * SCHEDULE_JOB_MAX_JITTER_MS);
  return baseDelay + jitter;
};

const isNonRetryableError = (err: unknown): boolean => {
  return err instanceof AppError;
};

const enqueueJobWithDelay = async (
  jobId: string,
  version: number,
  callbackTime: Date,
): Promise<void> => {
  const delaySeconds =
    moment(callbackTime).diff(moment(), 'seconds') > 0
      ? moment(callbackTime).diff(moment(), 'seconds')
      : 0;
  await enqueueJob({ jobId, version }, delaySeconds);
};

const scheduleJob = async (
  request: ScheduleJobRequest,
): Promise<ScheduleJobResponse> => {
  const isJobInBetweenRunningJob = (
    latestRun: JobSchedulerRunDetails | null,
    callbackTimeStamp: Moment,
  ): boolean => {
    if (isEmpty(latestRun)) {
      return false;
    }
    const { endTimeStamp } = latestRun;
    return moment(callbackTimeStamp).isSameOrBefore(moment(endTimeStamp));
  };
  const { delayInSeconds, url, payload, jobId } = request;
  await LockUtils.acquireLock(jobId, LOCK_TTL_IN_SECONDS);
  try {
    let lastError: unknown;
    for (let attempt = 0; attempt <= SCHEDULE_JOB_MAX_RETRIES; attempt++) {
      try {
        const callbackTimeStamp = moment().add(delayInSeconds, 'second');
        const createdJob = await JobRepository.createOrUpdateJob({
          url,
          payload,
          callbackTime: callbackTimeStamp.toDate(),
          status: JobStatus.SCHEDULED,
          retryCount: 0,
          jobId,
        });
        const latestRun =
          await JobSchedulerRunDetailsRepository.getLastRunDetails();
        const { callbackTime } = createdJob;
        if (isJobInBetweenRunningJob(latestRun, callbackTimeStamp)) {
          const updatedJob = await JobRepository.updateJobStatus(
            jobId,
            JobStatus.IN_PROGRESS,
          );
          if (isEmpty(updatedJob)) {
            throw new JobNotFoundError(jobId);
          }
          const { version } = updatedJob;
          await enqueueJobWithDelay(jobId, version, callbackTime);
        }
        return createdJob;
      } catch (err) {
        if (isNonRetryableError(err)) {
          const appErr = err as AppError;
          Logger.error({
            message: 'scheduleJob failed with non-retryable error',
            key1: 'jobId',
            key1_value: jobId,
            key2: 'errorCode',
            key2_value: appErr.code,
            error_message: appErr.message,
            error_stack: appErr.stack,
          });
          throw err;
        }
        lastError = err;
        const errorMessage =
          err instanceof Error ? err.message : String(err);
        if (attempt < SCHEDULE_JOB_MAX_RETRIES) {
          const delay = calculateBackoffDelay(attempt);
          Logger.warning({
            message: 'scheduleJob retrying after infrastructure error',
            key1: 'jobId',
            key1_value: jobId,
            key2: 'attempt',
            key2_value: String(attempt + 1),
            key3: 'delayMs',
            key3_value: String(delay),
            error_message: errorMessage,
          });
          await sleep(delay);
        }
      }
    }
    const finalErrorMessage =
      lastError instanceof Error ? lastError.message : String(lastError);
    Logger.error({
      message: 'scheduleJob failed after exhausting all retries',
      key1: 'jobId',
      key1_value: jobId,
      key2: 'maxRetries',
      key2_value: String(SCHEDULE_JOB_MAX_RETRIES),
      error_message: finalErrorMessage,
      error_stack:
        lastError instanceof Error ? lastError.stack : undefined,
    });
    throw lastError;
  } finally {
    await LockUtils.releaseLock(jobId);
  }
};

export { scheduleJob };
