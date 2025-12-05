import { isEmpty } from 'lodash';
import moment from 'moment';
import { HttpClient } from '../../common/http_client';
import { Logger } from '../../common/logger';
import { enqueueJob } from '../../sqs/producers/job_processor';
import { THRESHOLD_SECONDS } from './constants';
import { JobRespository } from './repositories/job.repository';
import { JobSchedulerRunDetailsRepository } from './repositories/job_run_details.repository';
import {
  CancelJobRequest,
  CancelJobResponse,
  JobSchedulerRunStatus,
  JobStatus,
  ScheduleJobRequest,
  ScheduleJobResponse,
} from './types';

const enqueueJobWithDelay = (jobId: string, callbackTime: Date) => {
  const delaySeconds =
    moment(callbackTime).diff(moment(), 'seconds') > 0
      ? moment(callbackTime).diff(moment(), 'seconds')
      : 0;
  enqueueJob({ jobId }, delaySeconds);
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
  const callbackTimeStamp = moment().add(delayInSeconds, 'second');
  const createdJob = await JobRespository.createJob({
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
    await JobRespository.updateJobStatus(jobId, JobStatus.IN_PROGRESS);
    enqueueJobWithDelay(jobId, callbackTime);
  }
  return createdJob;
};

const handleJob = async (jobId: string): Promise<void> => {
  Logger.info({
    message: 'started processing job',
    key1: 'job',
    key1_value: jobId,
  });
  const jobDetails = await JobRespository.findJobById(jobId);
  if (isEmpty(jobDetails)) {
    Logger.error({
      key1: 'jobId',
      key1_value: jobId,
      message: 'no job details found',
    });
    return;
  }
  const { status, url, payload } = jobDetails;
  if (status === JobStatus.CANCELLED) {
    Logger.info({
      key1: 'jobId',
      key1_value: jobId,
      message: 'job has been cancelled, not proceeding further',
    });
    return;
  }
  try {
    await HttpClient.post(url, payload, {
      headers: {
        'x-idempotency-key': jobId,
        job_id: jobId,
      },
    });
    await JobRespository.updateJobStatus(jobId, JobStatus.SUCCESS);
  } catch (err: any) {
    Logger.error({
      message: 'failed to complete job',
      key1: 'job',
      key1_value: jobId,
      error_message: err.message,
    });
    await JobRespository.updateJobStatus(jobId, JobStatus.FAILED);
  }
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
    enqueueJobWithDelay(job.jobId, job.callbackTime);
  });
  await JobSchedulerRunDetailsRepository.updateRunStatus(
    startTime,
    JobSchedulerRunStatus.COMPLETED,
  );
};

const cancelJob = async (
  request: CancelJobRequest,
): Promise<CancelJobResponse> => {
  const buildResponse = (success: boolean): CancelJobResponse => {
    return { success };
  };

  const { jobId } = request;
  const job = await JobRespository.findJobById(jobId);
  if (isEmpty(job)) {
    Logger.error({
      message: 'no job found',
      key1: 'jobId',
      key1_value: jobId,
    });
    return buildResponse(false);
  }
  const { status } = job;
  if (status === JobStatus.CANCELLED) {
    Logger.error({
      message: 'job already cancelled',
      key1: 'jobId',
      key1_value: jobId,
    });
    return buildResponse(false);
  }
  if (status === JobStatus.SUCCESS) {
    Logger.error({
      message: 'completed job cannot be cancelled',
      key1: 'jobId',
      key1_value: jobId,
    });
    return buildResponse(false);
  }
  await JobRespository.updateJobStatus(jobId, JobStatus.CANCELLED);
  return {
    success: true,
  };
};

export const SchedulerService = {
  scheduleJob,
  handleJob,
  triggerCallbacks,
  cancelJob,
};
