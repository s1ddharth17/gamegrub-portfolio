# Customer notifications

The user app has a shared notification inbox at Profile → Notifications. It
stores in-app notifications regardless of push preference and shows the push
delivery state, attempt count, and last provider error. Category switches and
the reminder timezone are saved per account. Push is off until the customer
opts in.

## Event coverage

- Booking confirmation and reminders at about 24 hours and 1 hour before the
  session, calculated in the café's IANA timezone.
- Check-in warning during the no-show grace period and session end.
- Food order ready, payment captured/failed, and refund requested/updated.
- Existing tournament campaigns, including waitlist promotion events.

Notification event writes use unique idempotency keys. The worker sends queued
push deliveries through Firebase Cloud Messaging and records each device
attempt. FCM credentials are optional in local builds; without them, the
notification remains in the in-app inbox and push is marked skipped.

## Firebase configuration

Set `FIREBASE_SERVICE_ACCOUNT_JSON` on the backend to a Firebase service
account JSON value with the Firebase Messaging API enabled. Keep this private
key server-side only. Set `FIREBASE_WEB_VAPID_KEY` and `USER_APP_PUBLIC_URL` for
web push and click-through links.

The Flutter web build also needs the public Firebase app values in the root
`.env`: `FIREBASE_API_KEY`, `FIREBASE_APP_ID_WEB`,
`FIREBASE_MESSAGING_SENDER_ID`, and `FIREBASE_PROJECT_ID`. Optional public
values are `FIREBASE_AUTH_DOMAIN` and `FIREBASE_STORAGE_BUCKET`. Docker Compose
passes those values to the build and generates the service-worker config.
Rebuild `user-web` after changing them.

For Android/iOS builds, pass the same project, API key, and sender ID plus the
platform app ID as Flutter `--dart-define` values. Configure the Firebase
Android/iOS app with the platform's required native messaging/APNs settings.
If the app values are omitted, normal booking and inbox features continue to
work and push registration stays unavailable.
