import { isEmpty, isNil } from 'lodash';
import { isValidObjectId } from 'mongoose';
import { HttpError } from '../../common/http_error';
import { CancelJobRequest, ScheduleJobRequest } from './types';

const validateScheduleJobRequest = (request: ScheduleJobRequest) => {
  const { url, delayInSeconds, jobId } = request;
  if (isEmpty(jobId)) {
    throw new HttpError(400, 'jobId is required');
  }
  if (isEmpty(url)) {
    throw new HttpError(400, 'url is required');
  }
  if (isNil(delayInSeconds)) {
    throw new HttpError(400, 'delayInSeconds is required');
  }
  if (delayInSeconds <= 0) {
    throw new HttpError(400, 'callback should be in future');
  }
};

const validateCancelJobRequest = (request: CancelJobRequest) => {
  const { jobId } = request;
  if (isEmpty(jobId) || !isValidObjectId(jobId)) {
    throw new HttpError(400, 'job id is not valid');
  }
};

export { validateCancelJobRequest, validateScheduleJobRequest };
