import { startJobProcessorCron } from './job_processor.cron';
import { startReconcileJobsCron } from './reconcile_jobs.cron';

const startCrons = () => {
  startJobProcessorCron();
  startReconcileJobsCron();
};

export { startCrons };
