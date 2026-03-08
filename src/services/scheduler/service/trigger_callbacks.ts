import { isEmpty } from 'lodash';
import moment from 'moment';
import { Logger } from '../../../common/logger';
import { enqueueJob } from '../../../sqs/producers/job_processor';
import { THRESHOLD_SECONDS } from '../constants';
import { JobRepository } from '../repositories/job.repository';
import { JobSchedulerRunDetailsRepository } from '../repositories/job_run_details.repository';
import { JobDocument, JobSchedulerRunStatus, JobStatus } from '../types';

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

const enqueueJobsAndLogFailures = async (
  jobs: JobDocument[],
): Promise<void> => {
  const results = await Promise.allSettled(
    jobs.map((job) =>
      enqueueJobWithDelay(job.jobId, job.version, job.callbackTime),
    ),
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
      message: 'Some jobs failed to enqueue to SQS',
      num_key1: 'failedCount',
      num_key1_value: failedJobIds.length,
      key1: 'failedJobIds',
      key1_value: JSON.stringify(failedJobIds),
    });
  }
};

const triggerCallbacks = async (): Promise<void> => {
  const getLastCompletedJobTime = (): Date => {
    if (isEmpty(lastCompletedRunDetails)) {
      return moment('2025-10-07').toDate();
    }
    return lastCompletedRunDetails.endTimeStamp;
  };

  const lastCompletedRunDetails =
    await JobSchedulerRunDetailsRepository.getLastRunByStatus(
      JobSchedulerRunStatus.COMPLETED,
    );
  const startTime = getLastCompletedJobTime();
  const endTime = moment().add(THRESHOLD_SECONDS, 'seconds').toDate();
  const jobsBetweenRange = await JobRepository.getScheduledJobBetweenTimeRange(
    startTime,
    endTime,
  );
  Logger.info({
    key1: 'startTime',
    key1_value: startTime.toISOString(),
    key2: 'endTime',
    key2_value: endTime.toISOString(),
    num_key1: 'size of jobs',
    num_key1_value: jobsBetweenRange?.length ?? 0,
  });
  await Promise.all([
    JobSchedulerRunDetailsRepository.createRunDetails(endTime),
    JobRepository.updateJobBulk(
      jobsBetweenRange.map((job) => job.jobId),
      JobStatus.IN_PROGRESS,
    ),
  ]);
  await enqueueJobsAndLogFailures(jobsBetweenRange);
  await JobSchedulerRunDetailsRepository.updateRunStatus(
    startTime,
    JobSchedulerRunStatus.COMPLETED,
  );
};

export { triggerCallbacks };
