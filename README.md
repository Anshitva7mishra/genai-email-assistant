# GenAI Email Assistant

A production-grade, microservices-based Software-as-a-Service platform that
leverages Google Gemini (primary) and Mistral AI (fallback) to compose, schedule,
and analyse AI-generated emails. The system is built entirely on the MERN
stack using plain JavaScript across all backend services, orchestrated locally
with Docker Compose and targeting free-tier hosted infrastructure for
deployment.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architectural Philosophy](#architectural-philosophy)
3. [Repository Structure](#repository-structure)
4. [Service Catalogue](#service-catalogue)
5. [Shared Utility Library](#shared-utility-library)
6. [Infrastructure](#infrastructure)
7. [Port Map](#port-map)
8. [Environment Variables](#environment-variables)
9. [Running Locally](#running-locally)
10. [Health Verification](#health-verification)
11. [Technology Stack](#technology-stack)
12. [Build Roadmap](#build-roadmap)
13. [Contributing Guidelines](#contributing-guidelines)

---

## Project Overview

The GenAI Email Assistant is designed as a day-by-day incremental build where
each session produces a fully deployable increment. Day 1 establishes the
monorepo skeleton, Docker Compose environment, and shared utilities. Subsequent
days add authentication, AI integration, email delivery, scheduling, analytics,
and a polished frontend.

The platform is deliberately designed to run on free-tier infrastructure
(MongoDB Atlas free cluster, Redis Cloud free tier, Render.com or Railway for
services, Vercel for the frontend) to minimise operational cost during the
build phase while maintaining a production-grade architecture.

---

## Architectural Philosophy

### Why Microservices

Each domain — AI generation, email delivery, template management, job
scheduling, and analytics — has a fundamentally different scaling profile.
The AI service is CPU/network bound by LLM API latency. The scheduler service
is I/O bound by Redis queue polling. The analytics service is write-heavy.
Bundling these into a monolith would force the entire application to scale as
one unit, wasting resources. Microservices allow independent horizontal scaling
per domain.

### Why a Monorepo

Despite using microservices, the codebase lives in a single repository. This
decision eliminates the cross-repository dependency problem (shared utility
changes require a publish-and-bump cycle across N repos), simplifies local
development (one `docker compose up` starts everything), and makes atomic
commits possible when a change spans multiple services.

### Why Plain JavaScript Instead of TypeScript

TypeScript adds compilation overhead, requires build tooling in every service,
and introduces friction when onboarding contributors who are familiar with
Node.js but not TypeScript configuration. For a day-by-day sprint format where
iteration speed matters, plain JavaScript with JSDoc annotations provides
sufficient type hints in editors without any compile step. TypeScript can be
adopted incrementally per-service if the project grows a dedicated team.

### Why Gemini and Mistral AI, Not OpenAI

OpenAI pricing is usage-based with no permanently free tier. Google Gemini
offers a generous free tier via AI Studio and Gemini API. Mistral AI provides
high-quality open-weight model inference with a free tier sufficient for
development and low-volume production. The AI service is designed with a
primary/fallback pattern so that if Gemini returns a rate-limit error, Mistral
is called transparently — no impact on the user. OpenAI is explicitly excluded
from this project.

---

## Repository Structure

```
GenAI+Microservices/
|
+-- gateway/                    API Gateway (port 3001)
|   +-- src/
|   |   +-- index.js            Express application entry point
|   |   +-- routes/
|   |       +-- health.js       GET /health route handler
|   +-- Dockerfile
|   +-- package.json
|
+-- ai-service/                 AI Generation Service (port 3002)
|   +-- src/
|   |   +-- index.js
|   |   +-- routes/
|   |       +-- health.js
|   +-- Dockerfile
|   +-- package.json
|
+-- email-service/              Email Delivery Service (port 3003)
|   +-- src/
|   |   +-- index.js
|   |   +-- routes/
|   |       +-- health.js
|   +-- Dockerfile
|   +-- package.json
|
+-- template-service/           Template Storage Service (port 3004)
|   +-- src/
|   |   +-- index.js
|   |   +-- routes/
|   |       +-- health.js
|   +-- Dockerfile
|   +-- package.json
|
+-- scheduler-service/          Job Scheduling Service (port 3005)
|   +-- src/
|   |   +-- index.js
|   |   +-- routes/
|   |       +-- health.js
|   +-- Dockerfile
|   +-- package.json
|
+-- analytics-service/          Usage Analytics Service (port 3006)
|   +-- src/
|   |   +-- index.js
|   |   +-- routes/
|   |       +-- health.js
|   +-- Dockerfile
|   +-- package.json
|
+-- shared/                     Cross-service JavaScript utilities
|   +-- index.js                Barrel export
|   +-- db.js                   Mongoose connection helper
|   +-- logger.js               Pino structured logger
|   +-- errorHandler.js         Express error and 404 middleware
|   +-- response.js             Standardised HTTP response formatters
|   +-- package.json
|
+-- frontend/                   React + Vite + Tailwind (Day 2)
|   +-- README.md               Scaffold instructions
|
+-- docs/
|   +-- day1.md                 Day 1 technical documentation
|
+-- scripts/
|   +-- health-check.js         CLI health-check utility
|
+-- docker-compose.yml          Full local development stack
+-- .gitignore
+-- package.json                Root workspace and convenience scripts
+-- README.md                   This file
```

---

## Service Catalogue

### Gateway (port 3001)

The API Gateway is the single entry point for all client requests. In the final
architecture it will handle authentication token verification via Clerk
middleware, route requests to downstream services using HTTP proxy, enforce
rate limiting, and aggregate responses. On Day 1 it is a minimal Express server
that demonstrates the scaffold pattern all other services follow.

Future responsibilities: request routing, JWT/session validation, rate limiting,
CORS policy, request/response logging, circuit breaker to downstream services.

### AI Service (port 3002)

Responsible for all interactions with external LLM providers. Implements the
primary/fallback pattern: Gemini is called first; if the request fails (rate
limit, quota exceeded, network error), the identical prompt is forwarded to
Mistral AI. This service is intentionally isolated because LLM API calls have
unpredictable latency (100ms to 30s) and should not block other services.

Future responsibilities: prompt engineering, response streaming, token usage
tracking, provider health monitoring, model selection per request type.

### Email Service (port 3003)

Manages email composition, delivery, and inbox synchronisation. Will integrate
with Gmail OAuth for reading and sending emails on behalf of users, and with a
transactional email provider (Resend or similar free-tier service) for system
notifications.

Future responsibilities: Gmail OAuth flow, inbox polling, email threading,
send/receive tracking, bounce handling.

### Template Service (port 3004)

Stores and renders reusable email templates. Templates are Handlebars or Nunjucks
documents stored in MongoDB with variables for personalisation. This service
caches rendered templates in Redis to avoid redundant database reads on
high-frequency sends.

Future responsibilities: template CRUD, variable interpolation, preview
rendering, version history.

### Scheduler Service (port 3005)

Manages time-based and event-based job queues using BullMQ backed by Redis.
Handles scheduled email sends, periodic inbox polling triggers, retry logic for
failed deliveries, and any background processing that should not happen
synchronously in a request/response cycle.

Future responsibilities: BullMQ queue setup, cron job management, dead-letter
queue handling, job status reporting.

### Analytics Service (port 3006)

Collects and aggregates usage metrics — emails sent per user, AI token
consumption, template usage frequency, scheduler job success rates. Data is
buffered in Redis and periodically flushed to MongoDB to reduce write pressure.

Future responsibilities: event ingestion API, time-series aggregation, usage
dashboard data endpoints.

---

## Shared Utility Library

The `shared/` directory is a plain JavaScript module that is copied into every
service container at Docker build time. It is not published to npm; it is
referenced via relative path (`require('../../shared')`). This approach avoids
the complexity of npm workspaces or symlinks while providing a single source of
truth for cross-cutting concerns.

### db.js — Mongoose Connection Helper

Wraps `mongoose.connect()` with connection reuse, credential masking in logs,
and event listeners for disconnection and error. Any service that needs
MongoDB calls `connectDB()` once at startup.

### logger.js — Pino Structured Logger

Creates a Pino logger instance configured from environment variables. In
development (`NODE_ENV !== 'production'`), it activates `pino-pretty` for
human-readable colour output. In production it emits newline-delimited JSON
suitable for log aggregators (Datadog, Logtail, Papertrail). The `base` object
tags every log line with `service` and `env` for filtering in aggregators.

### errorHandler.js — Express Error Middleware

Provides two Express middleware functions. `notFoundHandler` catches any
request that fell through all route handlers and creates a 404 error.
`errorHandler` is the four-argument Express error middleware that serialises the
error to a consistent JSON envelope. Stack traces are included only when
`NODE_ENV !== 'production'` to avoid leaking internals to clients.

### response.js — HTTP Response Formatter

Provides `sendSuccess`, `sendError`, and `sendPaginated` helper functions that
wrap `res.json()` with a consistent envelope structure. All API responses from
all services follow the same shape, which simplifies client-side parsing and
error handling.

---

## Infrastructure

### MongoDB 7

Document database used as the primary data store for all services. MongoDB's
flexible schema is well-suited to the email domain where message structure,
template variables, and analytics payloads vary significantly between records.
Version 7 introduces improved time-series collections that will be used by the
analytics service.

In Docker Compose: container name `genai-mongo`, data persisted in the
`mongo-data` named volume, health-checked via `mongosh --eval "db.adminCommand('ping')"`.

### Redis 7

In-memory data structure store used for three distinct purposes: session/cache
storage (template rendering cache in the template service), job queue backend
(BullMQ in the scheduler service), and metrics buffer (analytics service event
staging). Redis 7 is deployed in Alpine variant to minimise image size.
Append-only file (AOF) persistence is enabled (`--appendonly yes`) so the queue
state survives container restarts.

In Docker Compose: container name `genai-redis`, data persisted in the
`redis-data` named volume, health-checked via `redis-cli ping`.

---

## Port Map

| Container                  | Host Port | Container Port | Service             |
|----------------------------|-----------|----------------|---------------------|
| genai-gateway              | 3001      | 3001           | API Gateway         |
| genai-ai-service           | 3002      | 3002           | AI Generation       |
| genai-email-service        | 3003      | 3003           | Email Delivery      |
| genai-template-service     | 3004      | 3004           | Template Storage    |
| genai-scheduler-service    | 3005      | 3005           | Job Scheduling      |
| genai-analytics-service    | 3006      | 3006           | Usage Analytics     |
| genai-mongo                | 27017     | 27017          | MongoDB 7           |
| genai-redis                | 6379      | 6379           | Redis 7             |

All containers communicate over the `genai-net` Docker bridge network using
container names as hostnames. For example, any service can reach MongoDB at
`mongodb://mongo:27017` — Docker's internal DNS resolves `mongo` to the
`genai-mongo` container IP automatically.

---

## Environment Variables

Each service reads its environment variables from a `.env` file at the service
root (loaded by `require('dotenv').config()` at application startup). The
`docker-compose.yml` inline `environment:` block overrides the critical
connection strings (`MONGO_URI`, `REDIS_URL`) with Docker container name
hostnames so that services running inside the network can reach each other.

Variables that services share in common:

| Variable       | Purpose                                         |
|----------------|-------------------------------------------------|
| `NODE_ENV`     | Controls logger format and stack trace exposure |
| `SERVICE_NAME` | Tags every log line and health response         |
| `PORT`         | TCP port the Express server binds to            |
| `LOG_LEVEL`    | Pino log level (trace, debug, info, warn, error)|
| `MONGO_URI`    | Full MongoDB connection string                  |
| `REDIS_URL`    | Full Redis connection string                    |

Never commit a `.env` file. Use the `.gitignore` entry `**/.env` which excludes
all `.env` files at any depth in the repository.

---

## Running Locally

### Prerequisites

- Docker Desktop 4.x or later with Docker Compose V2 (`docker compose`,
  not `docker-compose`)
- Node.js 20.x (only required for running the health-check script outside
  Docker)
- Git

### Start All Containers

```
docker compose up --build
```

The `--build` flag forces Docker to rebuild all service images. On first run
this takes approximately 2 to 4 minutes as Node.js Alpine images and npm
packages are downloaded. Subsequent runs reuse the Docker layer cache and
complete in under 30 seconds if source code has not changed.

MongoDB and Redis start first. All backend service containers are configured
with `depends_on: condition: service_healthy` which means Docker will hold them
in the "waiting" state until the infrastructure containers pass their health
checks. This prevents the "ECONNREFUSED" race condition that would otherwise
occur when a Node.js service attempts to connect to MongoDB before it is ready.

### Watch Logs

```
docker compose logs -f
docker compose logs -f gateway
```

### Stop All Containers

```
docker compose down
```

### Stop and Delete All Data Volumes

```
docker compose down -v
```

Use this when you need a completely clean state (fresh MongoDB, empty Redis).

### Convenience npm Scripts (from repo root)

```
npm run up           # docker compose up --build
npm run down         # docker compose down
npm run down:clean   # docker compose down -v
npm run logs         # docker compose logs -f
npm run health       # node scripts/health-check.js
```

---

## Health Verification

Every service exposes a `GET /health` endpoint that returns HTTP 200 with a
JSON body:

```json
{
  "status": "ok",
  "service": "gateway",
  "uptime": 42,
  "timestamp": "2026-08-11T00:00:00.000Z"
}
```

The `uptime` field is the number of seconds since the Node.js process started,
calculated as `Math.floor((Date.now() - START_TIME) / 1000)` where `START_TIME`
is captured at module load time (not at request time). This is deliberately
lightweight — it does not perform a database ping on every health request to
avoid adding latency to orchestrator health checks.

### Manual verification

```
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health
curl http://localhost:3005/health
curl http://localhost:3006/health
```

### Automated CLI check

```
node scripts/health-check.js
```

This script hits all six endpoints concurrently using `Promise.all` and prints
a status table. It exits with code 0 if all services report healthy, or code 1
if any fail — making it suitable for use in CI pipelines.

### Verify MongoDB

```
docker exec genai-mongo mongosh --eval "db.adminCommand('ping')"
```

### Verify Redis

```
docker exec genai-redis redis-cli ping
```

Expected response: `PONG`

---

## Technology Stack

| Layer              | Technology                  | Justification                                      |
|--------------------|-----------------------------|----------------------------------------------------|
| Runtime            | Node.js 20 LTS              | Long-term support, native ESM, built-in fetch API  |
| Web Framework      | Express 4                   | Minimal, battle-tested, massive ecosystem           |
| Language           | Plain JavaScript (CJS)      | No compilation step, fast iteration                |
| Primary Database   | MongoDB 7 via Mongoose      | Flexible schema for email/AI payloads              |
| Cache and Queue    | Redis 7                     | Sub-millisecond cache, BullMQ queue backend        |
| Logging            | Pino 9                      | Fastest Node.js logger, structured JSON output     |
| Containerisation   | Docker + Compose V2         | Reproducible environments, single-command startup  |
| AI Provider (1st)  | Google Gemini               | Generous free tier, multimodal, strong reasoning   |
| AI Provider (2nd)  | Mistral AI                  | Open-weight models, free tier, reliable fallback   |
| Auth               | Clerk                       | Managed auth, webhook support, free tier (Day 2+) |
| Frontend Framework | React 18 + Vite 5           | Fast HMR, tree-shaking, widespread adoption        |
| Frontend Styling   | Tailwind CSS 3              | Utility-first, no CSS cascade conflicts            |
| Frontend Animation | Framer Motion               | Declarative, production-grade animations           |

---

## Build Roadmap

| Day | Goal                                                              |
|-----|-------------------------------------------------------------------|
| 1   | Monorepo skeleton, Docker Compose, shared utilities, health routes|
| 2   | Frontend scaffold, Clerk auth wiring, gateway routing middleware  |
| 3   | Gemini + Groq integration in ai-service, prompt engineering       |
| 4   | Gmail OAuth, email send/receive in email-service                  |
| 5   | Template CRUD, BullMQ scheduler, scheduled send                   |
| 6   | Analytics pipeline, event ingestion, dashboard API                |
| 7   | End-to-end integration test, staging deployment                   |

---

## Contributing Guidelines

- All backend code must remain plain JavaScript. No TypeScript, no Babel.
- All AI interactions must route through ai-service only. No direct LLM API
  calls from other services.
- Never reference OpenAI in any service, configuration, or documentation.
- Follow the existing file layout: `src/index.js` as entry point,
  `src/routes/` for route modules.
- Every new route file must register its router in `src/index.js`.
- All responses must use `sendSuccess`, `sendError`, or `sendPaginated`
  from `shared/response.js`.
- All errors must propagate via `next(err)` to the `errorHandler` middleware.
  Do not call `res.status().json()` directly in error paths.
- Log at the appropriate level: `logger.info` for normal operations,
  `logger.warn` for recoverable issues, `logger.error` for failures.
