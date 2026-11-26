# Intent-based café and setup discovery

The home marketplace now combines its existing café feed with GameGuru session planning. Players can filter by area, game or upcoming tournament, station category, hourly budget, rating, food availability, tournament activity, and whether the café is open now. A plan also includes the visit date, start time, duration, and group size.

## Public discovery endpoint

`GET /api/business/discovery?date=YYYY-MM-DD&start_hour=18&duration_hours=2` returns active, listed cafés with an `availability_window` and the currently unoccupied active stations for every requested hour. Results include café summary fields, upcoming published tournament game titles, station categories, price bounds, and a cafe-timezone `is_open_now` value. Invalid dates or booking windows return HTTP 400. Supported booking windows use the existing 09:00–23:00 booking hours.

Station availability excludes overlapping booking slots that are still in effect and waitlist openings that are open or offered. A cafe is only recommended for a plan when its listed operating hours cover the whole session (when hours are configured) and it has enough matching setups for the requested group. Food filters use currently available menu items; tournament filters use upcoming published tournaments.

## Recommendation and booking flow

The marketplace ranks matching cafés using the number of live stations that satisfy the selected station tier and price cap, then café rating and existing marketplace signals. Each setup recommendation shows the café, selected station, hourly price, matching reasons, and the live session window. Its GameGuru action opens the existing chat with the session context prefilled.

`Book setup` selects the café and opens the existing booking screen with the planned date and session hours preselected. That screen fetches authenticated availability again. If any requested hour is no longer available, no hours are preselected and the player is told to choose an available window. Checkout keeps the existing server-side availability and payment checks.

## Main files

- `backend/utils/businesses.js` and `backend/routes/business.js`: discovery query, public response, availability and timezone handling.
- `gamegrub_user/lib/screens/home/cafe_marketplace_screen.dart`: filters, ranking, recommendation cards, and GameGuru entry point.
- `gamegrub_user/lib/screens/booking/booking_screen.dart`: prefilled plan with a fresh availability check.
- `gamegrub_user/lib/models/cafe_discovery.dart` and `gamegrub_user/lib/services/business_service.dart`: response model and API client.
- `backend/test/businessDiscovery.test.js`: backend discovery, validation, and route coverage.
