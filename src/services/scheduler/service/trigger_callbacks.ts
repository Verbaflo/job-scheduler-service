import moment from 'moment';
import { Logger } from '../../../common/logger';
import { THRESHOLD_SECONDS } from '../constants';
import { JobRepository } from '../repositories/job.repository';
import { JobSchedulerRunDetailsRepository } from '../repositories/job_run_details.repository';
import { JobSchedulerRunStatus } from '../types';
import { dispatchJobs } from './job_dispatch';

const RUN_DETAILS_FALLBACK_START = '2025-10-07';

const triggerCallbacks = async (): Promise<void> => {
  const lastCompletedRunDetails =
    await JobSchedulerRunDetailsRepository.getLastRunByStatus(
      JobSchedulerRunStatus.COMPLETED,
    );
  const startTime = lastCompletedRunDetails
    ? lastCompletedRunDetails.endTimeStamp
    : moment(RUN_DETAILS_FALLBACK_START).toDate();
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
  await JobSchedulerRunDetailsRepository.createRunDetails(endTime);
  await dispatchJobs(jobsBetweenRange);
  await JobSchedulerRunDetailsRepository.updateRunStatus(
    startTime,
    JobSchedulerRunStatus.COMPLETED,
  );
};

export { triggerCallbacks };
