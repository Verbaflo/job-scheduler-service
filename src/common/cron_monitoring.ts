import {
  Counter,
  Gauge,
  Histogram,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  context,
  createContextKey,
  metrics,
  trace,
} from '@opentelemetry/api';

const CRON_INSTRUMENTATION_NAME = 'cron';
const SPAN_NAME_PREFIX = 'cron';
const METRIC_RUNS = 'cron.job.runs';
const METRIC_DURATION = 'cron.job.duration';
const METRIC_LAST_SUCCESS = 'cron.job.last_success';
const LABEL_JOB = 'job';
const LABEL_OUTCOME = 'outcome';
const ATTR_JOB = 'cron.job';
const ATTR_OUTCOME = 'cron.outcome';
const ATTR_DURATION_MS = 'cron.duration_ms';
const ATTR_REQUEST_ID = 'http.request_id';
const EVENT_EXCEPTION = 'exception';
const ATTR_EXCEPTION_TYPE = 'exception.type';
const ATTR_EXCEPTION_MESSAGE = 'exception.message';
const EXCEPTION_MESSAGE_MAX_CHARACTERS = 2000;
const SLOW_RUN_THRESHOLD_SECONDS = 300;
const MILLISECONDS_PER_SECOND = 1000;
const SUPPRESS_TRACING_CONTEXT_KEY = createContextKey(
  'OpenTelemetry SDK Context Key SUPPRESS_TRACING',
);

type CronOutcome = 'succeeded' | 'failed' | 'skipped';
type CronSpanAttributes = Record<string, string | number | boolean>;

const CRON_RUN_SKIPPED = Symbol('cron_run_skipped');

interface MonitoredCronOptions<Result> {
  requestId?: string;
  describeResult?: (result: Result) => CronSpanAttributes;
}

interface CronInstruments {
  runsCounter: Counter;
  durationHistogram: Histogram;
  lastSuccessGauge: Gauge;
}

let cachedInstruments: CronInstruments | undefined;

// Instruments made before the meter provider is set stay no-ops, so build them on the first run.
const getInstruments = (): CronInstruments => {
  if (cachedInstruments) return cachedInstruments;
  const meter = metrics.getMeter(CRON_INSTRUMENTATION_NAME);
  cachedInstruments = {
    runsCounter: meter.createCounter(METRIC_RUNS, {
      description: 'Cron job runs by outcome',
    }),
    durationHistogram: meter.createHistogram(METRIC_DURATION, {
      description: 'Cron job run time',
      unit: 's',
    }),
    lastSuccessGauge: meter.createGauge(METRIC_LAST_SUCCESS, {
      description: 'Unix time of the last successful cron job run',
      unit: 's',
    }),
  };
  return cachedInstruments;
};
const tracer = trace.getTracer(CRON_INSTRUMENTATION_NAME);

const recordRunMetrics = (
  jobName: string,
  outcome: CronOutcome,
  durationSeconds: number,
): void => {
  const { runsCounter, durationHistogram, lastSuccessGauge } = getInstruments();
  runsCounter.add(1, { [LABEL_JOB]: jobName, [LABEL_OUTCOME]: outcome });
  durationHistogram.record(durationSeconds, { [LABEL_JOB]: jobName });
  if (outcome !== 'succeeded') return;
  lastSuccessGauge.record(Date.now() / MILLISECONDS_PER_SECOND, {
    [LABEL_JOB]: jobName,
  });
};

const isNotableRun = (outcome: CronOutcome, durationSeconds: number): boolean =>
  outcome === 'failed' || durationSeconds > SLOW_RUN_THRESHOLD_SECONDS;

interface NotableRun {
  jobName: string;
  outcome: CronOutcome;
  startedAtMs: number;
  endedAtMs: number;
  requestId?: string;
  failure?: unknown;
  resultAttributes: CronSpanAttributes;
}

const emitNotableRunSpan = (run: NotableRun): void => {
  const span = tracer.startSpan(
    `${SPAN_NAME_PREFIX} ${run.jobName}`,
    {
      kind: SpanKind.INTERNAL,
      startTime: run.startedAtMs,
      attributes: {
        [ATTR_JOB]: run.jobName,
        [ATTR_OUTCOME]: run.outcome,
        [ATTR_DURATION_MS]: run.endedAtMs - run.startedAtMs,
        ...(run.requestId ? { [ATTR_REQUEST_ID]: run.requestId } : {}),
        ...run.resultAttributes,
      },
    },
    ROOT_CONTEXT,
  );
  if (run.failure !== undefined) {
    const failure =
      run.failure instanceof Error
        ? run.failure
        : new Error(String(run.failure));
    const message = failure.message.slice(0, EXCEPTION_MESSAGE_MAX_CHARACTERS);
    span.addEvent(EVENT_EXCEPTION, {
      [ATTR_EXCEPTION_TYPE]: failure.name,
      [ATTR_EXCEPTION_MESSAGE]: message,
    });
    span.setStatus({ code: SpanStatusCode.ERROR, message });
  }
  span.end(run.endedAtMs);
};

const runWithoutChildSpans = <Result>(job: () => Promise<Result>) =>
  context.with(
    context.active().setValue(SUPPRESS_TRACING_CONTEXT_KEY, true),
    job,
  );

const describeOutcome = <Returned>(
  result: Returned,
  options: MonitoredCronOptions<Exclude<Returned, typeof CRON_RUN_SKIPPED>>,
): CronSpanAttributes =>
  result === CRON_RUN_SKIPPED || !options.describeResult
    ? {}
    : options.describeResult(
        result as Exclude<Returned, typeof CRON_RUN_SKIPPED>,
      );

const runMonitoredCron = async <Returned>(
  jobName: string,
  job: () => Promise<Returned>,
  options: MonitoredCronOptions<
    Exclude<Returned, typeof CRON_RUN_SKIPPED>
  > = {},
): Promise<Returned> => {
  const startedAtMs = Date.now();
  const finish = (
    outcome: CronOutcome,
    failure?: unknown,
    resultAttributes: CronSpanAttributes = {},
  ): void => {
    const endedAtMs = Date.now();
    const durationSeconds = (endedAtMs - startedAtMs) / MILLISECONDS_PER_SECOND;
    recordRunMetrics(jobName, outcome, durationSeconds);
    if (!isNotableRun(outcome, durationSeconds)) return;
    emitNotableRunSpan({
      jobName,
      outcome,
      startedAtMs,
      endedAtMs,
      requestId: options.requestId,
      failure,
      resultAttributes,
    });
  };
  try {
    const result = await runWithoutChildSpans(job);
    finish(
      result === CRON_RUN_SKIPPED ? 'skipped' : 'succeeded',
      undefined,
      describeOutcome(result, options),
    );
    return result;
  } catch (error) {
    finish('failed', error);
    throw error;
  }
};

export { CRON_RUN_SKIPPED, runMonitoredCron };
export type { CronOutcome, CronSpanAttributes, MonitoredCronOptions };
