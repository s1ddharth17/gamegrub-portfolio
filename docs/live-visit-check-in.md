# Live visit and QR check-in

Customers see their visit state and booking QR in the user app's Session view.
The same view refreshes booking, bill, and order data every 30 seconds and keeps
the existing extension, food, and checkout actions beside the live session.

Staff open POS → Scan check-in QR. They can scan with a camera that supports the
browser `BarcodeDetector` API or use a USB QR scanner/manual code field. The
admin preview displays the customer, booking, cafe, and station before staff
confirm. Check-in is restricted to the selected cafe and requires the
`sessions.manage` permission.

Booking QR codes are signed, bound to one booking and customer, and accepted only
once. The check-in window opens 15 minutes before the reserved start and closes
15 minutes after it, using the cafe's configured IANA timezone. The no-show
worker skips bookings already checked in and evaluates its grace window in the
cafe timezone. Booking history uses one visit-state label: confirmed,
checked-in, running, ending, or settled.
