import { isEmpty } from 'lodash';
import { JobModel } from '../models/job.model';
import { Job, JobDocument, JobStatus } from '../types';

const createJob = async (job: {
  url: string;
  payload: object;
  callbackTime: Date;
  status: string;
  retryCount: number;
  jobId: string;
}): Promise<JobDocument> => {
  const createdJobDocument = await JobModel.create(job);
  return {
    jobId: createdJobDocument.jobId,
    url: createdJobDocument.url,
    status: createdJobDocument.status,
    callbackTime: createdJobDocument.callbackTime,
    payload: createdJobDocument.payload,
  };
};

const findJobById = async (jobId: string): Promise<Job | null> => {
  return await JobModel.findOne({ jobId });
};

const updateJobStatus = async (
  jobId: string,
  status: JobStatus,
): Promise<Job | null> => {
  return JobModel.findOneAndUpdate({ jobId }, { status });
};

const updateJobBulk = async (jobIds: string[], status: JobStatus) => {
  return JobModel.updateMany({ jobId: { $in: jobIds } }, { status });
};

const getScheduledJobBetweenTimeRange = async (
  startTime: Date,
  endTime: Date,
): Promise<JobDocument[]> => {
  const jobs = await JobModel.find({
    callbackTime: { $gt: startTime, $lte: endTime },
    status: JobStatus.SCHEDULED,
  });
  if (isEmpty(jobs)) {
    return [];
  }
  return jobs.map((job) => {
    return {
      jobId: job.jobId,
      status: job.status,
      url: job.url,
      callbackTime: job.callbackTime,
      payload: job.payload,
    };
  });
};

export const JobRespository = {
  createJob,
  findJobById,
  updateJobStatus,
  getScheduledJobBetweenTimeRange,
  updateJobBulk,
};
