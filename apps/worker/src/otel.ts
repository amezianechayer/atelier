import type { Env } from '@atelier/config';

/**
 * OpenTelemetry (SPEC.md §5) : export OTLP strictement optionnel.
 * Imports dynamiques : zéro coût quand OTEL_EXPORTER_OTLP_ENDPOINT est vide.
 */
export async function startOtel(env: Env): Promise<void> {
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT === '') return;

  const [{ NodeSDK }, { OTLPTraceExporter }] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
  ]);

  const sdk = new NodeSDK({
    serviceName: 'atelier-worker',
    traceExporter: new OTLPTraceExporter({
      url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    }),
  });
  sdk.start();

  const shutdown = () => {
    void sdk.shutdown();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
