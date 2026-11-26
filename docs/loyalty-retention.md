# Loyalty, referrals, and retention

The authenticated customer app reads `/api/loyalty` for the current points
balance, membership tier, referral code, visit streaks, monthly challenge,
birthday offer, earned badges, and the latest 40 loyalty transactions. The
screen also posts referral claims to `/api/loyalty/referral`.

## Points and history

- Settled eligible sessions earn points at the existing 5% rate.
- One point offsets ₹1 of the session service subtotal. Convenience fees can
  remain due after points are used.
- Points do not expire automatically. Existing earned, redeemed, adjustment,
  bonus, and refund transactions remain in the ledger; new rewards write both
  an auditable reward grant and a customer-facing bonus transaction.
- Each reward grant has a unique per-customer event key. Reprocessing the same
  booking, badge, challenge, birthday, or referral event cannot credit it twice.

## Retention rewards

- Each user receives a unique `GG` referral code. A referral must be applied
  before the referred account's first settled session with a positive service
  subtotal. Self-referrals and repeat claims are rejected. Both people receive
  150 points after that session settles, including a session covered with
  loyalty points.
- A settled eligible booking counts once toward a visit day; multiple sessions
  on the same date count as one day. The customer sees the current and best
  consecutive-day streak.
- Badges award 25 points for a first visit, 50 for five visit days, 100 for ten
  visit days, 50 for a three-day streak, and 150 for a seven-day streak.
- A monthly visit challenge is personalized by the customer's loyalty tier at
  the start of that monthly challenge: Starter 2 days/40 points, Regular 3/75,
  Pro 4/120, and Legend 5/180. The challenge records its target and award for
  that month.
- Customers aged 13 or older can save a birthday in their profile. It is
  private and locked after saving. A 100-point reward is granted once on the
  birthday each year.

Reward issuance is part of the booking-settlement transaction. A failed
settlement rolls back its visit, badge, challenge, referral, ledger, and balance
changes together. Schema changes are in
`backend/migrations/20261104_loyalty_retention_program.js`.
