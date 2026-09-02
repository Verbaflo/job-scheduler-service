import { PRIMARY_PREFERRED_READ } from '../constants';
import { JobSchedulerRunDetailsModel } from '../models/job_scheduler_run_details.model';
import {
  JobSchedulerRunDetails,
  JobSchedulerRunDetailsDocument,
  JobSchedulerRunStatus,
} from '../types';

const getLastRunByStatus = async (
  status: JobSchedulerRunStatus,
): Promise<JobSchedulerRunDetails | null> => {
  return JobSchedulerRunDetailsModel.findOne({
    status,
  })
    .sort({ createdAt: -1 })
    .read(PRIMARY_PREFERRED_READ);
};

const getLastRunDetails = async (): Promise<JobSchedulerRunDetails | null> => {
  return JobSchedulerRunDetailsModel.findOne({})
    .sort({ createdAt: -1 })
    .read(PRIMARY_PREFERRED_READ);
};

const createRunDetails = async (
  endTime: Date,
): Promise<JobSchedulerRunDetailsDocument> => {
  const result = await JobSchedulerRunDetailsModel.create({
    status: JobSchedulerRunStatus.IN_PROGRESS,
    endTimeStamp: endTime,
  });
  return {
    runId: result._id.toString(),
    endTimeStamp: result.endTimeStamp,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
    status: result.status,
  };
};

const updateRunStatus = async (
  endTimeStamp: Date,
  status: JobSchedulerRunStatus,
) => {
  await JobSchedulerRunDetailsModel.updateMany(
    {
      endTimeStamp: { $gte: endTimeStamp },
      status: JobSchedulerRunStatus.IN_PROGRESS,
    },
    { status },
  );
};

export const JobSchedulerRunDetailsRepository = {
  getLastRunByStatus,
  createRunDetails,
  updateRunStatus,
  getLastRunDetails,
};
