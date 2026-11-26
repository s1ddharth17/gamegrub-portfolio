# Verified Razorpay checkout

GameGrub creates Razorpay orders on the backend. The Flutter app opens a short-lived hosted checkout page; it never sends a payment reference that can mark an amount paid. The backend validates Razorpay's checkout HMAC, fetches the payment from Razorpay, and checks the order, amount, currency, and captured state before confirming a booking or applying a session payment. A signed webhook can apply the same state transition if the browser callback is interrupted.

## Configure

Set these backend environment variables (or the matching root `.env` entries used by Compose):

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `PAYMENT_CURRENCY=INR`
- `PAYMENT_CHECKOUT_PUBLIC_URL` set to the public HTTPS backend URL in production (and whenever the backend's public URL differs from the request host)

Use Razorpay test-mode credentials for sandbox runs. Configure a Razorpay webhook pointing to `/api/payment/webhook` and subscribe to `payment.captured` and `payment.failed`. The checkout option is hidden until all three Razorpay secrets are present. Never copy the key secret or webhook secret into Flutter, a browser bundle, or the admin build.

## State handling

- Booking advances reserve the slots in `pending_payment` for 20 minutes. A verified capture changes the booking to `confirmed`; failure, dismissal, or an expired attempt releases the slots.
- Session balance attempts use a server-calculated amount. Captured amounts reduce the amount due; the customer can close the session only when the server-calculated remainder is zero. Staff can still record counter payments through authorized admin workflows.
- Immediate customer food-order charges and customer-entered tournament payment references no longer mark payments captured. Food charges are collected at session checkout; tournament staff record fee payments.
- `/api/payment/success` returns `410 Gone` for old clients.
- `GET /api/payment/attempts/:attempt_id` returns the authenticated owner's current pending, failed, cancelled, captured, expired, or review-required state.

The integration tests mock Razorpay's HTTP responses and create real HMAC signatures to cover success, failure, cancellation, capture duplication, invalid signatures, amount mismatch, and webhook replay. A live Razorpay dashboard round-trip still requires test credentials and a reachable public webhook URL.
