import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { metrics } from '@opentelemetry/sdk-node';

const METRICS_ENDPOINT_VARIABLE = 'OTLP_METRICS_ENDPOINT';
const METRICS_EXPORT_INTERVAL_MILLISECONDS = 60_000;

const buildMetricReaderFromEnv = ():
  | metrics.PeriodicExportingMetricReader
  | undefined => {
  const metricsEndpoint = process.env[METRICS_ENDPOINT_VARIABLE];
  if (!metricsEndpoint) return undefined;
  return new metrics.PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: metricsEndpoint }),
    exportIntervalMillis: METRICS_EXPORT_INTERVAL_MILLISECONDS,
  });
};

export { buildMetricReaderFromEnv };
