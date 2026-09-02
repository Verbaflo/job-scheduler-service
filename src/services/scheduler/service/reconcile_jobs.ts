import moment from 'moment';
import { Logger } from '../../../common/logger';
import {
  RECONCILE_MAX_STALENESS_SECONDS,
  RECONCILE_STALE_GRACE_SECONDS,
} from '../constants';
import { JobRepository } from '../repositories/job.repository';
import { dispatchJobs } from './job_dispatch';

const reconcileStaleJobs = async (): Promise<void> => {
  const from = moment()
    .subtract(RECONCILE_MAX_STALENESS_SECONDS, 'seconds')
    .toDate();
  const to = moment()
    .subtract(RECONCILE_STALE_GRACE_SECONDS, 'seconds')
    .toDate();
  const staleJobs = await JobRepository.getStaleScheduledJobs(from, to);
  Logger.info({
    message: 'reconcileStaleJobs found stale scheduled jobs',
    num_key1: 'count',
    num_key1_value: staleJobs.length,
  });
  await dispatchJobs(staleJobs);
};

export { reconcileStaleJobs };
