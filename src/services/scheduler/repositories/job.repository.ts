import { isEmpty } from 'lodash';
import { JobModel } from '../models/job.model';
import { Job, JobDocument, JobStatus } from '../types';

const buildJobDocument = (job: any): JobDocument => {
  return {
    jobId: job.jobId,
    url: job.url,
    status: job.status,
    callbackTime: job.callbackTime,
    payload: job.payload,
    version: job.version,
  };
};

const createOrUpdateJob = async (job: {
  url: string;
  payload: object;
  callbackTime: Date;
  status: string;
  retryCount: number;
  jobId: string;
}): Promise<JobDocument> => {
  const createdJobDocument = await JobModel.findOneAndUpdate(
    { jobId: job.jobId },
    { $set: job, $inc: { version: 1 } },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  );
  return buildJobDocument(job);
};

const findJobById = async (jobId: string): Promise<JobDocument | undefined> => {
  const job = await JobModel.findOne({ jobId });
  if (isEmpty(job)) {
    return undefined;
  }
  return buildJobDocument(job);
};

const updateJobStatus = async (
  jobId: string,
  status: JobStatus,
): Promise<Job | null> => {
  return JobModel.findOneAndUpdate({ jobId }, { $set: { status } });
};

const updateJobBulk = async (jobIds: string[], status: JobStatus) => {
  return JobModel.updateMany({ jobId: { $in: jobIds } }, { $set: { status } });
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
  return jobs.map((job) => buildJobDocument(job));
};

export const JobRespository = {
  createOrUpdateJob,
  findJobById,
  updateJobStatus,
  getScheduledJobBetweenTimeRange,
  updateJobBulk,
};
