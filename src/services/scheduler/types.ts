interface ScheduleJobRequest {
  url: string;
  payload: Object;
  delayInSeconds: number;
  source: string;
  jobId: string;
}

enum JobStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  IN_PROGRESS = 'inProgress',
  SCHEDULED = 'scheduled',
}

interface Job extends Document {
  jobId: string;
  url: string;
  payload: object;
  status: JobStatus;
  callbackTime: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface JobDocument {
  jobId: string;
  url: string;
  status: JobStatus;
  callbackTime: Date;
  payload: object;
}

enum JobSchedulerRunStatus {
  IN_PROGRESS = 'inProgress',
  COMPLETED = 'completed',
}

interface JobSchedulerRunDetails {
  endTimeStamp: Date;
  status: JobSchedulerRunStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface JobSchedulerRunDetailsDocument {
  endTimeStamp: Date;
  status: JobSchedulerRunStatus;
  createdAt: Date;
  updatedAt: Date;
  runId: string;
}

type ScheduleJobResponse = JobDocument;

interface CancelJobRequest {
  jobId: string;
}

interface CancelJobResponse {
  success: boolean;
}

export {
  CancelJobRequest,
  CancelJobResponse,
  Job,
  JobDocument,
  JobSchedulerRunDetails,
  JobSchedulerRunDetailsDocument,
  JobSchedulerRunStatus,
  JobStatus,
  ScheduleJobRequest,
  ScheduleJobResponse,
};
