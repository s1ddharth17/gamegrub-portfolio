# Rich café profiles

Café profiles now combine verified public basics with the details players need before visiting: full street address and postal code, contact phone and email, local operating hours and time zone, optional map coordinates, amenities, equipment highlights, a photo gallery, parking, accessibility, and café policies. The customer profile shows directions, call and email actions, gallery images, live equipment categories, and the existing verified review feed.

## Publishing requirements

The admin business manager validates phone numbers, email addresses, map-coordinate ranges, paired latitude/longitude, operating-hour formats, and HTTPS or `/uploads/` gallery image references. An active café can be listed only when it has a street address, city, state, at least one contact method, and opening and closing times. Public discovery and detail queries also omit incomplete legacy listings until an admin completes them.

Amenities, equipment highlights, and gallery images are entered one item per line in the admin manager. Coordinates are optional; when present, they take precedence for the directions destination. Without coordinates, directions use the complete postal address. Contact buttons use the configured phone and email values, while the in-app support route remains available.

The profile's equipment section combines admin-provided highlights with the café's actual PC and console inventory. Reviews continue to use the verified-purchase API: only customers with an eligible completed booking or café checkout can submit a review, and the public review feed displays reviews written by those eligible customers.

## Main files

- `backend/migrations/20261103_business_profile_details.js`: additive fields for location and public profile details.
- `backend/utils/businessProfile.js` and `backend/routes/businessAdmin.js`: normalization, publish requirements, and audited admin edits.
- `backend/utils/businesses.js`: public profile serialization and complete-listing filters.
- `gamegrubadmin/src/pages/BusinessManagement.js`: admin editor for profile content.
- `gamegrub_user/lib/models/business.dart` and `gamegrub_user/lib/screens/home/cafe_detail_screen.dart`: customer profile model and presentation.
- `backend/test/businessProfile.test.js` and `gamegrub_user/test/business_profile_test.dart`: profile validation and parsing coverage.
