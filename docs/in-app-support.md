# In-app help and support requests

Customers can open Help & support from the profile, a cafe profile, a booking,
an order in the live visit, or a bill. Contextual requests carry their booking,
order, bill, and cafe IDs; the API checks record ownership and ensures linked
records belong to the same booking and cafe.

The help center shows the cafe's published phone and email details when
available, platform FAQs, the customer's requests, and replies/status changes.
If a cafe has no phone or email, customers can message the cafe through the
request form. Internal cafe notes and staff names stay out of the customer
timeline. Existing booking cancellation and food-order refund screens remain
the direct refund request paths; a support request links back to the relevant
bill for refund options.

Cafe admins use **Control → Support desk**. The queue is scoped to the active
cafe workspace and supports search, status filtering, assignment, priority,
customer replies, private notes, resolution summaries, and closure. Request
changes and comments are recorded in `support_issue_events`; private notes are
hidden from customer endpoints. Reopening or closing a request is also recorded
in that history.

## API

- `GET /api/support/faqs?business_id=...` — public active FAQs.
- `GET /api/support/issues` — authenticated customer's requests.
- `POST /api/support/issues` — create a request, optionally linked to a
  booking, order, bill, or cafe.
- `GET /api/support/issues/:id` and `POST /api/support/issues/:id/comments` —
  customer-visible timeline and replies.
- `GET /api/support/admin/issues`, `GET /api/support/admin/issues/:id`,
  `PUT /api/support/admin/issues/:id`, and
  `POST /api/support/admin/issues/:id/comments` — cafe-scoped admin workflow.
- `GET /api/support/admin/assignees?business_id=...` — active admins available
  for assignment at that cafe.

Support storage and the default FAQ set are created by migration
`20261102_support_issues.js`. Cafe phone/email are read from the existing
business profile fields.
