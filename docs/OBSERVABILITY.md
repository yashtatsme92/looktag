# Observability

Looktag exports OTLP/HTTP JSON (traces, metrics, and logs) when a collector URL is set. Unset stays local: signals are buffered for `/admin/observability` and nothing is posted. Export failures are counted and dropped. They do not fail the request, and the auth header is never logged.

## Grafana Cloud

In the Render (or Netlify) service environment:

```
OTEL_SERVICE_NAME=looktag
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-<stack>.grafana.net/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64 of instanceId:token>
```

`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` overrides the traces URL if you already have a full `…/v1/traces` path. The base URL is expanded to `/v1/traces`, `/v1/metrics`, and `/v1/logs`.

Generate the basic-auth value in Grafana Cloud: Connections → OpenTelemetry. Use the instance id as the username and the token as the password. Do not commit the token.

Production keeps about 1 in 10 successful traces. Traces that end in a 5xx or a thrown error are always kept. Set `OTEL_TRACES_SAMPLER_ARG` (`0`–`1`) to override that ratio. A browser `traceparent` continues the trace id, but the client cannot force sampling: an untrusted `-01` does not win, and the server applies its own ratio. A trusted internal parent may still honor the sampled flag. The response `traceparent` matches that decision. A kept error forces the flag to sampled. The server records the decision under the trace id as it handles the request, so a browser HTTP span exported later follows that decision instead of waiting for the server span.

`deployment.environment.name` is `DEPLOYMENT_ENV` when that is `production`, `preview`, or `development`. Otherwise it is `APP_ENV`, then the host (`RENDER`, Netlify `CONTEXT` / `REVIEW_ID`), then `NODE_ENV=production`.

On Render set `TRUST_PROXY=1`. Anonymous ingest then rate-limits on the first `X-Forwarded-For` hop. Leave it unset anywhere else: the socket address is used, and a spoofed forwarding header cannot split the bucket.

## What a request looks like

One trace id links the browser fetch, the server HTTP span, application `withSpan` spans, and `pg.query`:

1. The browser starts a client span and sends `traceparent`.
2. The server continues that trace. Its HTTP span is the parent of app spans and of `pg.query`.
3. The response sets `traceparent` and `X-Request-Id`.
4. Browser spans posted through `ingestClientSignals` keep the same `trace_id` and parent the server span. The client sends one batch per flush. The upload itself is not a span: `x-looktag-telemetry: 1` skips server tracing only for that server function, not for any other route. Any visitor can post signals: 60 requests per minute per client IP, 64 KB per body, and a strict span/metric/log schema. Admin auth stays on the observability page reads. Email/password is not required.

Span attributes are `http.method`, `http.route` (the route pattern, not the raw id), `http.status_code`, and `app.*` (`app.route`, `app.feature`, `app.server_fn`, `app.auth.state` of `anonymous` or `signed_in`, `app.locale`, `app.flag.*`, `app.request_id`). Browser fetch spans mark 4xx and 5xx with `error.type` set to the status code. There is no user id, cookie, authorization header, or request body. `pg.query` records `db.system=postgresql` and `db.statement` with string and numeric literals stripped. Placeholders such as `$1` stay. Bound values are not attached.

Every signal carries the same resource: `service.name=looktag` (browser: `looktag-web`), `service.namespace`, `service.version` (the `package.json` version baked at build), `deployment.environment.name`, `deployment.id`, the git revision and branch, and `https://github.com/yashtatsme92/looktag`. `deployment.id` is `RENDER_DEPLOY_ID`, then Netlify `DEPLOY_ID`, then the git revision when the host has no deploy id. Docker images have no `.git`. The Dockerfile accepts build args `GIT_COMMIT` and `RENDER_GIT_COMMIT` (plus `RENDER_GIT_BRANCH` and `RENDER_DEPLOY_ID`). Render passes those when they are declared; the Render build command stays `npm run build`. Render adds `cloud.provider=render` and `cloud.region` when `RENDER_REGION` is set. Netlify previews add `cloud.provider=netlify` and `app.preview.pr`.

`/api/version` returns `serviceVersion`, `deploymentId`, and `gitSha` next to `version`, `commit`, and `builtAt`.

Server logs emitted during a request include `trace_id` and `span_id`. Error reports sent to Sentry carry the same values as tags. A failed request logs `request-error` with `trace_id`, `span_id`, and `request_id`.

## Finding a deployment's traces

In Grafana, open Explore → Tempo. The service name is `looktag`.

TraceQL for this release in production:

```
{resource.service.name="looktag" && resource.service.version="2.5.36" && resource.deployment.environment.name="production"}
```

Errors for one git revision:

```
{resource.service.name="looktag" && resource.vcs.ref.head.revision="<full sha>" && status=error}
```

One deploy:

```
{resource.service.name="looktag" && resource.deployment.id="<RENDER_DEPLOY_ID, Netlify DEPLOY_ID, or git revision>"}
```

A user report that includes `X-Request-Id` or a log line's `trace_id`:

```
{span.app.request_id="<id>"}
```

```
{trace:id="<trace id>"}
```

Dashboard variables: `service.version` and `deployment.id` from the resource, or the live values at `/api/version`.
