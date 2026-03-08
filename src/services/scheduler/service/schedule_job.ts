import { isEmpty } from 'lodash';
import moment, { Moment } from 'moment';
import { LockUtils } from '../../../common/lock_utils';
import { retryWithBackoff } from '../../../common/retry_utils';
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
    return await retryWithBackoff(
      async () => {
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
      },
      {
        maxRetries: SCHEDULE_JOB_MAX_RETRIES,
        baseDelayMs: SCHEDULE_JOB_BASE_DELAY_MS,
        maxJitterMs: SCHEDULE_JOB_MAX_JITTER_MS,
        operationName: 'scheduleJob',
        context: { jobId },
      },
    );
  } finally {
    await LockUtils.releaseLock(jobId);
  }
};

export { scheduleJob };
