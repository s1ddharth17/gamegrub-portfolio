# Cafe onboarding and configuration

Super admins can onboard cafes from **Control → Businesses** in the admin app.
The page manages the public profile, operating hours and time zone, listing and
operational status, fee rates, payout policy, staff memberships, and the change
history. New cafes default to `pending` and `hidden` so they are not published
until approved and listed.

## Access and ownership

The management API is mounted at `/api/admin/businesses` and requires an active
super-admin session with `admin_access.manage`. Standard admins continue to
work through the cafe selector and can act only on businesses with an active
membership. Station and menu edits check the existing record's business before
updating it; the normal editors cannot transfer a station or menu item to a
different cafe.

## Configuration

Payout policies support manual, bank transfer, or UPI methods and manual,
weekly, or monthly schedules. Payout requests continue through the existing
admin settlement workflow. The configured minimum is enforced against seller
proceeds before a payout request can be created. Bank or UPI credentials are
not stored by this feature.

Profile, fee, payout, staff membership, station, and menu item changes are
written to `business_audit_logs` with the actor and before/after snapshots. The
audit feed is available in the business management page.

## Database migration

Apply the normal backend migrations before using the new management endpoints:

```powershell
cd backend
npm run migrate
```

Migration `20261101_business_management.js` creates payout settings and the
business audit log, and seeds default payout settings for existing cafes.
