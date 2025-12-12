import { isEmpty } from 'lodash';
import moment from 'moment';
import { Logger } from '../../../common/logger';
import { enqueueJob } from '../../../sqs/producers/job_processor';
import { THRESHOLD_SECONDS } from '../constants';
import { JobRespository } from '../repositories/job.repository';
import { JobSchedulerRunDetailsRepository } from '../repositories/job_run_details.repository';
import { JobSchedulerRunStatus, JobStatus } from '../types';

const enqueueJobWithDelay = (
  jobId: string,
  version: number,
  callbackTime: Date,
) => {
  const delaySeconds =
    moment(callbackTime).diff(moment(), 'seconds') > 0
      ? moment(callbackTime).diff(moment(), 'seconds')
      : 0;
  enqueueJob({ jobId, version }, delaySeconds);
};

const triggerCallbacks = async () => {
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
  const jobsBetweenRange = await JobRespository.getScheduledJobBetweenTimeRange(
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
    JobRespository.updateJobBulk(
      jobsBetweenRange.map((job) => job.jobId),
      JobStatus.IN_PROGRESS,
    ),
  ]);
  jobsBetweenRange?.forEach((job) => {
    enqueueJobWithDelay(job.jobId, job.version, job.callbackTime);
  });
  await JobSchedulerRunDetailsRepository.updateRunStatus(
    startTime,
    JobSchedulerRunStatus.COMPLETED,
  );
};

export { triggerCallbacks };
