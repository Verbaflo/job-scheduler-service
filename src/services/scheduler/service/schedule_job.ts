import moment, { Moment } from 'moment';
import { LockUtils } from '../../../common/lock_utils';
import { retryWithBackoff } from '../../../common/retry_utils';
import {
  LOCK_TTL_IN_SECONDS,
  SCHEDULE_JOB_BASE_DELAY_MS,
  SCHEDULE_JOB_MAX_JITTER_MS,
  SCHEDULE_JOB_MAX_RETRIES,
} from '../constants';
import { JobRepository } from '../repositories/job.repository';
import { JobSchedulerRunDetailsRepository } from '../repositories/job_run_details.repository';
import {
  JobSchedulerRunDetails,
  JobStatus,
  ScheduleJobRequest,
  ScheduleJobResponse,
} from '../types';
import { claimAndEnqueueJob } from './job_dispatch';

const scheduleJob = async (
  request: ScheduleJobRequest,
): Promise<ScheduleJobResponse> => {
  const isJobInBetweenRunningJob = (
    latestRun: JobSchedulerRunDetails | null,
    callbackTimeStamp: Moment,
  ): boolean => {
    if (!latestRun) {
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
        if (isJobInBetweenRunningJob(latestRun, callbackTimeStamp)) {
          await claimAndEnqueueJob(createdJob);
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
