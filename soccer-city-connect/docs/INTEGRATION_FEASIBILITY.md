# Integration feasibility and official contracts

Reviewed November 19–20, 2026. Public documentation only. No developer accounts, agreements, credentials or customer accounts were obtained/accessed. Environment configuration reported no secrets or outbound identities. **Contract fixtures are not successful provider integrations. Actual provider Sandbox tests: zero. Live tests: zero.**

## Official source register

| ID | Source and review evidence |
| --- | --- |
| M1 | https://developers.mindbodyonline.com/ui/documentation/public-api — current script-rendered portal; text extraction empty. |
| M2 | https://raw.githubusercontent.com/mindbody/Mindbody-API-SDKs/main/PublicAPI/mindbody-public-api-python_generic_lib.zip — official SDK linked by M1; reviewed client controller/models/authentication. SHA-256 `5a13b9580f2ffa7fa871c23c0f7c7813c61673a0a5c7e550fe9b3d5f34c4e423`. |
| M3 | https://developers.mindbodyonline.com/ui/faq ; https://developers.mindbodyonline.com/Resources/ApiReleaseNotes — site pricing, public sandbox and incremental-client evidence. A portal documentation JSON asset returned 403; it is not treated as verified account access. |
| P1 | https://playpass.com/developers — manager tokens versus player OAuth, plan dependence, version/rate policy. |
| P2 | https://playpass.com/api/docs ; https://playpass.com/openapi.json — endpoint/response/pagination schemas. Retrieved OpenAPI SHA-256 `5303a5ec6dbcc4cba876aeef4c10dfc8b72af64ef936f56ce292f09f3f4a4ced`. |
| P3 | https://playpass.com/.well-known/oauth-authorization-server — player OAuth metadata, S256 and client_secret_post. |
| S1 | https://developer.squareup.com/docs/oauth-api/overview ; https://developer.squareup.com/docs/oauth-api/square-permissions — authorization and read scopes. |
| S2 | https://developer.squareup.com/docs/oauth-api/create-urls-for-square-authorization ; https://developer.squareup.com/reference/square/o-auth-api/obtain-token — exact callback, PKCE/token/refresh contracts. |
| S3 | https://developer.squareup.com/docs/devtools/sandbox/overview — separate test-seller environment and credentials. |
| S4 | https://developer.squareup.com/reference/square/payments-api/ListPayments ; https://developer.squareup.com/reference/square/customers-api/ListCustomers ; https://developer.squareup.com/reference/square/locations-api/list-locations ; https://developer.squareup.com/reference/square/orders-api/search-orders — read operations. |
| S5 | https://developer.squareup.com/docs/build-basics/common-api-patterns/pagination ; https://developer.squareup.com/docs/build-basics/general-considerations/handling-errors — cursor/rate/error behavior. |

Sources establish API capabilities, not Soccer City's configuration, entitlements or authorization. Revalidate pinned contracts against an approved test account before activation.

## Feasibility matrix

| Provider | Implemented foundation | Authorization | Sandbox / restrictions / unknowns |
| --- | --- | --- | --- |
| Mindbody | Client references, active pricing-option memberships, offset paging, incremental clients. Native transport restricted to public sandbox site -99. | SDK uses Api-Key and SiteId, plus endpoint-specific staff Authorization where permitted/required. Not a generic OAuth integration. | Free public sandbox requires developer access. Live approval and owner site activation are separate. Site IDs may represent multiple billable locations. Current staff permissions, plan entitlements, OAuth migration applicability and numeric rate ceiling remain unverified. |
| Playpass | Organizer registrations/schedule-list contract code, projection and paging, exercised through fixtures only. | Manager bearer token is organizer-scoped, limited by creator permissions and pricing plan. Player code/PKCE OAuth is a separate model. | Dedicated public sandbox not verified. Need official safe-test confirmation or approved test organizer and separate safety review. Native production-host transport remains absent while live mode is disabled. |
| Square | Sandbox-only customer/location/payment/order read foundations and PKCE/token lifecycle. | Seller OAuth with category-based read scopes; no write scope. | Requires developer app, authorized test seller, exact callback and secure configuration. Sandbox/production credentials differ. Actual seller/location/program mapping, region/product restrictions and scopes must be qualified. |

## Exact read contracts

### Mindbody — M1–M3

Base `https://api.mindbodyonline.com`; version path `/public/v6`:

- `GET /public/v6/client/clients`: request.limit=100, request.offset, optional request.lastModifiedDate (RFC3339).
- `GET /public/v6/client/activeclientmemberships`: request.clientId, request.limit=100, request.offset; optional single request.locationId. Cross-regional lookup is not enabled.
- Headers: Api-Key, SiteId; endpoint-specific staff Authorization token. Paging: PaginationResponse.RequestedOffset / PageSize / TotalResults. SDK default limit is 100; a maximum is not invented.
- Projection retains source IDs/status/update time only for clients. Membership identity uses client plus the purchased pricing-option Id, not shared MembershipId. Current is a pricing-option fact, not universal eligibility. Contact data, DOB, cards, documents, clinical notes and raw bodies are discarded.
- The numeric Public API rate ceiling and account-specific permissions were not independently established. Handle 429 conservatively and confirm with Mindbody before activation.

### Playpass — P1–P3

Base `https://playpass.com`; pinned X-Playpass-Api-Version `2026-02-08`:

- `GET /api/registrations?organizer_id=...&page=1&per_page=100`.
- `GET /api/schedules?organizer_id=...&page=1&per_page=100`.
- Data uses data.registrations / data.schedules; pagination uses meta.registrations / meta.schedules with page, per_page, total_pages and total_count. Organizer context is checked. Per-page cap is 100.
- No modification filter is documented for these operations; use full traversal. Schedule-list entries are program references, not timed occurrences. Registrations preserve status/activity ID; participant names, DOB and payment status do not establish identity.
- Published shared ceilings: 1,200 requests/IP/minute, 600/authenticated actor/minute, lower limits for sensitive operations. Retry-After seconds and RateLimit headers describe actual evaluated limits. Organizer pricing-plan limits still apply.
- Player metadata advertises `/api/oauth/authorize` and `/api/oauth/token`, code + S256, api:read/api:write and client_secret_post. This is documented, not implemented as manager authorization. Manager tokens come from the organizer's approved API-access workflow.

### Square — S1–S5

Sandbox base `https://connect.squareupsandbox.com`; pinned Square-Version `2026-11-18` (current reference version at review):

| Endpoint | Scope | Paging / incremental |
| --- | --- | --- |
| GET /v2/locations | MERCHANT_PROFILE_READ | Location inventory; no paging assumed. |
| GET /v2/customers | CUSTOMERS_READ | cursor, limit=100; full traversal. |
| GET /v2/payments | PAYMENTS_READ | cursor, limit=100; updated_at_begin_time. |
| POST /v2/orders/search | ORDERS_READ | Read-only search; selected location_ids, cursor, limit=100; query.filter.date_time_filter.updated_at.start_at. |

Cursors are transient; Square documents a five-minute lifetime. Restart interrupted imports rather than persist stale cursors. Rate ceilings are endpoint-dependent, not a universal published number. Use 429 backoff/jitter and Retry-After when supplied. Commerce records retain status/IDs and permitted location/customer references; never infer a participant registration or collect/process a payment.

Sandbox OAuth uses GET /oauth2/authorize and POST /oauth2/token. Authorization includes client ID, least-privilege scopes, random state, S256 challenge and exact callback. Exchange uses code/client ID/verifier; refresh uses refresh token/client ID. Codes are one-use and expire after five minutes; standard access tokens expire after 30 days. PKCE refresh tokens rotate and expire after 90 days. State is session/tenant-bound and expiring; verifier/tokens are encrypted server-side. Denial and replay are handled. A saved/exchanged token remains unverified account access until real qualification. No remote revoke or webhook consumer is implemented; local disconnect does not revoke an upstream provider grant.

## Common safety and unresolved semantics

New keys encode organization/provider/account/type/source ID as JSON tuples. Legacy fixture keys remain in tenant-scoped state. Imports project only permitted fields, upsert idempotently and commit records/checkpoints only after all pages validate. Partial failure keeps old records/tasks/checkpoint. Incremental checkpoints are per account/operation/selected scope, taken at import start with a five-minute overlap where supported. Full-list operations invent no delta query. Deletion/tombstone semantics require actual account validation; missing records never automatically resolve tasks.

Each page has an eight-second timeout, three attempts and exponential jitter. Long Retry-After defers the run, persists a retry time and blocks premature server retry. 401/403 are not retried; 401 cannot prove whether a token expired or was revoked. More than 100 pages, repeated cursors or malformed data fail safely. Errors/audits contain fixed codes/counts, not raw provider bodies/credentials. Source fixture/Sandbox evidence remains labeled. One-hour Sandbox import staleness is local policy, not a provider SLA. Live mode is blocked in both configuration and executable transports.
