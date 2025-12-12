import { isEmpty } from 'lodash';
import { Logger } from '../../../common/logger';
import { JobRespository } from '../repositories/job.repository';
import { CancelJobRequest, CancelJobResponse, JobStatus } from '../types';

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

export { cancelJob };
