import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { Logger } from './common/logger';

let sdk: NodeSDK | null = null;

export const initializeTracing = async () => {
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
            process.env.JAEGER_SERVICE_VERSION || process.env.npm_package_version || '1.0.0';

        Logger.info({
            message: `[OTEL] Initializing tracing with endpoint: ${JAEGER_ENDPOINT}`,
        });

        const exporter = new OTLPTraceExporter({
            url: JAEGER_ENDPOINT,
        });

        sdk = new NodeSDK({
            resource: new Resource({
                'service.name': SERVICE_NAME,
                'service.version': SERVICE_VERSION,
            }),
            traceExporter: exporter,
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

export const shutdownTracing = async () => {
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

export const getTracer = () => {
    return trace.getTracer('job-scheduler-service');
};

export async function withSpan<T>(
    name: string,
    fn: (span: import('@opentelemetry/api').Span) => Promise<T> | T,
    attributes?: Record<string, string | number | boolean>
): Promise<T> {
    const tracer = getTracer();
    return await tracer.startActiveSpan(name, async (span) => {
        try {
            if (attributes) {
                span.setAttributes(attributes);
            }
            const result = await fn(span);
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
        } catch (error: any) {
            span.recordException(error);
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error?.message || String(error),
            });
            throw error;
        } finally {
            span.end();
        }
    });
}

export { sdk };


