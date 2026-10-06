-- V5 persistence draft. This file is intentionally unapplied; launch persistence remains
-- immutable GitHub release assets until a separately authorized database decision.

create table if not exists public.model_versions (
  id uuid primary key default gen_random_uuid(),
  model_version text not null,
  params_version text not null,
  params_hash text not null check (params_hash ~ '^[0-9a-f]{64}$'),
  model_params jsonb not null check (jsonb_typeof(model_params) = 'object'),
  code_hash text,
  history_hash text,
  catalog_hash text,
  source_hashes jsonb not null default '{}'::jsonb check (jsonb_typeof(source_hashes) = 'object'),
  created_at timestamptz not null default now(),
  unique (model_version, params_version, params_hash),
  unique (id, params_hash)
);
comment on table public.model_versions is 'Immutable full model parameter versions and hashes used to reproduce V5 predictions.';

-- Seed the exact checked-in parameter object and its SHA-256 from params.js.
insert into public.model_versions
  (model_version, params_version, params_hash, model_params)
values
  ('v5.0.0-a1', 'v5-params-a3',
   'c5518f45d0f13f043a0816c18fdd3993841a405a142056aa3261ff13f659ff55',
   '{"paramsVersion":"v5-params-a3","weightsByMode":{"surf":{"season":0.24,"water":0.18,"tide":0.14,"light":0.1,"wind":0.1,"waves":0.1,"pressure":0.05,"solunar":0.05,"rain":0.04},"pier":{"season":0.24,"water":0.18,"tide":0.14,"light":0.1,"wind":0.1,"waves":0.1,"pressure":0.05,"solunar":0.05,"rain":0.04},"inshore":{"season":0.24,"water":0.18,"tide":0.2,"light":0.12,"wind":0.1,"waves":null,"pressure":0.06,"solunar":0.06,"rain":0.04}},"history":{"kNeighbor":80,"kMonth":40,"numericMinN":80,"thinMinN":30,"bands":{"commonMin":0.2,"occasionalMin":0.05},"realisticFloor":null,"realisticFloorProvisional":true,"seasonCapBelow":0.1,"seasonCapSuitability":20,"unavailablePenalty":15,"thinPenalty":15,"lowSamplePenalty":8},"thresholds":{"greatFit":70,"decentFit":50,"poorFit":30,"goSuitabilityMin":null,"goSuitabilityMinProvisional":true,"goConfidenceMin":50,"maybeSuitabilityMin":50,"highConfidenceMin":75,"moderateConfidenceMin":50},"confidence":{"start":100,"minimum":5,"forecastMissingOrStale":25,"forecastAging":10,"alertsUnchecked":20,"tideUnavailable":20,"distantOceanTideStation":10,"wavesUnavailable":10,"waterTempUnavailable":10,"inshoreBuoyTemp":5,"pressureUnavailable":5},"freshness":{"forecastMaxAgeHours":6,"forecastAgingMinHours":3,"todayWaveMaxAgeHours":3,"tomorrowWaveMaxAgeHours":6,"distantTideStationMiles":15},"factors":{"effectHelpsMin":0.67,"effectNeutralMin":0.34,"tideSensitivityMultipliers":{"high":1.3,"medium":1,"low":0.6},"tide":{"oppositeDirectionFloor":0.35,"anyDirectionScore":0.7,"rateNormalizationScale":null,"rateNormalizationScaleProvisional":true},"light":{"lowlightMinutes":60,"middayScore":0.4,"nightScore":0.25,"dayScore":1,"nightDaySpeciesScore":0.3,"anyScore":0.8},"solunar":{"majorMinutes":60,"minorMinutes":30,"majorScore":1,"minorScore":0.75,"neutralScore":0.45,"phaseBoost":0.1,"phaseDays":3,"synodicDays":29.530588853},"wind":{"fullScoreMaxMph":10,"zeroScoreMph":25,"gustZeroMph":30,"onshoreCalmPenalty":0.15,"onshoreRoughBonus":0.05,"offshoreCalmBonus":0.1,"inshoreOnshorePenalty":0.1,"onshoreSectorHalfWidthDeg":90},"waves":{"calmMaxM":0.6,"moderateMaxM":1.2,"zeroScoreAboveM":2,"adjacentClassScore":0.6,"oppositeClassScore":0.2,"noPreferenceScore":0.7,"safetySkipAboveM":2.5},"pressure":{"fallingMinHpa":-3,"fallingMaxHpa":-0.5,"neutralAbsMaxHpa":0.5,"risingMaxHpa":3,"fallingScore":1,"neutralScore":0.8,"risingScore":0.6,"rapidChangeScore":0.4},"safety":{"windSkipMph":25,"gustSkipMph":35}},"windows":{"slotMinutes":30,"todayEndLocalHour":21,"tomorrowStartLocalHour":5,"tomorrowEndLocalHour":21,"middayStartLocalHour":12,"afternoonStartLocalHour":15,"eveningStartLocalHour":19,"peakTolerancePoints":8,"minimumMinutes":60,"maximumMinutes":150,"maximumPerSpecies":4,"maxContiguousSafetyGapMinutes":0},"selection":{"backupNearbyMiles":7,"similarSuitabilityDelta":5,"heldSelectionDelta":5,"maxTargets":3,"recommendedHorizonCutoffLocalHour":15}}'::jsonb)
on conflict (model_version, params_version, params_hash) do nothing;

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  location_key text not null unique,
  name text not null,
  area text not null,
  county text not null,
  active boolean not null default true,
  modes text[] not null check (cardinality(modes) > 0 and modes <@ array['surf','pier','inshore']::text[]),
  structure text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  catalog_hash text,
  created_at timestamptz not null default now()
);
comment on table public.locations is 'Versioned-key location catalog used by canonical runs and outcome records.';

create table if not exists public.prediction_runs (
  id uuid primary key,
  build_id uuid not null,
  model_version_id uuid not null,
  horizon text not null check (horizon in ('today','tomorrow')),
  target_date date not null,
  generated_at timestamptz not null,
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  region text not null,
  status text not null check (status in ('ok','partial','degraded')),
  carried_forward boolean not null default false,
  schema_major integer not null check (schema_major > 0),
  schema_minor integer not null check (schema_minor >= 0),
  params_hash text not null check (params_hash ~ '^[0-9a-f]{64}$'),
  history_hash text not null,
  catalog_hash text not null,
  code_revision text not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  canonical_run jsonb not null check (jsonb_typeof(canonical_run) = 'object'),
  created_at timestamptz not null default now(),
  check (valid_to > valid_from),
  check (generated_at <= valid_to),
  unique (build_id, horizon),
  unique (id, horizon),
  unique (id, target_date),
  unique (id, target_date, generated_at, valid_from, valid_to),
  foreign key (model_version_id, params_hash)
    references public.model_versions(id, params_hash) on delete restrict
);
comment on table public.prediction_runs is 'Immutable canonical PredictionRun horizon projections; two rows share a build_id and content-hash their exact run payloads.';
create index if not exists prediction_runs_asof_idx
  on public.prediction_runs (target_date, generated_at desc, valid_from, valid_to);
create index if not exists prediction_runs_build_idx
  on public.prediction_runs (build_id, horizon);

create table if not exists public.source_observations (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null,
  observation_key text not null,
  provider text not null,
  kind text not null,
  location_key text not null,
  station text,
  observed_at timestamptz,
  issued_at timestamptz,
  valid_from timestamptz,
  valid_to timestamptz,
  fetched_at timestamptz not null,
  units jsonb not null default '{}'::jsonb,
  values jsonb not null default '{}'::jsonb,
  ok boolean not null,
  stale boolean not null,
  used_fallback boolean not null,
  safe_error_code text,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to > valid_from),
  unique (build_id, observation_key),
  unique (build_id, content_hash),
  foreign key (location_key) references public.locations(location_key) on update cascade on delete restrict
);
comment on table public.source_observations is 'Deduplicated normalized source inputs shared by both horizon runs in one build.';
create index if not exists source_observations_time_idx
  on public.source_observations (location_key, kind, fetched_at desc);
create index if not exists source_observations_build_idx
  on public.source_observations (build_id, fetched_at);

create table if not exists public.species_predictions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.prediction_runs(id) on delete cascade,
  location_key text not null references public.locations(location_key) on update cascade on delete restrict,
  mode text not null check (mode in ('surf','pier','inshore')),
  species_id text not null,
  prediction_key text not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  suitability smallint not null check (suitability between 0 and 100),
  confidence smallint not null check (confidence between 0 and 100),
  eligibility text not null check (eligibility in ('realistic','rare','off-list','bycatch','no-structure')),
  band text not null,
  calibrated_probability double precision check (calibrated_probability is null),
  projection jsonb not null check (jsonb_typeof(projection) = 'object'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  check (window_end > window_start),
  unique (run_id, location_key, mode, species_id, window_start, window_end),
  unique (run_id, prediction_key),
  unique (id, run_id, location_key, mode, species_id),
  unique (id, location_key, mode, species_id),
  foreign key (location_key) references public.locations(location_key) on update cascade on delete restrict
);
comment on table public.species_predictions is 'Per-species, per-location/mode/window prediction projection derived from an immutable run.';
create index if not exists species_predictions_lookup_idx
  on public.species_predictions (location_key, mode, species_id, window_start desc);
create index if not exists species_predictions_run_idx
  on public.species_predictions (run_id, location_key, mode);

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.prediction_runs(id) on delete cascade,
  recommendation_key text not null,
  scope_key text not null,
  focus_species_id text,
  location_key text not null references public.locations(location_key) on update cascade on delete restrict,
  mode text not null check (mode in ('surf','pier','inshore')),
  horizon text not null check (horizon in ('today','tomorrow')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  driver_species_id text not null,
  target_species_ids text[] not null default '{}',
  verdict text not null check (verdict in ('GO','MAYBE','SKIP')),
  suitability smallint not null check (suitability between 0 and 100),
  rank integer not null check (rank > 0),
  selection_reason text not null check (selection_reason in ('tie','held','switched')),
  prior_recommendation_key text,
  selection_snapshot jsonb not null default '{}'::jsonb,
  projection jsonb not null check (jsonb_typeof(projection) = 'object'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  check (window_end > window_start),
  check (verdict = 'GO' or (projection ? 'reason' and projection->'reason' <> 'null'::jsonb)),
  unique (run_id, recommendation_key),
  unique (id, run_id),
  unique (id, run_id, location_key, mode),
  unique (run_id, scope_key, focus_species_id, location_key, mode, window_start, window_end),
  foreign key (location_key) references public.locations(location_key) on update cascade on delete restrict,
  foreign key (run_id, horizon) references public.prediction_runs(id, horizon) on delete cascade
);
comment on table public.recommendations is 'Materialized recommendation projections with stable IDs retained when shown to an angler.';
create index if not exists recommendations_asof_idx
  on public.recommendations (location_key, mode, window_start, window_end, run_id);
create index if not exists recommendations_targets_idx
  on public.recommendations using gin (target_species_ids);

create table if not exists public.catch_outcomes (
  id uuid primary key default gen_random_uuid(),
  location_key text not null references public.locations(location_key) on update cascade on delete restrict,
  fished_start timestamptz not null,
  fished_end timestamptz not null,
  target_date date not null,
  mode text not null check (mode in ('surf','pier','inshore')),
  target_species_id text,
  caught boolean not null,
  displayed_prediction_run_id uuid,
  displayed_recommendation_id uuid,
  target_species_prediction_id uuid,
  target_prediction_run_id uuid,
  selection_snapshot jsonb not null default '{}'::jsonb,
  reported_via text not null,
  unmatched_reason text,
  created_at timestamptz not null default now(),
  check (fished_end > fished_start),
  check ((displayed_prediction_run_id is null) = (displayed_recommendation_id is null)),
  check ((target_species_prediction_id is null) = (target_prediction_run_id is null)),
  check (target_species_prediction_id is null or target_species_id is not null),
  foreign key (displayed_prediction_run_id)
    references public.prediction_runs(id) on delete restrict,
  foreign key (displayed_recommendation_id, displayed_prediction_run_id)
    references public.recommendations(id, run_id) on delete restrict,
  foreign key (displayed_recommendation_id, displayed_prediction_run_id, location_key, mode)
    references public.recommendations(id, run_id, location_key, mode) on delete restrict,
  foreign key (target_species_prediction_id, target_prediction_run_id, location_key, mode, target_species_id)
    references public.species_predictions(id, run_id, location_key, mode, species_id) on delete restrict
);
comment on table public.catch_outcomes is 'Future, explicitly reported fishing trips with optional target and exact displayed-recommendation provenance.';
create index if not exists catch_outcomes_location_time_idx
  on public.catch_outcomes (location_key, fished_start desc);
create index if not exists catch_outcomes_target_time_idx
  on public.catch_outcomes (target_species_id, fished_start desc);
create index if not exists catch_outcomes_prediction_idx
  on public.catch_outcomes (displayed_prediction_run_id, displayed_recommendation_id);

create table if not exists public.catch_outcome_species (
  id uuid primary key default gen_random_uuid(),
  outcome_id uuid not null references public.catch_outcomes(id) on delete cascade,
  species_id text not null,
  kept integer not null default 0 check (kept >= 0),
  released integer not null default 0 check (released >= 0),
  created_at timestamptz not null default now(),
  check (kept + released > 0),
  unique (outcome_id, species_id)
);
comment on table public.catch_outcome_species is 'Per-species kept/released totals for multi-species trip outcomes; no child rows represents zero catch.';
create index if not exists catch_outcome_species_species_idx
  on public.catch_outcome_species (species_id, outcome_id);

-- Keep the caught flag consistent with child totals at transaction commit.
create function public.v5_check_outcome_caught_flag() returns trigger
language plpgsql as $$
declare
  checked_outcome_id uuid;
  expected_caught boolean;
  actual_caught boolean;
begin
  if tg_table_name = 'catch_outcomes' then
    checked_outcome_id := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    checked_outcome_id := case when tg_op = 'DELETE' then old.outcome_id else new.outcome_id end;
  end if;

  select o.caught, exists (
    select 1 from public.catch_outcome_species s
    where s.outcome_id = o.id and s.kept + s.released > 0
  ) into actual_caught, expected_caught
  from public.catch_outcomes o where o.id = checked_outcome_id;

  if found and actual_caught is distinct from expected_caught then
    raise exception 'catch_outcomes.caught must match whether child catch totals are positive';
  end if;
  return null;
end;
$$;
create constraint trigger v5_outcome_caught_consistency
  after insert or update or delete on public.catch_outcomes
  deferrable initially deferred for each row
  execute function public.v5_check_outcome_caught_flag();
create constraint trigger v5_species_caught_consistency
  after insert or update or delete on public.catch_outcome_species
  deferrable initially deferred for each row
  execute function public.v5_check_outcome_caught_flag();

-- Displayed links are authoritative. Unlinked/offline outcomes use the latest eligible
-- run at fished_start for the same local target date/place/mode, then greatest overlap,
-- earlier window start, and stable recommendation ID. Future runs are excluded.
create or replace view public.outcomes_vs_predictions
with (security_invoker = true) as
select
  o.id as outcome_id,
  o.location_key,
  o.mode,
  o.fished_start,
  o.fished_end,
  o.target_date,
  o.target_species_id,
  o.caught,
  coalesce(o.displayed_prediction_run_id, matched.run_id) as prediction_run_id,
  matched.recommendation_id,
  matched.match_method,
  matched.verdict,
  matched.suitability,
  matched.window_start as predicted_window_start,
  matched.window_end as predicted_window_end,
  o.unmatched_reason
from public.catch_outcomes o
left join lateral (
  select chosen.run_id, chosen.recommendation_id, chosen.match_method,
         chosen.verdict, chosen.suitability, chosen.window_start, chosen.window_end,
         chosen.run_generated_at
  from (
    select r.id as run_id, p.id as recommendation_id, 'displayed'::text as match_method,
           p.verdict, p.suitability, p.window_start, p.window_end,
           r.generated_at as run_generated_at,
           0 as match_priority, null::double precision as overlap_seconds
    from public.recommendations p
    join public.prediction_runs r on r.id = p.run_id
    where p.id = o.displayed_recommendation_id
      and r.id = o.displayed_prediction_run_id

    union all

    select r.id as run_id, p.id as recommendation_id, 'as_of'::text as match_method,
           p.verdict, p.suitability, p.window_start, p.window_end,
           r.generated_at as run_generated_at,
           1 as match_priority,
           extract(epoch from least(o.fished_end, p.window_end) - greatest(o.fished_start, p.window_start))::double precision as overlap_seconds
    from public.recommendations p
    join public.prediction_runs r on r.id = p.run_id
    where o.displayed_recommendation_id is null
      and r.target_date = o.target_date
      and r.generated_at <= o.fished_start
      and r.valid_from <= o.fished_start and o.fished_start < r.valid_to
      and p.location_key = o.location_key and p.mode = o.mode
      and (o.target_species_id is null or o.target_species_id = any(p.target_species_ids))
      and least(o.fished_end, p.window_end) > greatest(o.fished_start, p.window_start)
  ) chosen
  order by chosen.match_priority, chosen.run_generated_at desc,
           chosen.overlap_seconds desc nulls last,
           chosen.window_start asc, chosen.recommendation_id asc
  limit 1
) matched on true;
comment on view public.outcomes_vs_predictions is 'Outcome comparison using displayed recommendation IDs first and ADR-defined as-of matching for unlinked outcomes.';

alter table public.model_versions enable row level security;
alter table public.locations enable row level security;
alter table public.source_observations enable row level security;
alter table public.prediction_runs enable row level security;
alter table public.species_predictions enable row level security;
alter table public.recommendations enable row level security;
alter table public.catch_outcomes enable row level security;
alter table public.catch_outcome_species enable row level security;

-- No anonymous read or write policies are defined. RLS therefore denies access by default.
