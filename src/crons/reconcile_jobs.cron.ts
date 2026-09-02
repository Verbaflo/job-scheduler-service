import cron from 'node-cron';
import { Logger } from '../common/logger';
import { RequestContext } from '../middlewares/request_context';
import { RECONCILE_CRON_SCHEDULE } from '../services/scheduler/constants';
import { SchedulerService } from '../services/scheduler/service';

const startReconcileJobsCron = () => {
  cron.schedule(RECONCILE_CRON_SCHEDULE, async () => {
    const requestId = crypto.randomUUID();
    RequestContext.runWithRequestId(requestId, async () => {
      const startedAt = new Date().toISOString();
      Logger.info({
        message: 'reconcileJobsCron started',
        key1: 'startedAt',
        key1_value: startedAt,
      });
      try {
        await SchedulerService.reconcileStaleJobs();
      } catch (err: any) {
        Logger.error({
          message: 'reconcileJobsCron failed',
          error_message: err?.message,
        });
      }
      Logger.info({
        message: 'reconcileJobsCron completed',
        key1: 'startedAt',
        key1_value: startedAt,
      });
    });
  });
};

export { startReconcileJobsCron };
