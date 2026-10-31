-- Chat persistence on top of 202610300001_initial_schema.sql.
-- Adds the conversation state the chat service needs, a safety flag on
-- messages, a memory-change timestamp for context resets, and an encrypted
-- emergency contact. Text written by the app (message content, titles, memory
-- and proposal text, contact details) is encrypted by the app before storage
-- (GUARDRAILS.md DP-1); the key is held outside the database.
begin;

alter table public.conversations
  add column disclosed boolean not null default false,
  add column ended_reason text check (ended_reason in ('safety', 'session_cap')),
  add column memories_referenced uuid[] not null default '{}'
    check (cardinality(memories_referenced) <= 200),
  -- DP-4 decision (2026-10-31): conversations are kept until the user deletes them.
  add column kept boolean not null default true,
  add column title_sealed text check (title_sealed is null or char_length(title_sealed) <= 1000);

grant insert (title_sealed) on public.conversations to authenticated;
grant update (disclosed, ended_reason, memories_referenced, kept, title_sealed)
  on public.conversations to authenticated;

alter table public.messages
  add column safety boolean not null default false;
grant insert (safety) on public.messages to authenticated;

-- When the user last changed an approved memory. Transcript turns before this
-- time are not sent to the model again (MP-4).
alter table public.profiles
  add column memory_changed_at timestamptz;

create or replace function public.invalidate_memory_context()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
begin
  if tg_op = 'UPDATE' and new.content is not distinct from old.content
    and new.expires_at is not distinct from old.expires_at then
    return null;
  end if;
  if tg_op = 'DELETE' then owner_id := old.user_id;
  else owner_id := new.user_id;
  end if;
  update public.profiles
    set memory_revision = memory_revision + 1, memory_changed_at = clock_timestamp()
    where id = owner_id;
  update public.conversations set context_epoch = context_epoch + 1 where user_id = owner_id;
  return null;
end;
$$;
revoke all on function public.invalidate_memory_context() from public, anon, authenticated;

-- One optional emergency contact per user, encrypted by the app. It is shown
-- only on the crisis screen; the app never contacts this person.
create table public.emergency_contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sealed text not null check (char_length(sealed) <= 4000 and btrim(sealed) <> ''),
  updated_at timestamptz not null default now()
);

revoke all on table public.emergency_contacts from public, anon, authenticated;
grant select, delete on public.emergency_contacts to authenticated;
grant insert (user_id, sealed) on public.emergency_contacts to authenticated;
grant update (sealed) on public.emergency_contacts to authenticated;
grant all on table public.emergency_contacts to service_role;
alter table public.emergency_contacts enable row level security;

create policy emergency_contacts_read on public.emergency_contacts for select to authenticated
  using (user_id = (select auth.uid()));
create policy emergency_contacts_create on public.emergency_contacts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy emergency_contacts_edit on public.emergency_contacts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy emergency_contacts_delete on public.emergency_contacts for delete to authenticated
  using (user_id = (select auth.uid()));

comment on column public.conversations.title_sealed is 'App-encrypted title. Never store conversation text in plaintext.';
comment on table public.emergency_contacts is 'App-encrypted contact shown only on the crisis screen. Never contacted.';

commit;
