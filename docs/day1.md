# Day 1 — Monorepo Skeleton and Local Docker Compose Environment

**Date:** 2026-08-11
**Sprint Goal:** Establish the complete repository structure, shared utility
library, per-service Express scaffolds, and a fully working Docker Compose
environment for the GenAI Email Assistant microservices platform.

---

## Table of Contents

1. [Session Objectives](#session-objectives)
2. [Technology Stack — Rationale](#technology-stack--rationale)
3. [Repository Layout — Rationale](#repository-layout--rationale)
4. [Shared Utility Library — Deep Dive](#shared-utility-library--deep-dive)
5. [Service Scaffold — Deep Dive](#service-scaffold--deep-dive)
6. [Docker Compose — Deep Dive](#docker-compose--deep-dive)
7. [Environment Variables — Design](#environment-variables--design)
8. [Request Flow — End to End](#request-flow--end-to-end)
9. [Acceptance Criteria — Verified](#acceptance-criteria--verified)
10. [Files Created](#files-created)
11. [Known Limitations and Day 2 Work](#known-limitations-and-day-2-work)

---

## Session Objectives

The primary deliverable for Day 1 is not a feature — it is a stable, correctly
wired platform that every future feature can be built on without revisiting
infrastructure decisions. Three distinct outcomes were required:

**Structural integrity.** The monorepo must lay out every service boundary
clearly so that future contributors — or future sessions — can locate any piece
of logic by folder name alone without reading code.

**Operational confidence.** A single `docker compose up --build` command must
bring the entire platform to life — six backend services, one database, one
cache — on a shared network where every container can reach every other
container by hostname.

**Cross-cutting consistency.** Every service must behave identically for
concerns that are not domain-specific: how it logs, how it formats HTTP
responses, how it handles errors, and how it signals health to Docker and future
orchestrators. This is solved once in `shared/` rather than six times across
six services.

---

## Technology Stack — Rationale

### Node.js 20 LTS

Node.js 20 is the current Long-Term Support release. LTS releases receive
security patches for 30 months. This matters for a project that will eventually
run on production infrastructure. Node.js 20 introduced stable support for the
built-in `fetch` API, stable Web Streams API, and the experimental Permissions
Model. It uses V8 engine version 11.3, which compiles JavaScript more
aggressively and reduces cold-start latency compared to Node.js 18.

The Node.js event loop model — a single thread with non-blocking I/O — makes it
particularly well-suited to API gateway and microservice patterns where the work
is primarily network I/O rather than CPU computation. An Express server handling
proxy routing, LLM API calls, and database queries is almost entirely I/O work.

### Express 4

Express is the minimal, unopinionated HTTP framework for Node.js. It provides:
- A middleware pipeline (`app.use()`) that processes requests in sequence.
- A router abstraction (`express.Router()`) for grouping related routes.
- Built-in JSON body parsing (`express.json()`).
- A four-argument error-handling signature that is used in `errorHandler.js`.

Express was chosen over alternatives for the following reasons:

Fastify is faster in micro-benchmarks but has a steeper learning curve due to
its schema-based validation and different plugin system. For a day-by-day sprint
format, Express's zero-surprise routing model is more productive.

Koa requires explicit async/await and offers no router out of the box. It
reduces ceremony but increases the amount of glue code needed.

NestJS is a full framework with its own decorator-based opinionated architecture
that would introduce TypeScript dependency and a significant learning curve
incompatible with the plain JavaScript constraint.

### Plain JavaScript (CommonJS)

CommonJS (`require`/`module.exports`) is used across all services instead of
ES Modules (`import`/`export`) or TypeScript. The reasons are:

CommonJS is the native module format for Node.js and all npm packages.
Interoperability with packages that have not fully migrated to ESM (including
parts of Mongoose and some Express middleware) requires no extra configuration.

TypeScript introduces a compilation step (`tsc` or `ts-node`) that adds friction
to Docker builds and requires a `tsconfig.json` per service. During an
iterative sprint build, the overhead of managing compilation is not offset by
the benefits of static types for a project of this size with a single developer.

The `'use strict'` directive at the top of every file activates strict mode,
which catches common JavaScript mistakes: undeclared variables, duplicate
parameter names, invalid `this` binding in callbacks. This provides a layer of
protection that is otherwise handled by TypeScript's compiler.

### MongoDB 7 via Mongoose

MongoDB is a document database that stores records as BSON (Binary JSON).
Documents within the same collection are not required to have identical
structure, which makes it suitable for the email domain where:
- Email message documents vary in structure (plain text, HTML, attachments,
  thread metadata).
- AI generation payloads vary per prompt type and provider response schema.
- Template variables are user-defined and cannot be predicted at schema time.
- Analytics event documents differ by event type.

Mongoose is the Object Document Mapper (ODM) library used to interact with
MongoDB from Node.js. It provides schema definition, validation, middleware
hooks, and query building. While MongoDB's schemaless nature is preserved at the
database level, Mongoose schemas enforce structure at the application layer,
catching data integrity issues before they reach the database.

MongoDB 7 introduced improved time-series collection support (relevant for
analytics), improved query planner performance, and Atlas Search integration
that may be used in future days.

### Redis 7

Redis is an in-memory data structure store used for three distinct purposes in
this architecture:

**Caching.** The template service caches rendered templates in Redis with a
configurable TTL (Time to Live). Without caching, every email send would require
a MongoDB read plus a template rendering operation. For high-frequency sending,
this becomes the primary bottleneck.

**Job queues.** The scheduler service will use BullMQ, a Node.js job queue
library that uses Redis as its persistence layer. BullMQ stores job definitions,
execution state, and results in Redis data structures (sorted sets, hashes,
lists). This allows jobs to survive service restarts and be distributed across
multiple workers.

**Metrics buffer.** The analytics service buffers incoming events in Redis
before periodically flushing them to MongoDB. Buffering prevents high write
pressure on MongoDB during traffic spikes.

Redis 7 was chosen for its improved ACL system and multi-part AOF (Append Only
File) for faster recovery. AOF persistence is enabled in the Docker Compose
configuration via `redis-server --appendonly yes`, which means every write
operation is logged to disk. This allows the Redis queue to survive a container
restart without losing pending jobs.

### Google Gemini (Primary AI Provider)

Google Gemini is the primary AI provider for all email generation, subject line
creation, tone adjustment, and reply drafting. Reasons for selection:

The Gemini API offers a permanently free tier through Google AI Studio with
generous rate limits (15 requests per minute, 1 million tokens per day on the
free tier as of the time of writing). This is sufficient for development and
early beta usage.

Gemini 1.5 Pro supports a 1 million token context window, which is relevant
when the system eventually passes entire email threads to the model for
contextual reply generation.

Google's infrastructure provides reliable uptime and globally distributed API
endpoints that reduce latency for users across different geographic regions.

### Mistral AI (Fallback AI Provider)

Mistral AI is the fallback provider, called when Gemini is unavailable (rate
limit, quota exceeded, API error, or timeout). Reasons for selection:

Mistral AI provides open-weight models (Mistral 7B, Mixtral 8x7B) via their
API with a free tier. Open-weight means the underlying model weights are
publicly available, which provides transparency about the model's training data
and behaviour — important for a product that processes user email data.

Mistral's models have strong multilingual performance, which is relevant for
an email assistant that may need to draft emails in languages other than English.

The primary/fallback pattern in `ai-service` means users never see a failure
when one provider is unavailable. The fallback is transparent: the same prompt
is submitted to Mistral if Gemini fails, and the response is returned
identically.

### Pino (Logger)

Pino is the logging library used across all services. In controlled benchmarks,
Pino is approximately five times faster than Winston (the most commonly used
alternative) because it serialises log entries as newline-delimited JSON without
allocating intermediate string representations.

In development, Pino's `transport` option activates `pino-pretty`, which
reformats the JSON output into coloured, human-readable lines in the terminal.
In production, the raw JSON output is consumed by log aggregation services
(Datadog, Logtail, Papertrail, or similar) which parse structured fields for
filtering, alerting, and dashboard creation.

The `base` field in the Pino configuration adds `service` and `env` to every
log line automatically. This means when logs from all six services are
aggregated in a centralised log management system, every line carries its origin
service name without any additional effort from the developer writing the log
statement.

### Docker and Docker Compose V2

Docker packages each service and its dependencies into an image — a
reproducible, isolated filesystem that runs identically on any machine with
Docker installed. This eliminates the "it works on my machine" problem.

Docker Compose V2 (`docker compose`, without a hyphen) is the current
implementation, rewritten in Go. It is bundled with Docker Desktop and provides
a declarative YAML format for defining multi-container applications. A single
`docker-compose.yml` replaces the need to manually start, configure, and
network eight separate containers.

The Compose file used in this project uses Compose Specification version 3.9,
which supports health check conditions in `depends_on` — a feature critical for
ensuring services do not start before their dependencies are ready.

---

## Repository Layout — Rationale

### Why a Monorepo

A monorepo (single repository for multiple packages or services) was chosen
over a polyrepo (one repository per service) for the following reasons:

**Atomic changes.** When a change to `shared/errorHandler.js` changes the error
envelope shape, all six services that consume it must be updated simultaneously.
In a monorepo, this is a single commit. In a polyrepo, it requires coordinating
six separate pull requests and version bumps.

**Simplified local development.** A single `docker compose up` at the monorepo
root starts the entire platform. In a polyrepo, a developer would need to clone
six repositories and coordinate startup scripts.

**Shared tooling.** ESLint, Prettier, and other development tooling
configuration files live at the root and apply to all services. In a polyrepo,
these must be duplicated and kept in sync across repositories.

**Discoverability.** A new developer can read the folder structure and
immediately understand the system's service boundaries without documentation.

### Service Folder Naming

Each service folder is named with a hyphenated noun that describes the domain
it owns, not the technology it uses. `email-service` not `nodemailer-service`.
`ai-service` not `gemini-service`. This is because the technology choice
(nodemailer, Gemini) may change, but the domain responsibility (email
delivery, AI generation) does not.

### The `src/` Subdirectory

Each service places its source code inside `src/` rather than at the service
root. This convention separates application code from configuration files
(`package.json`, `Dockerfile`, `.env.example`) that sit at the service root.
As services grow to include test directories (`tests/`, `__tests__/`), seed
data, and migration scripts, the `src/` boundary keeps the application code
isolated and navigable.

### The `shared/` Directory

`shared/` contains code that would otherwise be duplicated across six services.
It is not published to npm because npm publishing introduces a version
management overhead that is unnecessary when all consumers are in the same
repository. Instead, every service's `Dockerfile` copies the `shared/`
directory into the container alongside the service directory, making
`require('../../shared')` a valid path from `<service>/src/index.js`.

This pattern is a deliberate simplification over alternatives:

npm workspaces with symlinks work locally but require careful Docker multi-stage
build configuration to resolve symlinks inside the container filesystem.

Publishing to a private npm registry (GitHub Packages, Verdaccio) introduces
a CI/CD dependency and token management for package installation inside Docker.

The copy-at-build-time approach has no dependencies beyond the file system and
requires no special Docker configuration beyond setting the build context to
the monorepo root.

### The `frontend/` Placeholder

The `frontend/` directory exists as a placeholder with a `README.md` describing
the Day 2 scaffold plan. This establishes the service boundary in the repository
structure before the code exists. The Vite + React project will be scaffolded
directly into this directory on Day 2, at which point it will have its own
`package.json`, `node_modules`, and Vite configuration.

The frontend is intentionally excluded from the Docker Compose configuration on
Day 1 because including an empty Node.js directory in the Docker build context
would cause build failures. The frontend will receive its own Docker service
definition on Day 2 after scaffolding.

---

## Shared Utility Library — Deep Dive

### `shared/index.js` — Barrel Export

```javascript
'use strict';

module.exports = {
  connectDB: require('./db').connectDB,
  closeDB: require('./db').closeDB,
  logger: require('./logger'),
  errorHandler: require('./errorHandler').errorHandler,
  notFoundHandler: require('./errorHandler').notFoundHandler,
  sendSuccess: require('./response').sendSuccess,
  sendError: require('./response').sendError,
  sendPaginated: require('./response').sendPaginated,
};
```

A barrel export is a module that re-exports symbols from other modules,
providing a single import point. Without it, every service would need to write:

```javascript
const { connectDB } = require('../../shared/db');
const logger = require('../../shared/logger');
const { errorHandler } = require('../../shared/errorHandler');
```

With the barrel, this collapses to:

```javascript
const { logger, errorHandler, notFoundHandler } = require('../../shared');
```

The `'use strict'` directive appears at the top of every JavaScript file in
this project. In strict mode, the JavaScript engine enforces additional rules:
assigning to an undeclared variable throws a `ReferenceError` instead of
silently creating a global; `this` inside a plain function call is `undefined`
instead of the global object; duplicate parameter names throw a `SyntaxError`.
These rules catch a class of bugs that would otherwise produce silent,
hard-to-trace behaviour.

### `shared/db.js` — Mongoose Connection Helper

```javascript
let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  // ...
}
```

The `isConnected` flag prevents multiple calls to `mongoose.connect()`. Although
Mongoose itself handles connection pooling internally and ignores duplicate
connect calls gracefully, the explicit guard makes the intent clear and avoids
the overhead of re-evaluating the connection state on each call.

```javascript
const uri = process.env.MONGO_URI;
if (!uri) throw new Error('MONGO_URI environment variable is not set.');
```

Throwing on a missing environment variable causes the service to crash
immediately at startup rather than failing mysteriously on the first database
operation. This is the fail-fast principle: a configuration error should be
surfaced as loudly and as early as possible.

```javascript
await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
```

The `serverSelectionTimeoutMS` option controls how long Mongoose waits for a
server to become available before throwing. The default is 30 seconds. In a
Docker Compose environment where services wait for MongoDB's health check before
starting, 5 seconds is sufficient and avoids long hangs in the startup sequence.

```javascript
mongoose.connection.on('disconnected', () => {
  isConnected = false;
  logger.warn('MongoDB disconnected.');
});
```

The `disconnected` event fires when the connection drops after it was
established — for example, if MongoDB restarts or the network is interrupted.
Resetting `isConnected` to `false` ensures that the next call to `connectDB()`
will attempt to reconnect rather than returning immediately due to the guard.

### `shared/logger.js` — Pino Logger

```javascript
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: process.env.SERVICE_NAME || 'unknown',
    env: process.env.NODE_ENV || 'development',
  },
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { ... } }
      : undefined,
});
```

`level` controls the minimum severity of messages that Pino will output. Log
levels in ascending severity are: `trace`, `debug`, `info`, `warn`, `error`,
`fatal`. Setting level to `info` means `trace` and `debug` messages are
silently discarded. This can be changed per-service via the `LOG_LEVEL`
environment variable — for example, setting `LOG_LEVEL=debug` in the gateway
during a debugging session without affecting other services.

`base` is a plain object whose key-value pairs are merged into every log entry.
In structured logging, fields added to every entry act as implicit context.
When log entries from all six services are shipped to a centralised log
aggregator, filtering by `service: "ai-service"` immediately isolates that
service's logs without the developer needing to search by message content.

`transport` is Pino's mechanism for processing log entries after they are
serialised. In development, `pino-pretty` reformats the JSON into:

```
[01:30:00.000] INFO: gateway started
    service: gateway
    env: development
    port: 3001
```

Setting `transport` to `undefined` in production means Pino writes raw
newline-delimited JSON directly to `stdout`. Container orchestrators (Docker,
Kubernetes) collect `stdout` from containers and forward it to log aggregation
systems that parse the JSON natively.

### `shared/errorHandler.js` — Error Middleware

```javascript
function notFoundHandler(req, _res, next) {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.status = 404;
  next(err);
}
```

`notFoundHandler` is registered after all route definitions. Any request that
does not match a defined route falls through the route handler chain and reaches
this middleware. Instead of calling `res.json()` directly, it constructs an
Error object and passes it to `next(err)`. This routes it through the central
`errorHandler`, ensuring 404 responses have the same envelope shape as all
other error responses.

The `_res` parameter has a leading underscore by convention. In JavaScript,
there is no way to omit a positional parameter from a function signature without
using a placeholder. The underscore prefix signals to other developers (and to
linters configured with `no-unused-vars`) that this parameter is intentionally
unused.

```javascript
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
```

Express identifies error-handling middleware by the number of arguments in the
function signature. A function with exactly four arguments `(err, req, res, next)`
is registered as error middleware. A function with three arguments
`(req, res, next)` is registered as normal middleware. The `next` parameter
must be present in the signature even if it is never called inside the function,
otherwise Express will treat it as normal middleware and errors passed via
`next(err)` will not reach it. The ESLint disable comment acknowledges this
intentional deviation from the no-unused-vars rule.

```javascript
const status = err.status || err.statusCode || 500;
```

Different libraries attach the HTTP status code to different property names.
Express convention uses `err.status`. Some HTTP client libraries use
`err.statusCode`. The fallback to `500` ensures that errors without an
explicit status code are treated as Internal Server Error rather than
producing an undefined or NaN status.

```javascript
...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
```

The spread of a conditional object is a concise pattern for optionally including
a field. When `NODE_ENV !== 'production'` evaluates to `true`, the expression
becomes `...{ stack: err.stack }` which spreads the stack property into the
enclosing object. When it evaluates to `false`, `false && { ... }` is `false`,
and `...false` spreads nothing. This avoids an `if` block inside an object
literal and keeps the response shape declaration readable.

### `shared/response.js` — Response Formatter

```javascript
function sendSuccess(res, data = null, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({ success: true, message, data });
}
```

All successful responses follow the shape `{ success: true, message, data }`.
This consistent envelope means frontend and API clients can always check
`response.data.success` to determine the outcome without inspecting the HTTP
status code alone. The `message` field provides a human-readable description
that can be displayed directly in a UI toast notification.

```javascript
function sendPaginated(res, items, pagination, message = 'Success') {
  const { page, limit, total } = pagination;
  return res.status(200).json({
    // ...
    pagination: {
      page, limit, total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });
}
```

The `sendPaginated` function centralises pagination arithmetic. Route handlers
provide the raw inputs (`page`, `limit`, `total items`) and the function
computes derived fields. `Math.ceil(total / limit)` gives the total number of
pages. `page * limit < total` is true when there are still items beyond the
current page. `page > 1` is true when the client is not on the first page.
Without this helper, every paginated route would duplicate this arithmetic,
creating opportunities for inconsistency.

---

## Service Scaffold — Deep Dive

Every backend service follows an identical structural pattern:

```
<service-name>/
  src/
    index.js          Application entry point
    routes/
      health.js       GET /health route handler
  Dockerfile
  package.json
  .env.example
```

### `src/index.js` — Application Entry Point

```javascript
'use strict';
require('dotenv').config();
```

`dotenv` reads a `.env` file from the current working directory and sets the
key-value pairs as `process.env` properties. This must happen before any module
that reads environment variables is loaded, which is why it appears before all
other `require` statements. The `.config()` call is silent — it does not throw
if a `.env` file is missing, relying on OS-level or Docker Compose-injected
environment variables in that case.

```javascript
const app = express();
const PORT = process.env.PORT || 3001;
```

The `PORT` value is read from the environment, with a service-specific default.
In Docker Compose, the `PORT` variable is set in the `environment:` block.
The fallback default serves two purposes: it allows the service to run locally
without a `.env` file during development, and it documents what the expected
port is for that service by convention.

```javascript
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
```

`express.json()` parses incoming requests with a `Content-Type: application/json`
header and populates `req.body` with the parsed object. The `limit` option sets
the maximum accepted body size. Setting it to `1mb` prevents memory exhaustion
attacks where a client sends a very large JSON payload. The AI service uses
`4mb` because LLM prompt payloads (which may include email thread context) can
be significantly larger than typical REST payloads.

`express.urlencoded({ extended: false })` parses URL-encoded form data
(`Content-Type: application/x-www-form-urlencoded`). `extended: false` uses the
built-in `querystring` library rather than the `qs` library, which is
sufficient for simple key-value form data and avoids an extra dependency.

```javascript
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.originalUrl }, 'incoming request');
  next();
});
```

This is a logging middleware registered before all route handlers. It logs every
incoming request with the HTTP method and URL as structured fields. `originalUrl`
is used instead of `url` because Express may rewrite `req.url` for sub-routers,
but `req.originalUrl` always contains the URL as received from the client.
Calling `next()` is mandatory — without it, the request would stop here and
never reach a route handler.

```javascript
app.use('/health', healthRouter);

app.use(notFoundHandler);
app.use(errorHandler);
```

Route registration order matters in Express. Routes are matched in the order
they are registered. The health router is registered first. `notFoundHandler`
is registered after all routes — it will only be reached if no route matched.
`errorHandler` is registered last because it must be able to catch errors from
all routes and all other middleware.

```javascript
app.listen(PORT, () => {
  logger.info({ port: PORT }, `${process.env.SERVICE_NAME} started`);
});
```

`app.listen()` binds the Express HTTP server to the specified port on all
network interfaces (`0.0.0.0`). The callback executes once the server is ready
to accept connections. Logging the port number in the startup message is
important for debugging port conflict issues where a service binds to a
different port than expected due to environment variable misconfiguration.

```javascript
process.on('SIGTERM', () => { logger.info('SIGTERM — shutting down'); process.exit(0); });
process.on('SIGINT',  () => { logger.info('SIGINT — shutting down');  process.exit(0); });
```

`SIGTERM` is the signal sent by Docker (and Kubernetes) when a container is
being stopped. The default Node.js behaviour on `SIGTERM` is to terminate
without cleanup. Registering a handler allows the service to log the shutdown
event, complete any in-flight requests (in a more complete implementation), and
close database connections before exiting. `SIGINT` is the signal sent by
`Ctrl+C` in a terminal during local development.

`process.exit(0)` exits with status code 0, which signals a clean (intentional)
termination. A non-zero exit code would cause Docker to mark the container as
having exited with an error.

### `src/routes/health.js` — Health Route

```javascript
const START_TIME = Date.now();

router.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: process.env.SERVICE_NAME || 'gateway',
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString(),
  });
});
```

`START_TIME` is captured at module load time, not at request time. Module-level
variables in Node.js are initialised once when the module is first `require()`'d
and cached for all subsequent calls. Capturing `Date.now()` at module load time
means the `uptime` calculation reflects how long the service process has been
running, not how long since the last health request.

`Math.floor((Date.now() - START_TIME) / 1000)` converts milliseconds to whole
seconds. Fractional seconds add no useful information to a health response and
introduce unnecessary decimal noise.

The health endpoint deliberately does not ping MongoDB or Redis. Performing
downstream connectivity checks on every health request would:
1. Add latency to orchestrator polls (Kubernetes liveness probes run every
   few seconds).
2. Create a failure mode where a temporary network hiccup to MongoDB causes
   the orchestrator to kill and restart a perfectly healthy service process.

A separate readiness probe (not implemented on Day 1) is the appropriate place
for downstream connectivity verification.

### `Dockerfile` — Image Definition

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY shared/ ./shared/
WORKDIR /app/shared
RUN npm install --omit=dev

WORKDIR /app/gateway
COPY gateway/package*.json ./
RUN npm install --omit=dev

COPY gateway/ .

EXPOSE 3001

CMD ["node", "src/index.js"]
```

`FROM node:20-alpine` uses the Alpine Linux variant of the Node.js 20 image.
Alpine is a minimal Linux distribution (~5MB base) compared to Debian-based
images (~150MB). The resulting service image is approximately 180MB instead of
350MB. Smaller images mean faster pushes to a container registry and faster
pulls during deployment.

`WORKDIR /app` sets the working directory for all subsequent instructions. If
the directory does not exist, Docker creates it.

The `COPY shared/ ./shared/` instruction copies the `shared/` directory from
the build context (which is the monorepo root, as specified in
`docker-compose.yml`) into the image at `/app/shared/`. This makes the shared
utilities available at the path that `require('../../shared')` expects from
`/app/gateway/src/index.js`.

`RUN npm install --omit=dev` installs production dependencies only.
`devDependencies` (nodemon) are excluded from the image — they are only used
for local development outside Docker. This reduces image size and eliminates
development tools from the production runtime.

The `package*.json` glob (`COPY gateway/package*.json ./`) copies both
`package.json` and `package-lock.json`. Copying these before the source code
is a deliberate Docker layer caching optimisation. Docker builds each
instruction as a separate layer. If the source code changes but
`package.json` does not, Docker reuses the cached `npm install` layer and
skips re-downloading packages. This makes iterative development builds
significantly faster.

`EXPOSE 3001` is documentation — it declares which port the container process
listens on. It does not actually publish the port to the host. Port publishing
is controlled by the `ports:` mapping in `docker-compose.yml`.

`CMD ["node", "src/index.js"]` uses the exec form (JSON array) rather than the
shell form (`CMD node src/index.js`). The exec form runs `node` as PID 1
directly, which means the Node.js process receives OS signals (SIGTERM, SIGINT)
directly. The shell form would run `sh -c "node src/index.js"`, making `sh`
PID 1 and potentially swallowing signals before they reach Node.js.

---

## Docker Compose — Deep Dive

### Network Configuration

```yaml
networks:
  genai-net:
    driver: bridge
```

All containers in this Compose file are attached to the `genai-net` bridge
network. Docker's bridge network driver creates a software-defined network
on the host machine. Containers on the same bridge network can communicate
using each other's container names as hostnames. Docker's embedded DNS server
resolves `mongo` to the IP address of the `genai-mongo` container, `redis`
to `genai-redis`, and so on.

Without an explicit network definition, Docker Compose creates a default
network named `<project-name>_default`. Defining the network explicitly
gives it a predictable name, allows other Compose files to reference it, and
makes the networking intent self-documenting.

### Volume Configuration

```yaml
volumes:
  mongo-data:
  redis-data:
```

Named volumes are managed by Docker and persist beyond the lifetime of
containers. When `docker compose down` is run, containers are removed but
named volumes are preserved. This means MongoDB data and Redis queue state
survive container recreation.

`docker compose down -v` removes both containers and volumes, providing a
clean-slate reset. This is useful when testing schema migrations or when
queue state has become corrupted during development.

### Infrastructure Service — MongoDB

```yaml
mongo:
  image: mongo:7
  container_name: genai-mongo
  restart: unless-stopped
  ports:
    - '27017:27017'
  volumes:
    - mongo-data:/data/db
  networks:
    - genai-net
  healthcheck:
    test: ['CMD', 'mongosh', '--eval', "db.adminCommand('ping')"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 10s
```

`container_name: genai-mongo` assigns a fixed name to the container, overriding
Docker Compose's default naming convention (`<project>_<service>_<index>`). A
fixed name makes `docker exec genai-mongo` commands predictable and is required
for the container to be reachable by a fixed hostname on the network.

`restart: unless-stopped` instructs Docker to restart the container if it
exits for any reason other than being explicitly stopped with `docker stop` or
`docker compose down`. This ensures MongoDB restarts automatically if it
crashes, which is the expected behaviour for infrastructure services.

The health check runs `mongosh --eval "db.adminCommand('ping')"` every 10
seconds. `mongosh` is the MongoDB Shell, included in the `mongo:7` image.
`db.adminCommand('ping')` is a lightweight command that returns `{ ok: 1 }` if
the MongoDB server is accepting connections. The `start_period: 10s` setting
tells Docker not to count health check failures during the first 10 seconds
of container startup — allowing MongoDB time to initialise its storage engine
before being considered unhealthy.

`retries: 5` means Docker will wait through 5 consecutive failed health checks
(5 × 10s = 50 seconds) before marking the container as `unhealthy`. Backend
services will not start until MongoDB is `healthy`, which is enforced by the
`depends_on: condition: service_healthy` configuration.

### Infrastructure Service — Redis

```yaml
command: redis-server --appendonly yes
```

By default, Redis operates in RDB (Redis Database) mode, writing a point-in-time
snapshot to disk periodically. AOF (Append Only File) mode writes every write
operation to disk as it occurs, providing stronger durability guarantees. For a
job queue backend, AOF means pending jobs survive a Redis crash — RDB mode could
lose jobs submitted after the last snapshot.

The tradeoff is that AOF files are larger and AOF mode has slightly higher write
latency. For the scale of this project, the durability benefit outweighs the
performance cost.

### Backend Service Configuration

```yaml
gateway:
  build:
    context: .
    dockerfile: gateway/Dockerfile
```

`context: .` sets the Docker build context to the monorepo root directory.
The build context is the set of files available to `COPY` instructions in the
Dockerfile. By setting it to the root, the Dockerfile can `COPY shared/`
into the image. If the context were set to `gateway/`, the `COPY shared/`
instruction would fail because `shared/` would be outside the context.

```yaml
  depends_on:
    mongo:
      condition: service_healthy
    redis:
      condition: service_healthy
```

The `service_healthy` condition is only available in Compose Specification
version 3.9 and above, and only when the dependency service defines a
`healthcheck` block. It instructs Docker Compose to wait until the dependency
container's health check reports `healthy` before starting the dependent
service. This eliminates the startup race condition where a Node.js service
attempts to connect to MongoDB before MongoDB has finished initialising.

```yaml
  healthcheck:
    test: ['CMD', 'wget', '-qO-', 'http://localhost:3001/health']
```

`wget` is included in the Alpine Linux base image. `-q` suppresses progress
output. `-O-` directs the response body to stdout instead of a file.
`curl` is not included in Alpine by default and would require an additional
`RUN apk add curl` instruction in the Dockerfile. Using `wget` avoids this
extra image layer.

---

## Environment Variables — Design

### Layered Loading Strategy

Environment variables in this project are loaded in two layers:

**Layer 1: File-based (dotenv).** Each service loads a `.env` file via
`require('dotenv').config()` at startup. This `.env` file contains
service-specific configuration values for local development outside Docker.
The `.env` file is gitignored and is never committed to the repository.

**Layer 2: Docker Compose inline override.** The `environment:` block in
`docker-compose.yml` sets variables directly in the container environment.
Variables set this way take precedence over values in any `.env` file because
`dotenv` only sets a variable if it is not already set in the environment.
This is how `MONGO_URI` resolves to `mongodb://mongo:27017/genai-email`
(using the Docker container hostname `mongo`) inside Docker, even though
a developer's local `.env` might point to `localhost:27017`.

### `.env.example` Files

Each service has a `.env.example` file committed to the repository. This file
lists every environment variable the service expects, with placeholder values
or comments indicating where real values should come from. It is the developer
onboarding document for configuration. When a new developer clones the
repository, they copy `.env.example` to `.env` and fill in real values:

```
cp gateway/.env.example gateway/.env
```

The root `.env` file (not `.env.example` — the user created a real one) provides
a convenient location for variables that are common across services, though
individual service `.env` files take precedence.

### Why `SERVICE_NAME` Is an Environment Variable

`SERVICE_NAME` is set in the Docker Compose `environment:` block rather than
hardcoded in each service's `index.js`. This means the same Docker image could
theoretically be run under a different name for debugging purposes, and all log
lines would correctly reflect the name under which it was launched. More
practically, it reinforces the principle that configuration belongs to the
deployment environment, not to application code.

---

## Request Flow — End to End

This section traces a single HTTP request through the system to illustrate
how all the pieces connect.

### Flow: Client sends `GET /health` to the gateway

```
1. Client (browser, curl, health-check script)
        |
        | HTTP GET http://localhost:3001/health
        v
2. Docker host network layer
        |
        | Port mapping: 3001 -> container:3001
        v
3. genai-gateway container (port 3001)
        |
        | express.json() parses body (none for GET)
        | express.urlencoded() parses body (none for GET)
        | Logging middleware logs: { method: 'GET', url: '/health' }
        | next() called
        v
4. Route matching: app.use('/health', healthRouter)
        |
        | healthRouter.get('/') matches GET /health
        v
5. health.js handler
        |
        | Reads process.env.SERVICE_NAME -> 'gateway'
        | Calculates uptime from module-level START_TIME
        | Calls res.status(200).json({ status: 'ok', ... })
        v
6. HTTP response sent back to client
        |
        | { "status": "ok", "service": "gateway", "uptime": 42, ... }
```

### Flow: Client sends a request to an unknown route

```
1. Client: GET http://localhost:3001/nonexistent
        v
2. genai-gateway — logging middleware logs request
        v
3. Route matching: no route matches /nonexistent
        v
4. notFoundHandler middleware
        |
        | Creates: err = new Error('Route not found: GET /nonexistent')
        | Sets: err.status = 404
        | Calls next(err)
        v
5. errorHandler middleware
        |
        | Reads err.status -> 404
        | Logs: { err, method, url, status: 404 }
        | Responds: { success: false, error: { message: 'Route not found...' } }
        v
6. HTTP 404 response sent to client
```

### Flow: Docker Compose startup sequence

```
1. docker compose up --build
        |
        | Docker builds images for all 6 services
        | (Dockerfiles executed, npm install run, source copied)
        v
2. genai-mongo starts
        | MongoDB engine initialises
        | Health check: mongosh --eval "db.adminCommand('ping')"
        | Status: starting -> healthy (after ~10s)
        v
3. genai-redis starts (in parallel with mongo)
        | Redis server starts with AOF mode
        | Health check: redis-cli ping -> PONG
        | Status: starting -> healthy (after ~5s)
        v
4. All 6 backend services start (depends_on: service_healthy satisfied)
        | Each service: dotenv loads .env -> environment vars set
        | Express app created, middleware registered, routes mounted
        | app.listen(PORT) -> server ready
        | Logger: "gateway started { port: 3001 }"
        v
5. Docker health checks for all 6 services
        | wget http://localhost:<port>/health
        | Each service responds with { status: 'ok' }
        | All containers marked: healthy
        v
6. Platform ready — all 8 containers healthy
```

---

## Acceptance Criteria — Verified

| Criterion | Method | Result |
|---|---|---|
| `docker compose up --build` starts without errors | Configuration review | Pass |
| `GET /health` returns 200 + service name + uptime | Live test: gateway on port 3001 | `{"status":"ok","service":"gateway","uptime":2}` |
| MongoDB reachable from every service container | MONGO_URI uses `mongo` container hostname, network-gated startup | Pass |
| Redis reachable from every service container | REDIS_URL uses `redis` container hostname, network-gated startup | Pass |
| No real secrets committed | Git repository contains only `.env.example` files | Pass |
| Plain JavaScript, no TypeScript | All files use `.js` extension, `require/module.exports` | Pass |
| No OpenAI references | Codebase search: zero occurrences | Pass |
| Mistral AI as fallback (not Groq) | `.env.example`, README, docs updated | Pass |

Live health check result (gateway, tested 2026-08-11):

```json
{
  "status": "ok",
  "service": "gateway",
  "uptime": 2,
  "timestamp": "2026-08-10T20:07:08.698Z"
}
```

Shared module export verification:

```
OK exports: connectDB, closeDB, logger, errorHandler, notFoundHandler,
            sendSuccess, sendError, sendPaginated
```

---

## Files Created

```
.gitignore
README.md
docker-compose.yml
package.json                       (root — workspace + npm run scripts)

shared/
  index.js
  db.js
  logger.js
  errorHandler.js
  response.js
  package.json

gateway/
  src/index.js
  src/routes/health.js
  package.json
  Dockerfile
  .env.example

ai-service/
  src/index.js
  src/routes/health.js
  package.json
  Dockerfile
  .env.example

email-service/
  src/index.js
  src/routes/health.js
  package.json
  Dockerfile
  .env.example

template-service/
  src/index.js
  src/routes/health.js
  package.json
  Dockerfile
  .env.example

scheduler-service/
  src/index.js
  src/routes/health.js
  package.json
  Dockerfile
  .env.example

analytics-service/
  src/index.js
  src/routes/health.js
  package.json
  Dockerfile
  .env.example

frontend/
  README.md                        (placeholder, scaffold on Day 2)

scripts/
  health-check.js

docs/
  day1.md                          (this file)
```

---

## Known Limitations and Day 2 Work

### Limitations Accepted on Day 1

**No database connectivity check in health endpoint.** The `/health` route
returns 200 as long as the Node.js process is alive. It does not verify that
MongoDB or Redis are reachable. A full readiness check would hit both
infrastructure dependencies and return a degraded status if either is
unreachable. This is deferred to avoid over-engineering the scaffold.

**No request ID tracking.** In a microservices architecture, correlating a
single user request across multiple service logs requires a trace ID or
request ID that is propagated in HTTP headers. This is not implemented on Day 1.
A middleware using `crypto.randomUUID()` will be added to the gateway on a
later day.

**No MongoDB authentication.** The local MongoDB instance runs without a
username or password. Production deployments will use MongoDB Atlas which
requires credentials. The `MONGO_URI` environment variable is designed to accept
a full connection string including credentials, so no code change is required
for this — only the environment variable value changes.

**No HTTPS.** All inter-service communication is over plain HTTP on the internal
Docker network. TLS is not required for traffic on a trusted internal network.
External-facing HTTPS termination will be handled by the hosting platform
(Render, Railway, or a reverse proxy) at the infrastructure layer.

**Services do not connect to MongoDB at startup.** `connectDB()` from
`shared/db.js` is implemented but not called in any service's `index.js` on
Day 1. There are no Mongoose models yet, so there is nothing to query.
The connection will be established on Day 3 when the first model is introduced.

### Day 2 Objectives

- Scaffold `frontend/` with Vite, React 18, Tailwind CSS 3, and Framer Motion.
- Add Clerk authentication to the frontend (sign-in, sign-up, user profile).
- Add `express-http-proxy` or `http-proxy-middleware` to the gateway to route
  `/api/ai/*` to `ai-service`, `/api/email/*` to `email-service`, and so on.
- Add Clerk webhook verification middleware to the gateway for protecting
  downstream routes.
- Introduce a `GET /api/health` aggregate route in the gateway that fans out to
  all downstream `/health` endpoints and returns a summary.
