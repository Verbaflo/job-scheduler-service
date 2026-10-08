import { Span, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';

const CRON_TRACER_NAME = 'cron';
const CRON_SPAN_PREFIX = 'cron';
const ATTR_JOB = 'cron.job';
const ATTR_OUTCOME = 'cron.outcome';
const ATTR_SKIP_REASON = 'cron.skip_reason';
const ATTR_REQUEST_ID = 'http.request_id';
const OUTCOME_SUCCEEDED = 'succeeded';
const OUTCOME_FAILED = 'failed';
const OUTCOME_SKIPPED = 'skipped';
const SKIP_REASON_LOCK_HELD = 'lock_held';

type CronSpanAttributes = Record<string, string | number | boolean>;

interface TracedCronOptions<Result> {
  requestId?: string;
  describeResult?: (result: Result) => CronSpanAttributes;
}

const tracer = trace.getTracer(CRON_TRACER_NAME);

const markCronSkippedLockHeld = (): void => {
  const span = trace.getActiveSpan();
  if (!span) return;
  span.setAttribute(ATTR_OUTCOME, OUTCOME_SKIPPED);
  span.setAttribute(ATTR_SKIP_REASON, SKIP_REASON_LOCK_HELD);
};

const recordFailure = (span: Span, error: unknown): void => {
  const failure = error instanceof Error ? error : new Error(String(error));
  span.recordException(failure);
  span.setAttribute(ATTR_OUTCOME, OUTCOME_FAILED);
  span.setStatus({ code: SpanStatusCode.ERROR, message: failure.message });
};

const runTracedCron = async <Result>(
  jobName: string,
  job: () => Promise<Result>,
  options: TracedCronOptions<Result> = {},
): Promise<Result> => {
  const spanName = `${CRON_SPAN_PREFIX} ${jobName}`;
  return tracer.startActiveSpan(
    spanName,
    { kind: SpanKind.INTERNAL },
    async (span) => {
      span.setAttribute(ATTR_JOB, jobName);
      span.setAttribute(ATTR_OUTCOME, OUTCOME_SUCCEEDED);
      if (options.requestId) span.setAttribute(ATTR_REQUEST_ID, options.requestId);
      try {
        const result = await job();
        if (options.describeResult) {
          span.setAttributes(options.describeResult(result));
        }
        return result;
      } catch (error) {
        recordFailure(span, error);
        throw error;
      } finally {
        span.end();
      }
    },
  );
};

export { markCronSkippedLockHeld, runTracedCron };
export type { CronSpanAttributes, TracedCronOptions };
