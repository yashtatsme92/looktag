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

Production keeps about 1 in 10 successful traces. Traces that end in a 5xx or a thrown error are always kept. Set `OTEL_TRACES_SAMPLER_ARG` (`0`–`1`) to override that ratio.

## What a request looks like

One trace id links the browser fetch, the server HTTP span, application `withSpan` spans, and `pg.query`:

1. The browser starts a client span and sends `traceparent`.
2. The server continues that trace. Its HTTP span is the parent of app spans and of `pg.query`.
3. The response sets `traceparent` and `X-Request-Id`.
4. Browser spans posted through `ingestClientSignals` keep the same `trace_id`.

Span attributes are `http.method`, `http.route` (the route pattern, not the raw id), `http.status_code`, and `app.*` (`app.route`, `app.feature`, `app.server_fn`, `app.auth.state` of `anonymous` or `signed_in`, `app.locale`, `app.flag.*`, `app.request_id`). There is no user id, cookie, authorization header, or request body. `pg.query` records `db.system=postgresql` and `db.statement` with literals stripped and no bound values.

Every signal carries the same resource: `service.name=looktag` (browser: `looktag-web`), `service.namespace`, `service.version`, `deployment.environment.name`, `deployment.id`, the git revision and branch, and `https://github.com/yashtatsme92/looktag`. Render adds `cloud.provider=render` and `cloud.region` when `RENDER_REGION` is set. Netlify previews add `cloud.provider=netlify` and `app.preview.pr`.

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
{resource.service.name="looktag" && resource.deployment.id="<RENDER_DEPLOY_ID or Netlify DEPLOY_ID>"}
```

A user report that includes `X-Request-Id` or a log line's `trace_id`:

```
{span.app.request_id="<id>"}
```

```
{trace:id="<trace id>"}
```

Dashboard variables: `service.version` and `deployment.id` from the resource, or the live values at `/api/version`.
