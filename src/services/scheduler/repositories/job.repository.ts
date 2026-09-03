import { isEmpty } from 'lodash';
import { PRIMARY_PREFERRED_READ } from '../constants';
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
  return buildJobDocument(createdJobDocument);
};

const findJobById = async (jobId: string): Promise<JobDocument | undefined> => {
  const job = await JobModel.findOne({ jobId }).read(PRIMARY_PREFERRED_READ);
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

const claimScheduledJob = async (
  jobId: string,
): Promise<JobDocument | null> => {
  const job = await JobModel.findOneAndUpdate(
    { jobId, status: JobStatus.SCHEDULED },
    { $set: { status: JobStatus.IN_PROGRESS } },
    { new: true },
  );
  return job ? buildJobDocument(job) : null;
};

const revertJobToScheduled = async (jobId: string): Promise<void> => {
  await JobModel.updateOne(
    { jobId, status: JobStatus.IN_PROGRESS },
    { $set: { status: JobStatus.SCHEDULED } },
  );
};

const getScheduledJobBetweenTimeRange = async (
  startTime: Date,
  endTime: Date,
): Promise<JobDocument[]> => {
  const jobs = await JobModel.find({
    callbackTime: { $gt: startTime, $lte: endTime },
    status: JobStatus.SCHEDULED,
  }).read(PRIMARY_PREFERRED_READ);
  if (isEmpty(jobs)) {
    return [];
  }
  return jobs.map((job) => buildJobDocument(job));
};

const getStaleScheduledJobs = async (
  from: Date,
  to: Date,
): Promise<JobDocument[]> => {
  const jobs = await JobModel.find({
    callbackTime: { $gte: from, $lte: to },
    status: JobStatus.SCHEDULED,
  }).read(PRIMARY_PREFERRED_READ);
  if (isEmpty(jobs)) {
    return [];
  }
  return jobs.map((job) => buildJobDocument(job));
};

export const JobRepository = {
  createOrUpdateJob,
  findJobById,
  updateJobStatus,
  claimScheduledJob,
  revertJobToScheduled,
  getScheduledJobBetweenTimeRange,
  getStaleScheduledJobs,
};
