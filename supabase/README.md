# V5 persistence draft

`migrations/20261005000000_v5_schema.sql` is an unapplied schema draft. V5 launch persistence remains the immutable weekly GitHub release archive described in the product spec; this repository migration does not authorize creating a Supabase project, applying a migration, or writing to a live database.

The migration stores the complete checked-in `MODEL_PARAMS` object and its SHA-256, normalized source observations shared by a build, and two immutable horizon run rows sharing a `build_id`. Species predictions and recommendations are derived projections. Outcomes preserve the exact displayed run/recommendation IDs when available; `outcomes_vs_predictions` applies the ADR's as-of matching rules to unlinked trips. Multi-catch quantity is held per species, with no child rows for a zero-catch trip.

RLS is enabled on every table. No anon policies are created, so access is denied by default. This draft has not been applied or connected to any Supabase project.
