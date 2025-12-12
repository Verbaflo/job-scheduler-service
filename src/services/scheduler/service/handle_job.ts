import { isEmpty } from 'lodash';
import { HttpClient } from '../../../common/http_client';
import { Logger } from '../../../common/logger';
import { JobRespository } from '../repositories/job.repository';
import { JobStatus } from '../types';

const handleJob = async (jobId: string, version: number): Promise<void> => {
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
  const { status, url, payload, version: currentVersion } = jobDetails;
  if (currentVersion != version) {
    Logger.info({
      message: 'incoming job version does not match current job version',
      num_key1: 'version from event',
      num_key1_value: version,
      num_key2: 'current version',
      num_key3_value: currentVersion,
    });
    return;
  }
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

export { handleJob };
