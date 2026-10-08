import type { tracing } from '@opentelemetry/sdk-node';

type SpanExporter = tracing.SpanExporter;
type ReadableSpan = tracing.ReadableSpan;
type ExportResultCallback = Parameters<SpanExporter['export']>[1];
type AttributeBag = Record<string, unknown>;

const EXPORT_RESULT_SUCCESS = 0;
const EXPORT_RESULT_FAILED = 1;
const TRUNCATION_MARKER = '...[truncated]';
const SPAN_ENVELOPE_BYTES = 1024;
const ATTRIBUTE_ENVELOPE_BYTES = 16;
const DEFAULT_MAX_EXPORT_BATCH_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_SPAN_BYTES = 1792 * 1024;

interface ByteLimitedSpanExporterOptions {
  maxBatchBytes?: number;
  maxSpanBytes?: number;
  onSpanTrimmed?: (spanName: string, originalSpanBytes: number) => void;
}

const readByteLimitFromEnv = (
  variableName: string,
  defaultBytes: number,
): number => {
  const parsedBytes = Number(process.env[variableName]);
  return Number.isFinite(parsedBytes) && parsedBytes > 0
    ? parsedBytes
    : defaultBytes;
};

const attributeBagsOf = (span: ReadableSpan): AttributeBag[] => {
  const eventBags = span.events.map((event) => event.attributes ?? {});
  return [span.attributes as AttributeBag, ...eventBags];
};

const estimateAttributeBagBytes = (bag: AttributeBag): number =>
  Object.entries(bag).reduce((totalBytes, [key, value]) => {
    const valueBytes =
      typeof value === 'string'
        ? Buffer.byteLength(value)
        : Buffer.byteLength(JSON.stringify(value) ?? '');
    return (
      totalBytes +
      Buffer.byteLength(key) +
      valueBytes +
      ATTRIBUTE_ENVELOPE_BYTES
    );
  }, 0);

const estimateSpanBytes = (span: ReadableSpan): number =>
  attributeBagsOf(span).reduce(
    (totalBytes, bag) => totalBytes + estimateAttributeBagBytes(bag),
    SPAN_ENVELOPE_BYTES + Buffer.byteLength(span.name),
  );

interface TrimTarget {
  bag: AttributeBag;
  key: string;
  length: number;
}

const findLargestTrimmableString = (span: ReadableSpan): TrimTarget | null =>
  attributeBagsOf(span).reduce<TrimTarget | null>((largest, bag) => {
    return Object.entries(bag).reduce<TrimTarget | null>(
      (largestInBag, [key, value]) => {
        if (typeof value !== 'string' || value === TRUNCATION_MARKER) {
          return largestInBag;
        }
        if (largestInBag && value.length <= largestInBag.length) {
          return largestInBag;
        }
        return { bag, key, length: value.length };
      },
      largest,
    );
  }, null);

const shrinkTarget = (target: TrimTarget, overflowBytes: number): void => {
  const value = String(target.bag[target.key]);
  const keepLength = Math.max(
    0,
    value.length - overflowBytes - TRUNCATION_MARKER.length,
  );
  target.bag[target.key] = value.slice(0, keepLength) + TRUNCATION_MARKER;
};

class ByteLimitedSpanExporter implements SpanExporter {
  private readonly maxBatchBytes: number;
  private readonly maxSpanBytes: number;

  constructor(
    private readonly wrappedExporter: SpanExporter,
    private readonly options: ByteLimitedSpanExporterOptions = {},
  ) {
    this.maxBatchBytes =
      options.maxBatchBytes ??
      readByteLimitFromEnv(
        'OTLP_MAX_EXPORT_BATCH_BYTES',
        DEFAULT_MAX_EXPORT_BATCH_BYTES,
      );
    this.maxSpanBytes =
      options.maxSpanBytes ??
      readByteLimitFromEnv('OTLP_MAX_SPAN_BYTES', DEFAULT_MAX_SPAN_BYTES);
  }

  export(spans: ReadableSpan[], resultCallback: ExportResultCallback): void {
    spans.forEach((span) => this.trimSpanWithinByteCap(span));
    const chunks = this.splitIntoByteBoundedChunks(spans);
    this.exportChunksInOrder(chunks, resultCallback);
  }

  shutdown(): Promise<void> {
    return this.wrappedExporter.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.wrappedExporter.forceFlush?.() ?? Promise.resolve();
  }

  private exportChunksInOrder(
    chunks: ReadableSpan[][],
    resultCallback: ExportResultCallback,
  ): void {
    if (chunks.length === 0) {
      resultCallback({ code: EXPORT_RESULT_SUCCESS });
      return;
    }
    let pendingChunks = chunks.length;
    let failedResult: Parameters<ExportResultCallback>[0] | null = null;
    chunks.forEach((chunk) => {
      this.wrappedExporter.export(chunk, (chunkResult) => {
        if (chunkResult.code === EXPORT_RESULT_FAILED)
          failedResult = chunkResult;
        pendingChunks -= 1;
        if (pendingChunks > 0) return;
        resultCallback(failedResult ?? { code: EXPORT_RESULT_SUCCESS });
      });
    });
  }

  private trimSpanWithinByteCap(span: ReadableSpan): void {
    const originalSpanBytes = estimateSpanBytes(span);
    if (originalSpanBytes <= this.maxSpanBytes) return;
    let currentSpanBytes = originalSpanBytes;
    while (currentSpanBytes > this.maxSpanBytes) {
      const target = findLargestTrimmableString(span);
      if (!target) break;
      shrinkTarget(target, currentSpanBytes - this.maxSpanBytes);
      currentSpanBytes = estimateSpanBytes(span);
    }
    this.options.onSpanTrimmed?.(span.name, originalSpanBytes);
  }

  private splitIntoByteBoundedChunks(spans: ReadableSpan[]): ReadableSpan[][] {
    const chunks: ReadableSpan[][] = [];
    let currentChunk: ReadableSpan[] = [];
    let currentChunkBytes = 0;
    spans.forEach((span) => {
      const spanBytes = estimateSpanBytes(span);
      if (
        currentChunk.length > 0 &&
        currentChunkBytes + spanBytes > this.maxBatchBytes
      ) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentChunkBytes = 0;
      }
      currentChunk.push(span);
      currentChunkBytes += spanBytes;
    });
    if (currentChunk.length > 0) chunks.push(currentChunk);
    return chunks;
  }
}

export { ByteLimitedSpanExporter, estimateSpanBytes };
export type { ByteLimitedSpanExporterOptions };
