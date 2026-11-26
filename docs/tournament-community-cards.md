# Tournament community cards

The Tournament screen now includes a public Updates tab for curated tournament
announcements, promos, spotlights, and recaps. Customers can browse community
posts without signing in. Signed-in customers also see their private tournament
notifications in the same view.

`GET /api/tournament/community` returns only posts with published status and a
publish timestamp whose configured start/end window includes the current time.
The feed is ordered by priority, then publish time and post ID. Linked event
details are returned only when the event is publicly published. Public event
details are fetched by slug or ID when the event is not part of the currently
loaded tournament list; unpublished events return not found.

The customer app filters the API response again for published, active posts,
keeps the API ordering, and renders post text as ordinary text rather than
interpreting it as markup. The Updates tab has distinct loading, empty, and
retryable error states. Event navigation opens the existing tournament detail
sheet and reports when a linked event is no longer available.

Coverage lives in `backend/test/tournamentPublicRoutes.test.js`,
`gamegrub_user/test/tournament_community_test.dart`, and
`gamegrub_user/test/tournament_screen_test.dart`.
