# GameGrub Product Upgrade Checklist

## How to use this tracker

This file is the source of truth for planned product upgrades. Every task has a
stable ID so it can be requested directly, for example: `Complete PAY-01` or
`Work on the next P0 task`.

When a task is implemented, update its status, fill in the completion record,
and link the key files and tests. Do not mark a task complete until its
acceptance checks and relevant verification commands have passed.

Status key:

- `[ ]` Backlog
- `[~]` In progress
- `[x]` Complete
- `[-]` Blocked or intentionally deferred

Priority key:

- `P0` Required for trustworthy production transactions and operations
- `P1` High-value customer and operator experience improvements
- `P2` Valuable enhancements after the core journey is reliable

## Recommended delivery order

1. `FND-01`, `PAY-01`, `PAY-02`
2. `NTF-01`, `UX-02`, `UX-03`, `UX-06`
3. `OPS-01`, `OPS-02`, `UX-01`, `UX-04`, `UX-05`
4. `UX-07`, `TOU-01`, `ARC-01`, `FND-02`
5. `FND-03`
6. `FND-04`
7. `DEP-01`
8. `DATA-01`

## Foundation and quality

### [x] FND-01 - Critical journey integration coverage

Priority: P0

Scope: Add automated backend integration tests for registration/login, booking
creation and cancellation, session settlement, order checkout, payment state,
and permission boundaries. Add a small browser/mobile smoke journey that proves
the three applications work with the Docker stack.

Acceptance checks:

- Tests cover successful and rejected requests for each critical journey.
- Tests use disposable data and do not depend on the development SQL seed.
- CI runs the backend, admin, and Flutter checks consistently.
- A failed migration, unavailable database, and expired session produce clear
  test failures.

Verification: `cd backend; npm test`, `cd gamegrubadmin; npm run test:ci`,
`cd gamegrub_user; flutter test`.

Dependencies: none.

### [x] FND-02 - Observability and operational alerts

Priority: P2

Scope: Extend the existing structured logs and cron health endpoint with
actionable alerts, dashboardable metrics, error tracking, and documented runbooks
for payment, booking, and scheduler failures.

Acceptance checks:

- An operator can detect failed cron jobs, failed payments, and elevated API
  errors without reading raw logs.
- Alerts carry a request ID or job run ID for investigation.
- Alert destinations and secrets are environment-configured.

Dependencies: `FND-01`.

Completion: Added rolling HTTP error and latency metrics, failed payment
tracking, scheduler health alerts with request/job correlation IDs, and an
environment-configured webhook with cooldowns. Added a super-admin operations
dashboard, production webhook configuration checks, Compose environment
plumbing, and payment/booking/scheduler runbooks. Webhook alert history and
cooldowns were later made durable and shared across instances by FND-04;
HTTP metrics/error samples and payment/cron data are also read from durable
records.
Key files: `backend/utils/operationalMetrics.js`,
`backend/routes/adminOperations.js`, `backend/cron/monitor.js`,
`gamegrubadmin/src/components/OperationsMonitor.js`,
`docs/operations-runbooks.md`.

### [x] FND-03 - Durable shared HTTP observability

Priority: P2

Scope: Persist HTTP request/error metrics in shared storage so the operations
dashboard stays useful after backend restarts and aggregates all backend
instances. Keep recent failure samples correlated to request IDs with bounded
retention.

Acceptance checks:

- HTTP counts, error rates, latency, and status breakdown aggregate across
  backend instances and survive process restarts.
- Recent server errors retain request IDs and safe normalized routes.
- A missing or unavailable metrics store is reported as degraded in the
  operations dashboard.
- Old minute buckets and error samples are pruned automatically.

Dependencies: `FND-02`.

Completion: Added shared SQL minute buckets by backend instance and response
status, durable recent 5xx samples with request IDs and normalized routes, and
90-day retention cleanup. The super-admin dashboard now aggregates HTTP
metrics from the shared database and reports the API source as degraded if the
store is unavailable. Corrected the operations runbook to match its super-admin
access guard. Key files: `backend/migrations/20261126_create_operational_http_metrics.js`,
`backend/utils/operationalMetricStore.js`, `backend/utils/operationalMetrics.js`,
`backend/routes/adminOperations.js`, `backend/test/operationalMetricStore.test.js`,
`docs/operations-runbooks.md`.

### [x] FND-04 - Shared operational alert history and cooldowns

Priority: P2

Scope: Persist alert history, delivery outcomes, and cooldown claims in the
shared database so backend replicas do not emit duplicate alerts and operators
can review alerts after a restart.

Acceptance checks:

- Only one replica emits a given alert during its configured cooldown window.
- Recent alert history and webhook delivery outcome survive process restarts.
- Database failure falls back to structured logs and clearly degrades the
  dashboard source status.

Dependencies: `FND-03`.

Completion: Added a transaction-backed, database-wide cooldown claim so only
one replica records and delivers each threshold alert during the cooldown.
Alert history and delivered, failed, or unconfigured webhook status now persist
across restarts and appear in the operations dashboard. Dashboard alert-history
availability is reported as degraded when its database source is unavailable.
Key files: `backend/migrations/20261126_create_operational_alert_history.js`,
`backend/utils/operationalMetricStore.js`, `backend/utils/operationalMetrics.js`,
`backend/routes/adminOperations.js`, `backend/test/operationalMetricStore.test.js`,
`docs/operations-runbooks.md`.

## Payments and billing

### [x] PAY-01 - Verified online payment gateway

Priority: P0

Scope: Replace client-recorded UPI/card/wallet success with a provider-backed
payment intent/order flow. Use server-side amount creation, provider signature
verification/webhooks, idempotency, and explicit pending/failed/captured states.

Acceptance checks:

- The browser or mobile app never decides that a payment is captured.
- Amount, booking ownership, and payment state are validated server-side.
- Duplicate callbacks and retried requests do not double-charge or double-book.
- The checkout UI clearly explains pending, failed, cancelled, and completed
  payment states.
- Signed provider-response tests cover success, failure, cancellation, and
  duplicate webhook delivery. A live Razorpay sandbox round-trip still needs
  test credentials and a reachable HTTPS webhook endpoint.

Dependencies: `FND-01`.

### [x] PAY-02 - Refunds, receipts, and reconciliation

Priority: P0

Scope: Add booking and order refund workflows, downloadable/shareable receipts,
and a finance reconciliation view for gateway transactions, cash, UPI, and
operator adjustments.

Acceptance checks:

- Eligible cancellations can request and process a full or partial refund.
- Every bill and payment has a durable receipt/reference.
- Admins can filter unresolved payment/refund mismatches and leave an audit note.
- Users receive a clear outcome for every refund request.

Dependencies: `PAY-01`.

## Notifications and support

### [x] NTF-01 - Customer notification platform

Priority: P1

Scope: Add mobile/web push delivery in addition to the existing in-app and email
tournament notifications. Cover booking reminders, no-show warnings, session
end, food readiness, payment/refund outcomes, waitlist movement, and tournament
updates.

Acceptance checks:

- Users can opt in/out by notification category.
- Notifications deep-link to the relevant booking, order, bill, or tournament.
- Delivery attempts, failures, and read state are observable.
- Time-sensitive reminders are idempotent and timezone-aware.

Dependencies: `FND-01`.

### [x] OPS-02 - In-app help and issue resolution

Priority: P1

Scope: Add café contact details, FAQs, booking/order issue reporting, refund
request entry points, and a customer-visible issue status timeline.

Acceptance checks:

- A customer can get help from any active booking, order, or bill.
- Café support details no longer fall back to "coming soon".
- Admins can assign, comment on, resolve, and audit support issues.

Dependencies: `OPS-01`.

Completion: Added contextual customer help from cafes, bookings, orders, and
bills; cafe contact details and seeded FAQs; customer support requests with
private timelines; and a cafe-scoped admin desk for assignment, replies,
private notes, priorities, resolution, and audit history. Refund actions link
back to the existing booking and bill refund flows. See `docs/in-app-support.md`.

## Customer booking and café experience

### [x] UX-01 - Intent-based café and setup discovery

Priority: P1

Scope: Expand discovery to recommend the best café/PC for a game, budget,
duration, group size, equipment needs, and availability. Build on Game Guru
rather than creating a disconnected recommendation path.

Acceptance checks:

- Users can filter by location, open-now, game, PC tier, price, food, rating,
  and tournaments.
- Recommendations explain why a setup is suitable and show live availability.
- The user can book directly from a recommendation.

Dependencies: `PAY-01`.

Completion: Added structured café and setup filters, fit-ranked
recommendations with explanations and live station availability, and direct
booking with the planned visit window preselected after a fresh availability
check. See `docs/intent-based-discovery.md`.

### [x] UX-02 - Live visit and QR check-in

Priority: P1

Scope: Give each booking a QR check-in code and build a live visit view with
assigned station, countdown, extension action, food order status, and running
bill.

Acceptance checks:

- Staff can validate check-in from the admin workspace or a controlled scanner
  workflow.
- Users see a single accurate state for confirmed, checked in, running,
  ending, and settled sessions.
- Check-in prevents accidental use of another customer's reservation.

Dependencies: `NTF-01`, `PAY-01`.

### [x] UX-03 - Station waitlist and cancellation recovery

Priority: P1

Scope: Let customers join a waitlist for a preferred station, category, or time
window and claim an opening when a cancellation occurs.

Acceptance checks:

- Compatible requests are offered in join order; a claim hold defaults to 10
  minutes, and an expired offer advances to the next request.
- A cancellation creates openings for future contiguous station hours; one
  opening cannot be claimed by multiple users.
- Users receive a notification and can complete booking without restarting the
search flow.

Dependencies: `NTF-01`, `PAY-01`.

### [x] UX-04 - Rich café profiles and navigation

Priority: P1

Scope: Complete café details with address, map/directions, hours, contact,
amenities, equipment, gallery, parking/accessibility, policies, and verified
reviews.

Acceptance checks:

- Every public café has validated contact and operating-hour information.
- Users can obtain directions and determine whether a café meets their needs.
- Admins can maintain this information without database changes.

Dependencies: `OPS-01`.

Completion: Added validated public café profile fields and completeness checks,
directions, contact actions, timezone-aware hours, amenities, equipment,
gallery, parking, accessibility, policies, and the verified-purchase review
feed. Super admins can maintain profile details in the business manager without
SQL changes. Legacy listings without real contact, address, or hours remain
hidden until completed. See `docs/rich-cafe-profiles.md`.

### [x] UX-05 - Tournament community cards

Priority: P1

Scope: Connect the existing community-post API to the customer tournament
screen, including post detail, linked event navigation, loading/error/empty
states, and read-friendly moderation-safe content.

Acceptance checks:

- Published, currently active posts render in the customer app.
- Linked tournament cards navigate to the correct detail view.
- Draft, expired, and unpublished posts never appear publicly.
- Widget and API tests cover visibility and ordering.

Dependencies: `FND-01`.

Completion: Connected the public community-post feed to the customer tournament
Updates tab, including anonymous access, plain-text post details, linked event
navigation, and loading, retryable error, and empty states. The public API now
requires a publish timestamp and active schedule, preserves priority ordering,
and hides links to unpublished events. See
`docs/tournament-community-cards.md`.

### [x] UX-06 - Food ordering status and ETA

Priority: P1

Scope: Make food ordering feel live: show accepted/preparing/ready/delivered
states, preparation ETA, order notes, kitchen updates, and a notification when
items are ready.

Acceptance checks:

- Customer and kitchen see the same order state.
- Status transitions are authorized and recorded with timestamps.
- The customer can see which items are unavailable before checkout.

Dependencies: `NTF-01`, `PAY-01`.

### [x] UX-07 - Loyalty, referrals, and retention loops

Priority: P2

Scope: Add referral credits, visit streaks, achievement badges, birthday offers,
personalized challenges, and transparent loyalty history/redemption rules.

Acceptance checks:

- Rules are server-authoritative and auditable.
- Users understand how points were earned, spent, expired, or reversed.
- Abuse controls prevent self-referrals and duplicate reward grants.

Dependencies: `PAY-02`, `NTF-01`.

Completion: Added one-time private birthday details, unique referral codes and
first-visit referral credits, visit-day streaks, achievement badges, tier-based
monthly challenges, annual birthday rewards, and an auditable reward ledger.
Reward grants are idempotent and issued with settlement; profile and referral
guards prevent birthday rewrites, self-referrals, and repeat claims. Customers
can review their balance, rules, progress, badges, and transaction history in
the loyalty screen. See `docs/loyalty-retention.md`.

## Tournament and social experience

### [x] TOU-01 - Tournament discovery and social play

Priority: P2

Scope: Add calendar export/reminders, team finder, player profile sharing,
match/result highlights, spectator-friendly brackets, and optional moderated
comments or reactions.

Acceptance checks:

- Players can discover events relevant to their games, location, and skill
  level.
- Teams can safely find members without exposing private contact details.
- Calendar entries reflect timezone, venue, and schedule changes.
- Community interaction has reporting and moderation controls.

Dependencies: `NTF-01`, `UX-05`.

## Multi-café administration and code health

### [x] OPS-01 - Business onboarding and configuration

Priority: P1

Scope: Build super-admin tools and APIs to create/edit cafés, control listing
status, configure operating details, station/menu ownership, fees, payout
settings, staff assignments, and branded public profiles.

Acceptance checks:

- A super admin can onboard a new café without SQL access.
- Standard admins can only manage their assigned cafés.
- Every scoped admin request rejects cross-café access.
- Changes are audited and covered by permission tests.

Dependencies: `FND-01`.

Completion: Added the super-admin business manager, validated profile and fee
configuration, staff membership editing, payout policy and threshold
enforcement, transaction-backed audit records, and existing-owner checks on
station/menu edits. See `docs/business-onboarding.md`.

### [x] ARC-01 - Modularize high-churn features

Priority: P2

Scope: Continue the successful tournament-route split across booking, order,
admin, billing/POS, and Flutter tournament/checkout screens. Introduce focused
domain services only where they reduce real duplication.

Acceptance checks:

- Existing behavior and public API contracts remain unchanged.
- Large modules are split along feature boundaries, with no cosmetic-only
  rewrite.
- Relevant automated tests are added or strengthened before/with refactors.

Dependencies: `FND-01`.

Completion: Split customer booking reads, food checkout, and admin POS reads into
focused route modules registered on their existing routers, preserving route
paths and permission middleware. Extracted the Razorpay attempt-status dialog
from the Flutter checkout screen. Added backend route and Flutter widget
regression coverage. Key files: `backend/routes/bookingReadRoutes.js`,
`backend/routes/orderCheckoutRoutes.js`, `backend/routes/adminPosReadRoutes.js`,
`gamegrub_user/lib/screens/payment/payment_attempt_status_dialog.dart`.

## Completion record

Add one entry here whenever a task reaches `[x]`. Keep the task ID in the entry
so completed work is easy to find and is not scheduled again.

| Date | Task | Outcome | Verification |
| --- | --- | --- | --- |
| 2026-10-25 | FND-01 | Added seed-free journey route coverage, revoked-session and migration/database failure checks, and a Docker stack smoke check for the backend, admin bundle, and Flutter web bundle. Key files: `backend/test/criticalJourneyRoutes.test.js`, `backend/test/app.integration.test.js`, `backend/test/migrationFailure.test.js`, `scripts/smoke-test.ps1`, `.github/workflows/docker-stack-smoke.yml`. | Backend `node --test` (121 passed); admin tests (3 passed) and build; Flutter tests and analysis; Docker stack smoke passed. |
| 2026-10-25 | PAY-01 | Replaced customer-reported success with verified Razorpay orders, signed checkout/webhook state transitions, idempotent attempts, explicit checkout states, and server-side settlement. Fixed booking loyalty credits so redeemed points carry into final billing. Key files: `backend/routes/payment.js`, `backend/routes/booking.js`, `backend/utils/razorpay.js`, `backend/utils/paymentCheckout.js`, `gamegrub_user/lib/screens/payment/booking_checkout_screen.dart`, `docs/payments/verified-razorpay-checkout.md`. A live Razorpay sandbox round-trip remains deployment-config dependent. | Backend suite: 130 passed; Flutter analyze and 23 tests passed; Docker migration and stack smoke passed. |
| 2026-10-25 | PAY-02 | Added full and partial booking/order refund requests with provider/offline processing and customer-visible outcomes, durable bill/payment receipts with downloadable PDFs, a transaction ledger, and an admin refund/reconciliation workspace with filters, audit notes, and adjustments. Key files: `backend/routes/payment.js`, `backend/routes/booking.js`, `backend/routes/bills.js`, `backend/routes/adminSettlements.js`, `backend/utils/paymentRefunds.js`, `backend/utils/paymentLedger.js`, `backend/migrations/20261026_add_payment_refunds_receipts.js`, `backend/test/paymentRefunds.test.js`, `backend/test/razorpayGateway.test.js`, `gamegrubadmin/src/pages/FinanceOperations.js`, `gamegrub_user/lib/screens/bill/bill_screen.dart`. | Backend suite: 133 passed; admin tests: 3 passed and production build passed; Flutter analyze clean and 23 tests passed; Docker migration applied and stack smoke passed. |
| 2026-10-25 | NTF-01 | Added a customer notification inbox with per-category push preferences, delivery diagnostics and read state, timezone-aware idempotent booking reminders, and event notifications for bookings, sessions, orders, payments, refunds, waitlists, and tournaments. Added Firebase Cloud Messaging delivery configuration and deep links into relevant app screens. Key files: `backend/migrations/20261027_create_customer_notifications.js`, `backend/utils/customerNotifications.js`, `backend/cron/notificationEngine.js`, `backend/routes/notifications.js`, `gamegrub_user/lib/providers/notification_provider.dart`, `gamegrub_user/lib/screens/profile/notification_center_screen.dart`, `gamegrub_user/lib/utils/notification_navigation.dart`, `docs/customer-notifications.md`. | Backend suite: 139 passed; Flutter analyze clean and 23 tests passed; web build passed; Docker migration applied with matching checksum, notification cron healthy, authenticated inbox guard returned 401, and Firebase web assets served. Live FCM delivery requires deployment credentials and was not exercised. |
| 2026-10-25 | UX-02 | Added signed customer-owned booking QR codes, a cafe-scoped admin scanner with camera/USB/manual input, and a customer/station confirmation step before one-time check-in. Check-in state is now reflected consistently in booking history and the live visit screen, which refreshes booking, bill, and order data and retains station, countdown, food, extension, and checkout details. No-show cancellation skips checked-in visits and uses the cafe timezone. Key files: `backend/migrations/20261028_add_booking_check_in.js`, `backend/utils/bookingCheckIn.js`, `backend/routes/booking.js`, `backend/routes/admin.js`, `backend/cron/noShowEngine.js`, `gamegrub_user/lib/screens/session/session_screen.dart`, `gamegrub_user/lib/models/booking.dart`, `gamegrubadmin/src/components/BookingCheckInScanner.js`, `gamegrubadmin/src/pages/POSDesk.js`, `docs/live-visit-check-in.md`. | Backend suite: 145 passed; Flutter analyze clean, 23 tests passed, and web build passed; admin tests: 3 passed and production build passed; Docker migration applied with matching checksum, all app services healthy, and both check-in routes returned 401 without authentication. |
| 2026-10-25 | UX-03 | Added FIFO station/category waitlists, exact future-window matching, 10-minute single-customer offers, expiry and queue advancement, and recovery openings across customer, payment, admin, and no-show cancellations. Customers can join, manage, and claim offers directly into secure checkout from the notification link. Key files: `backend/migrations/20261029_create_station_waitlist.js`, `backend/utils/stationWaitlist.js`, `backend/routes/stationWaitlist.js`, `backend/routes/booking.js`, `backend/routes/payment.js`, `backend/cron/stationWaitlistEngine.js`, `gamegrub_user/lib/screens/booking/station_waitlist_screens.dart`, `gamegrub_user/lib/services/station_waitlist_service.dart`, `gamegrub_user/lib/utils/notification_navigation.dart`, `docs/station-waitlist.md`. | Backend suite: 151 passed; Flutter analyze clean and 23 tests passed; Flutter web build passed (Wasm dry-run notes the existing `flutter_secure_storage_web` JS imports); migration checksum matched; Docker services healthy; waitlist route returned 401 without authentication and the served user bundle contains the waitlist screen. |
| 2026-10-25 | UX-06 | Added a shared accepted/preparing/ready/delivered lifecycle, admin-scoped sequential kitchen transitions with timestamp history, editable preparation ETAs, ready notifications, customer kitchen notes, live customer status refresh, and visible disabled unavailable menu items with checkout revalidation. Key files: `backend/migrations/20261030_add_food_order_lifecycle.js`, `backend/migrations/20261031_allow_delivered_food_orders.js`, `backend/routes/order.js`, `backend/utils/orderLifecycle.js`, `gamegrubadmin/src/pages/KitchenQueue.js`, `gamegrub_user/lib/screens/food/food_screen.dart`, `gamegrub_user/lib/screens/food/cart_screen.dart`, `docs/food-order-status.md`. | Backend suite: 158 passed; admin tests: 3 passed and production build passed; Flutter analyze clean, 25 tests passed, and web build passed (Wasm dry-run notes existing `flutter_secure_storage_web` imports); both migrations applied with matching checksums; lifecycle transitions accepted through delivered succeeded in a rollback-only MariaDB check; Docker app services healthy, customer/admin pages served, and protected order routes returned 401 without authentication. |
| 2026-10-25 | OPS-02 | Added customer help from cafe profiles, bookings, live orders, bills, and profile; cafe contact details and five default FAQs; ownership-checked issue reporting; customer-visible replies and status history; and a cafe-scoped admin support desk for assignment, priority, customer replies, private notes, resolution, closure, and audit history. Refund entry points return customers to existing booking/bill refund flows. Key files: `backend/migrations/20261102_support_issues.js`, `backend/routes/support.js`, `backend/test/supportRoutes.test.js`, `gamegrubadmin/src/pages/SupportDesk.js`, `gamegrub_user/lib/screens/support/support_center_screen.dart`, `gamegrub_user/lib/services/support_service.dart`, `docs/in-app-support.md`. | Backend suite: 166 passed; admin tests: 3 passed and production build passed; Flutter analyze clean, 25 tests passed, and web build passed; migration applied with matching checksum; Docker app smoke passed, all app services healthy, FAQ route returned five entries, and protected customer/admin routes returned 401 without authentication. |
| 2026-10-25 | UX-01 | Added location, game/tournament, station tier, price, rating, open-now, food, tournament, date/time, duration, and group-size filters; explainable recommendations rank live setups by fit; GameGuru opens with the session context; and direct booking carries the planned date and hours into the existing booking flow, which refreshes availability before preselecting slots. Key files: `backend/utils/businesses.js`, `backend/routes/business.js`, `backend/test/businessDiscovery.test.js`, `gamegrub_user/lib/models/cafe_discovery.dart`, `gamegrub_user/lib/services/business_service.dart`, `gamegrub_user/lib/screens/home/cafe_marketplace_screen.dart`, `gamegrub_user/lib/screens/booking/booking_screen.dart`, `gamegrub_user/test/cafe_discovery_model_test.dart`, `docs/intent-based-discovery.md`. | Backend suite: 170 passed; Flutter analyze clean and 26 tests passed; Flutter web build passed (Wasm dry-run notes existing `flutter_secure_storage_web` JS imports); Docker backend and user web rebuilt and healthy; discovery endpoint returned live results with six available stations. |
| 2026-10-25 | UX-04 | Added validated address/contact/hour requirements, directions and contact actions, timezone-aware hours, amenities, equipment, gallery, parking, accessibility, policies, and the verified-purchase review feed. Added admin editing for all profile fields and filters that keep incomplete legacy listings private. Key files: `backend/migrations/20261103_business_profile_details.js`, `backend/utils/businessProfile.js`, `backend/utils/businesses.js`, `backend/routes/businessAdmin.js`, `gamegrubadmin/src/pages/BusinessManagement.js`, `gamegrub_user/lib/models/business.dart`, `gamegrub_user/lib/screens/home/cafe_detail_screen.dart`, `docs/rich-cafe-profiles.md`. | Backend suite: 176 passed; Flutter analyze clean and 27 tests passed; admin tests: 3 passed and production build passed; Docker backend/admin/user-web rebuilt, all app services healthy, migration applied with matching checksum, health and frontend endpoints returned 200. Public café list and discovery returned empty because the current seed lacks complete, verified profile data; admin editing is available to enter the actual café information. |
| 2026-10-25 | UX-05 | Connected the public curated post feed to the customer Updates tab, added post detail and linked-event navigation even when an event is outside the active café feed, and exposed loading, retryable error, and empty states to signed-in and anonymous customers. The API now filters by published status, publish timestamp, and active schedule; orders by priority/publish time; and omits unpublished linked events. Key files: `backend/routes/tournamentPublicRoutes.js`, `backend/utils/tournamentContent.js`, `backend/test/tournamentPublicRoutes.test.js`, `gamegrub_user/lib/services/tournament_service.dart`, `gamegrub_user/lib/providers/tournament_provider.dart`, `gamegrub_user/lib/models/tournament.dart`, `gamegrub_user/lib/screens/tournaments/tournament_screen.dart`, `gamegrub_user/test/tournament_community_test.dart`, `gamegrub_user/test/tournament_screen_test.dart`, `docs/tournament-community-cards.md`. | Backend suite: 178 passed; Flutter analyze clean and 31 tests passed; Docker backend/user-web rebuilt, all app services healthy, health endpoints and user web returned 200, community API returned 200 (no currently active posts in local data). |
| 2026-10-25 | UX-07 | Added private one-time birthdays, idempotent referral and retention rewards, visit-day streaks, badges, personalized monthly visit challenges, and a customer loyalty screen with redemption rules and ledger history. Key files: `backend/migrations/20261104_loyalty_retention_program.js`, `backend/utils/loyaltyProgram.js`, `backend/routes/loyalty.js`, `backend/test/loyaltyProgram.test.js`, `gamegrub_user/lib/screens/profile/loyalty_program_screen.dart`, `gamegrub_user/lib/services/loyalty_service.dart`, `gamegrub_user/test/loyalty_program_screen_test.dart`, `docs/loyalty-retention.md`. | Backend suite: 184 passed; Flutter analyze clean and 33 tests passed; Flutter web build passed (Wasm dry-run reports the existing `flutter_secure_storage_web` JS imports); migration applied with matching checksum; Docker health returned 200, protected loyalty route returned 401 without authentication, and user web returned 200. |
| 2026-10-25 | TOU-01 | Added event skill levels and discovery filters, opt-in player profiles with contact details excluded from public APIs, shareable player profiles, venue-aware ICS calendar export with 24-hour and 1-hour alarms, idempotent tournament reminders and schedule-change notifications, recent public match highlights, and community likes/reports with a permission-gated moderation queue. Key files: `backend/migrations/20261105_tournament_social_features.js`, `backend/routes/tournamentSocialRoutes.js`, `backend/routes/tournamentCommunityInteractionRoutes.js`, `backend/routes/tournamentCommunityAdminRoutes.js`, `backend/routes/tournamentPublicRoutes.js`, `backend/cron/notificationEngine.js`, `gamegrubadmin/src/pages/CommunityPulseStudio.js`, `gamegrub_user/lib/screens/tournaments/tournament_player_finder_screen.dart`, `gamegrub_user/lib/utils/tournament_calendar.dart`, `docs/tournament-discovery-social-play.md`. | Backend suite: 191 passed; Flutter analysis clean and 35 tests passed; admin tests: 3 passed and production build passed; Flutter web build passed (Wasm dry-run notes existing `flutter_secure_storage_web` JS imports); migration applied with matching checksum; all Docker app services healthy; discovery, highlights, community, health, and frontend smoke returned 200; profile, reaction, and report-queue guards returned 401 without authentication. |
| 2026-10-25 | ARC-01 | Split booking customer reads, food checkout, admin POS read routes, and the Flutter payment-attempt status dialog into feature modules while preserving route/API behavior. Key files: `backend/routes/bookingReadRoutes.js`, `backend/routes/orderCheckoutRoutes.js`, `backend/routes/adminPosReadRoutes.js`, `backend/test/bookingReadRoutes.test.js`, `backend/test/adminPosReadRoutes.test.js`, `backend/test/criticalJourneyRoutes.test.js`, `gamegrub_user/lib/screens/payment/payment_attempt_status_dialog.dart`, `gamegrub_user/test/payment_attempt_status_dialog_test.dart`. | Backend suite: 193 passed; Flutter analysis clean and 37 tests passed; `node --check` passed for changed backend route and test files. |
| 2026-10-25 | FND-02 | Added HTTP error/latency and payment failure metrics, scheduler failure/health alerts with correlation IDs, a protected super-admin operations dashboard, configurable webhook delivery and production validation, and payment/booking/scheduler runbooks. Key files: `backend/utils/operationalMetrics.js`, `backend/routes/adminOperations.js`, `backend/cron/monitor.js`, `backend/routes/payment.js`, `gamegrubadmin/src/components/OperationsMonitor.js`, `docs/operations-runbooks.md`. | Backend suite: 199 passed; focused observability tests: 13 passed; admin dashboard tests: 5 passed and production build passed; changed backend syntax checks and `docker compose config --quiet` passed. |
| 2026-11-26 | FND-03 | Added durable per-instance HTTP minute metrics, correlated 5xx samples with normalized routes, 90-day cleanup, shared dashboard aggregation, and explicit degraded-source reporting. Corrected the runbook’s super-admin access description. Key files: `backend/migrations/20261126_create_operational_http_metrics.js`, `backend/utils/operationalMetricStore.js`, `backend/utils/operationalMetrics.js`, `backend/routes/adminOperations.js`, `backend/test/operationalMetricStore.test.js`, `docs/operations-runbooks.md`. | Backend suite: 202 passed; focused persistence/dashboard tests: 5 passed; changed backend syntax checks and Compose config passed; migration applied to MariaDB 10.11 and a live write/read/route-normalization check passed. |
| 2026-11-26 | FND-04 | Added atomic shared cooldown claims, persistent alert history and delivery status, retention cleanup, and operations dashboard history aggregation across replicas and restarts. Added production startup warnings for missing payment and push provider config. Key files: `backend/migrations/20261126_create_operational_alert_history.js`, `backend/utils/operationalMetricStore.js`, `backend/utils/operationalMetrics.js`, `backend/routes/adminOperations.js`, `backend/config/runtime.js`, `backend/test/operationalMetricStore.test.js`, `backend/test/runtimeConfig.test.js`, `docs/operations-runbooks.md`. | Backend suite: 204 passed; focused alert/persistence tests: 7 passed; syntax checks and Compose config passed; migration applied to MariaDB 10.11; a concurrent two-instance claim check produced exactly one winner and persisted a delivered outcome. |

## Working agreement for future requests

1. Select the named task, or the highest-priority unblocked task when asked for
   the next task.
2. Change its status to `[~]` before implementation.
3. Implement only its defined scope, including necessary migrations, clients,
   tests, and documentation.
4. Run the task's acceptance checks and relevant project verification.
5. Mark it `[x]` only after verification, then add a completion-record entry.
6. If blocked, mark it `[-]`, explain the blocker in the task, and do not select
   it again until the blocker is resolved.

## Deployment verification

### [-] DEP-01 - Configure and verify live external providers

Priority: P0

Scope: Configure the real operational alert destination, SMTP provider,
Razorpay sandbox credentials and public HTTPS webhook, and Firebase server/web
push credentials. Run a live alert delivery, email, sandbox checkout/webhook
round-trip, and push to an authorized test device.

Acceptance checks:

- The operations webhook receives and authenticates a test alert.
- Transactional email is delivered through the configured SMTP provider.
- Razorpay creates and verifies a sandbox payment through the public webhook.
- Firebase delivers a test notification to an authorized test device.

Dependencies: provider-owned credentials, a reachable HTTPS webhook, and an
authorized push test device.

Blocker: Workspace `.env` currently has no configured alert webhook URL/secret,
Razorpay keys or checkout URL, or Firebase service account/VAPID key. Compose
defaults SMTP to Mailpit for development; production SMTP host, port, TLS,
credentials, and sender must also be configured. These values must be supplied
in the local `.env` or deployment secret store before the live checks can run.
Do not put secrets in this tracker.

### [-] DATA-01 - Complete the seeded public café profile

Priority: P1

Scope: Enter verified public profile values for the seeded café so it can
appear in customer discovery and detail pages.

Acceptance checks:

- The café has a street address, city, state, at least one contact method, and
  opening and closing hours.
- The public business and discovery APIs return the complete café profile.

Dependencies: accurate business details from the café owner or operator.

Blocker: The local `GameGrub Cafe` row is active/listed but has no address, city,
state, phone/email, or operating hours. Public APIs correctly omit incomplete
profiles. Supply accurate values before publishing; do not fabricate them.
