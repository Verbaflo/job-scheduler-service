import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Logger } from '../common/logger';

let sdk: NodeSDK | null = null;

const initializeTracing = async () => {
  try {
    if (sdk) {
      return;
    }
    const JAEGER_ENDPOINT =
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
      process.env.JAEGER_ENDPOINT ||
      'http://localhost:4318/v1/traces';
    const SERVICE_NAME =
      process.env.OTEL_SERVICE_NAME ||
      process.env.JAEGER_SERVICE_NAME ||
      'job-scheduler-service';
    const SERVICE_VERSION =
      process.env.JAEGER_SERVICE_VERSION ||
      process.env.npm_package_version ||
      '1.0.0';
    const OTEL_ENVIRONMENT = process.env.OTEL_ENVIRONMENT || 'local';
    const OTEL_MAX_EXPORT_BATCH_SIZE =
      Number(process.env.OTEL_MAX_EXPORT_BATCH_SIZE) || 256;
    Logger.info({
      message: `[OTEL] Initializing tracing with endpoint: ${JAEGER_ENDPOINT}`,
    });
    const exporter = new OTLPTraceExporter({
      url: JAEGER_ENDPOINT,
    });
    // Cap the batch by span count so each OTLP request stays under CubeAPM's request byte limit.
    sdk = new NodeSDK({
      resource: new Resource({
        'service.name': SERVICE_NAME,
        'service.version': SERVICE_VERSION,
        'cube.environment': OTEL_ENVIRONMENT,
      }),
      spanProcessors: [
        new BatchSpanProcessor(exporter, {
          maxExportBatchSize: OTEL_MAX_EXPORT_BATCH_SIZE,
        }),
      ],
      instrumentations: [
        new ExpressInstrumentation(),
        new HttpInstrumentation(),
      ],
    });
    await sdk.start();
    Logger.info({
      message: `[OTEL] Tracing initialized for ${SERVICE_NAME} v${SERVICE_VERSION}`,
    });
  } catch (err: any) {
    Logger.error({
      message: '[OTEL] Error initializing tracing',
      error_message: String(err),
      error_stack: err instanceof Error ? err.stack : undefined,
    });
  }
};

const shutdownTracing = async () => {
  if (!sdk) return;
  try {
    await sdk.shutdown();
    Logger.info({ message: '[OTEL] Tracing shutdown complete' });
  } catch (err: any) {
    Logger.error({
      message: '[OTEL] Error shutting down tracing',
      error_message: String(err),
      error_stack: err instanceof Error ? err.stack : undefined,
    });
  } finally {
    sdk = null;
  }
};

export { initializeTracing, shutdownTracing };
