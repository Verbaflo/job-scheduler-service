import { SchedulerService } from '../../../services/scheduler/service';
import { JobProcessorInput } from '../../types';

const handleJobProcessor = async (input: JobProcessorInput): Promise<void> => {
  SchedulerService.handleJob(input.jobId, input.version);
};

export { handleJobProcessor };
