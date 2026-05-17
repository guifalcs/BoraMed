create table "public"."user_onboarding_state" (
	"user_id" uuid not null,
	"flow_key" text not null,
	"flow_version" smallint not null default 1,
	"status" text not null default 'not_started',
	"current_step" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"skipped_at" timestamp with time zone,
	"metadata" jsonb not null default '{}'::jsonb,
	"criado_em" timestamp with time zone not null default now(),
	"atualizado_em" timestamp with time zone not null default now(),
	constraint "user_onboarding_state_pkey" primary key ("user_id", "flow_key", "flow_version"),
	constraint "user_onboarding_state_user_id_fkey" foreign key ("user_id") references auth.users("id") on delete cascade,
	constraint "user_onboarding_state_flow_key_check" check (char_length("flow_key") between 1 and 80),
	constraint "user_onboarding_state_flow_version_check" check ("flow_version" > 0),
	constraint "user_onboarding_state_status_check" check ("status" in ('not_started', 'started', 'completed', 'skipped')),
	constraint "user_onboarding_state_current_step_check" check ("current_step" is null or char_length("current_step") between 1 and 80)
);
create trigger "user_onboarding_state_atualizado_em_trigger"
before update on "public"."user_onboarding_state"
for each row execute function public.update_atualizado_em();
alter table "public"."user_onboarding_state" enable row level security;
create policy "user_onboarding_state_select_own"
	on "public"."user_onboarding_state"
	as permissive
	for select
	to authenticated
	using (((select auth.uid()) is not null) and ((select auth.uid()) = user_id));
create policy "user_onboarding_state_insert_own"
	on "public"."user_onboarding_state"
	as permissive
	for insert
	to authenticated
	with check (((select auth.uid()) is not null) and ((select auth.uid()) = user_id));
create policy "user_onboarding_state_update_own"
	on "public"."user_onboarding_state"
	as permissive
	for update
	to authenticated
	using (((select auth.uid()) is not null) and ((select auth.uid()) = user_id))
	with check (((select auth.uid()) is not null) and ((select auth.uid()) = user_id));
revoke all on table "public"."user_onboarding_state" from anon;
revoke all on table "public"."user_onboarding_state" from authenticated;
grant select, insert, update on table "public"."user_onboarding_state" to authenticated;
grant all on table "public"."user_onboarding_state" to service_role;
