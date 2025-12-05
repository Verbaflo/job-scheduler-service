import mongoose, { Schema } from 'mongoose';
import { Job, JobStatus } from '../types';

const JobSchema = new Schema<Job>(
  {
    jobId: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    payload: {
      type: Object,
    },
    status: {
      type: String,
      enum: JobStatus,
      required: true,
    },
    callbackTime: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export const JobModel = mongoose.model<Job>(
  'scheduled_internal_job',
  JobSchema,
);
