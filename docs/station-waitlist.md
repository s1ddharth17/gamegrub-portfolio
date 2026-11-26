# Station waitlist and cancellation recovery

Customers can request a continuous future time window at one station or at any
station in the selected station's category. A request is accepted only when no
matching active station can book the entire window. Matching is exact on café,
date, start hour, and end hour.

## Queue and claim rules

- Compatible waiting requests are considered by `created_at`, then
  `waitlist_id` (first joined, first offered).
- Cancelling a booking creates one opening per contiguous group of future
  station hours. Past and currently running hours are not offered.
- One opening has at most one active offer. The opening remains unavailable to
  regular bookings while an offer is active.
- An offer lasts 10 minutes.
- An expired offer ends that waitlist request; the next compatible request
  receives the opening. With no other matching request, the opening is
  released to ordinary booking. The customer receives an expiry notification
  and can join again.
- The offer link opens directly to the existing checkout with station, date,
  and hours already selected. The server rechecks ownership, exact window,
  opening state, payment flow, and expiry in the booking transaction.
- The station row is locked while a booking is created. The offer, request,
  and opening are updated in that same transaction, so a second customer
  cannot claim the opening.

## Customer API

All endpoints are authenticated and are mounted under `/api/booking/waitlist`.

- `POST /` creates a request. Provide `business_id`, `booking_date`,
  `start_hour`, `end_hour`, and exactly one of `preferred_pc_id` or
  `preferred_category`.
- `GET /` returns the customer's active waiting requests and current offers.
- `DELETE /:id` cancels the customer's waiting request or active offer.
- `GET /offers/:id` returns offer details only to its owner.
- `POST /api/booking/create` accepts `waitlist_offer_id` to claim the offer
  through the normal booking checkout.

## Expiry scheduler

The `station_waitlist_engine` expires offers and advances the queue. Its
interval defaults to 10 seconds and can be set with
`STATION_WAITLIST_ENGINE_INTERVAL_MS`. It is included in the in-process worker
and `backend/cron/runAllEngines.js`; deployments using an external scheduler
should run that entry point at the configured cadence. Health details appear
with the other cron engines.

## Migration

The `20261029_create_station_waitlist.js` migration adds request, opening, and
offer history tables. Apply it with `cd backend && npm run migrate` before
deploying the API; the Docker Compose backend command already runs migrations
before it starts the server.
