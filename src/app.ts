import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { Logger } from './common/logger';
import { errorHandler } from './middlewares/error_handler';
import { notFound } from './middlewares/not_found';
import { RequestContext } from './middlewares/request_context';
import { requestLogger } from './middlewares/request_logger';
import { otelRequestEnricher } from './middlewares/otel_enricher';
import { setupRoutes } from './startup/routes';

export function buildApp() {
  const app = express();
  app.use(RequestContext.middleware);
  app.use(cors());
  app.use(express.json());
  app.use(otelRequestEnricher);
  app.use(
    morgan('tiny', {
      stream: {
        write: (message) =>
          Logger.info({
            message: message.trim(),
          }),
      },
    }),
  );
  app.use(requestLogger);
  setupRoutes(app);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
