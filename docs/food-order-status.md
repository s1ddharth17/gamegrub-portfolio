# Food order status and preparation ETA

Food orders use one customer and kitchen lifecycle:

1. `accepted` — the order has been sent to the cafe.
2. `preparing` — the kitchen has started work and set a ready-time estimate.
3. `ready` — the order is ready for pickup; the customer receives an idempotent notification.
4. `delivered` — the order has been handed to the customer.

The database retains the legacy `active` and `completed` values for accepted and
ready orders so billing and older integrations continue to work. The API returns
the customer-facing names. Kitchen transitions must advance one stage at a time.
Active admins with `orders.manage` permission and access to the order's cafe may
update a ticket. Preparation ETAs are whole minutes from 1 to 240; the kitchen
can revise the estimate while the order is preparing.

`order_status_history` records each status change and each ETA revision with the
admin and change time. The `orders` row also stores the accepted, preparing,
ready, and delivered milestone times, plus the current ETA. The migration
backfills the current status and timestamps for existing orders where possible.

Customers can add a kitchen note of up to 500 characters at checkout. The note,
status, ETA, and milestone times are returned by `GET /api/order/bill/:booking_id`
and shown in the customer app and cafe kitchen queue. The menu continues to
include unavailable items so customers can see them before checkout; those items
cannot be added, and checkout rechecks availability before writing the order.

The ready notification uses the stable key `order:<order_id>:ready`, so a retry
does not create a second notification.
