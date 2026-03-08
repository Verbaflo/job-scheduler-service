# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

job-scheduler-service is an Express/TypeScript service that orchestrates delayed job execution. Callers schedule jobs via REST API with a delay; the service stores them in MongoDB, enqueues them to SQS with the appropriate delay, and executes HTTP callbacks when due.

## Commands

```bash
npm run dev          # Start with ts-node-dev (hot reload)
npm run build        # Compile TypeScript to dist/
npm run start        # Build + serve production
npm run lint         # ESLint
npm run format       # Prettier --write
npm run format:check # Prettier --check
```

No test suite exists yet (`npm test` is a no-op).

## Architecture

### Job Lifecycle

1. **Schedule**: `POST /api/v1/scheduler/schedule` → validates request → acquires Redis lock on jobId → upserts job in MongoDB (status: `scheduled`) → if job falls within an active cron run window, immediately enqueues to SQS
2. **Cron trigger** (`triggerCallbacks`): Runs every minute via `node-cron`. Queries MongoDB for all `scheduled` jobs with `callbackTime` between last completed run and now + threshold. Marks them `inProgress`, enqueues each to SQS with calculated delay
3. **SQS consumer** (`handleJob`): Receives job from SQS → validates version → POSTs to callback → marks success/failed. Infrastructure errors (DB/Redis) trigger 3 retries with exponential backoff; HTTP callback failures (already retried 3× by axios-retry) mark the job as failed without consumer-level retry. Messages that exhaust retries are left for SQS redelivery → DLQ
4. **Cancel**: `POST /api/v1/scheduler/cancel` → marks job as `cancelled`; consumer skips cancelled jobs

### Key Design Patterns

- **Optimistic concurrency**: Jobs use Mongoose `versionKey` (field: `version`). SQS messages carry the version at enqueue time; consumer discards messages with stale versions
- **Distributed locking**: Redis SET NX used to prevent concurrent schedule/cancel on the same jobId
- **Run tracking**: `job_scheduler_run_details` collection tracks cron run windows (start/end timestamps) to ensure no jobs are missed between runs
- **SQS delay**: Jobs are enqueued with `DelaySeconds` calculated from `callbackTime - now`, so SQS delivers them close to the intended callback time
- **SQS consumer retry & DLQ**: Consumer retries infrastructure errors (DB, Redis, AWS SDK) 3× with exponential backoff + jitter via `retryWithBackoff` from `src/common/retry_utils.ts`. HTTP callback failures are NOT retried at consumer level (already retried 3× by axios-retry in `HttpClient`). After exhausting app-level retries, the message is left in SQS for redelivery; the SQS redrive policy moves it to DLQ after `maxReceiveCount` receives
- **Error classification**: `isRetryableError()` in `src/common/retry_utils.ts` classifies errors as retryable (infrastructure: Mongo, Redis, network) or non-retryable (application: AppError subclasses, AxiosError). Used by both `scheduleJob` and the SQS consumer

### Source Layout

```
src/
├── server.ts              # Entrypoint: init secrets → tracing → DB → Redis → crons/consumers → Express
├── app.ts                 # Express app setup (middleware stack)
├── services/scheduler/    # Core domain
│   ├── controller.ts      # Express request handlers
│   ├── service/           # Business logic (schedule, handle, cancel, triggerCallbacks)
│   ├── repositories/      # MongoDB data access (job, job_run_details)
│   ├── models/            # Mongoose schemas
│   └── types.ts           # Interfaces and enums (JobStatus, ScheduleJobRequest, etc.)
├── sqs/
│   ├── producers/         # SQS message senders
│   └── consumers/         # SQS message handlers (sqs-consumer library)
├── crons/                 # node-cron scheduled tasks
├── common/                # Logger (Pino), HttpClient (axios + retry), LockUtils, RetryUtils, errors
├── infra/                 # Redis client and service
├── middlewares/            # Error handler, request context (AsyncLocalStorage), OTel enricher
└── startup/               # DB connection, AWS secrets, tracing, route registration
```

### Environment Variables

Key env vars (loaded from `.env`, optionally overlaid from AWS Secrets Manager when `USE_AWS_SECRETS=true`):

- `MONGO_URI` — MongoDB connection string
- `REDIS_URL` — Redis connection string
- `SQS_JOB_PROCESSOR_URL` — SQS queue URL for job processing
- `SHOULD_RUN_CRONS` / `SHOULD_RUN_CONSUMERS` — toggle cron and SQS consumer on/off (useful for separating API and worker deployments)
- `AWS_SECRETS_ID`, `AWS_REGION` — for fetching secrets from AWS Secrets Manager
- `PORT` — HTTP port (default 3000)

### Infrastructure Dependencies

- **MongoDB**: Primary datastore (`scheduled_internal_job` and `job_scheduler_run_details` collections)
- **Redis**: Distributed locking for job scheduling
- **AWS SQS**: Job queue with delay-based delivery
- **OpenTelemetry → Jaeger**: Distributed tracing

## Code Style

- ESLint (flat config) + Prettier enforced via Husky pre-commit hooks (lint-staged)
- Imports alphabetically ordered (`eslint-plugin-import`)
- snake_case file names, camelCase variables/functions, PascalCase classes/types
- Logging via `Logger` (Pino) with structured key/value format: `{ message, key1, key1_value, ... }`
- Request context propagation via `AsyncLocalStorage` (`RequestContext`)

## Code Rules

**Function design**: max 4 params (group into an interface/type if more) · max 20 logical lines (extract helpers) · return type required on all functions · no bare `any` types · strictly no blank lines inside function bodies

**No magic values**: never inline magic numbers/strings — extract to named constants in `constants.ts`, class-level constants, or enums

**Error handling**: controller catches service exceptions → Express error middleware. Services never swallow silently (log + re-throw). Use specific error classes, not bare `catch (err: any)` without re-throw. Always log before re-throwing so every error is observable. SQS consumers must distinguish retryable (infrastructure) from non-retryable (application/HTTP) errors — use `retryWithBackoff` from `src/common/retry_utils.ts` for retryable errors, delete messages immediately for non-retryable. After exhausting retries, leave the message for SQS redelivery → DLQ. Service functions called by SQS consumers must let infrastructure errors propagate (not swallow in catch-all blocks); only catch domain-specific errors (e.g., HTTP callback failures → mark job as FAILED). Always `await` async calls in message handlers — missing `await` silently drops errors

**Logging**: use `Logger` from `src/common/logger.ts` with structured format. Never use `console.log`

**Security**: no secrets in code — use env vars / AWS Secrets Manager

**Idempotency**: SQS consumers and scheduled jobs must be idempotent. Use `updateOne` with upsert over blind inserts. Deduplicate by jobId + version. Multi-step workflows: persist progress so retries skip completed steps. Never assume single execution — network retries, SQS at-least-once, and cron overlaps cause duplicates

**Layer pattern**: controller → service → repository. Never skip layers. Cross-service communication via HTTP, never direct DB access across domains

**Performance**: no N+1 — batch with `$in`/aggregation · queries must use indexed fields · don't `await` unused promises

**Tests**: no test suite exists yet (`npm test` is a no-op). When adding tests, mock all external services (MongoDB, Redis, SQS, APIs) — no real network calls

## AI Interaction Rules

**Git branch hygiene**: always `git fetch` and pull the latest from the target branch before creating a new branch off it or creating a PR against it. When a change targets multiple branches (e.g., `testing` and `preproduction`), create separate branches based on each target's latest state — never reuse a single branch based on only one of them.

**Constructive pushback**: politely challenge requests that conflict with project conventions, industry standards, or sound engineering (performance, security, maintainability) — give a clear counter-argument. Be respectful, never dismissive. If the user's reasoning holds, accept and proceed.

**Proactive questioning & coaching**: before implementing a change, ask 1–3 tailored questions surfacing real concerns — edge cases (nulls, concurrency, partial failures), scale (10×/100× volume), product thinking (downstream consumers, failure UX, data contracts), data integrity (migrations, backwards compat), and security. If a design smell or better approach exists, propose alternatives and weigh tradeoffs — push for the right solution over the quickest. Skip only when answers are clearly implied by context.

## AI Review Format

Organize by category (Bugs, Security, Performance, Idempotency, Design, Style). Tag severity: `CRITICAL` (bugs/data-loss/security), `WARNING` (convention violation/conditional issues), `SUGGESTION` (improvement). Reference file + line range. Skip auto-fixable style issues. Verify function size, arg count, layer pattern, no blank lines inside function bodies, and idempotency of retryable operations (endpoints, consumers, jobs). On PR reviews, post inline `gh api` comments with severity + fix.
