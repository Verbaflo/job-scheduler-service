import { isEmpty } from 'lodash';
import moment from 'moment';
import { LockUtils } from '../../../common/lock_utils';
import { enqueueJob } from '../../../sqs/producers/job_processor';
import { LOCK_TTL_IN_SECONDS } from '../constants';
import { JobNotFoundError } from '../errors/job_not_found_error';
import { JobRespository } from '../repositories/job.repository';
import { JobSchedulerRunDetailsRepository } from '../repositories/job_run_details.repository';
import { JobStatus, ScheduleJobRequest, ScheduleJobResponse } from '../types';

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

const scheduleJob = async (
  request: ScheduleJobRequest,
): Promise<ScheduleJobResponse> => {
  const isJobInBetweenRunningJob = () => {
    if (isEmpty(latestRun)) {
      return false;
    }
    const { endTimeStamp } = latestRun;
    return moment(callbackTimeStamp).isSameOrBefore(moment(endTimeStamp));
  };

  const { delayInSeconds, url, payload, jobId } = request;
  await LockUtils.acquireLock(jobId, LOCK_TTL_IN_SECONDS);
  const callbackTimeStamp = moment().add(delayInSeconds, 'second');
  const createdJob = await JobRespository.createOrUpdateJob({
    url,
    payload,
    callbackTime: callbackTimeStamp.toDate(),
    status: JobStatus.SCHEDULED,
    retryCount: 0,
    jobId,
  });
  const latestRun = await JobSchedulerRunDetailsRepository.getLastRunDetails();
  const { callbackTime } = createdJob;
  if (isJobInBetweenRunningJob()) {
    const updatedJob = await JobRespository.updateJobStatus(
      jobId,
      JobStatus.IN_PROGRESS,
    );
    if (isEmpty(updatedJob)) {
      throw new JobNotFoundError(jobId);
    }
    const { version } = updatedJob;
    enqueueJobWithDelay(jobId, version, callbackTime);
  }
  await LockUtils.releaseLock(jobId);
  return createdJob;
};

export { scheduleJob };
