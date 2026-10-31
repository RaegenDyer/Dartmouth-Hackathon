-- DRAFT: local preparation only. Review and test against an isolated Supabase
-- database before applying to the shared project. No extension is required.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  city text not null default '' check (char_length(city) <= 120),
  interests text[] not null default '{}' check (cardinality(interests) <= 20),
  tone text not null default 'warm' check (char_length(btrim(tone)) between 1 and 60),
  memory_revision bigint not null default 0 check (memory_revision >= 0),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'A conversation' check (char_length(btrim(title)) between 1 and 120),
  scenario text not null default 'check_in'
    check (scenario in ('check_in', 'social_step')),
  status text not null default 'active' check (status in ('active', 'archived')),
  context_epoch bigint not null default 0 check (context_epoch >= 0),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(btrim(content)) between 1 and 12000),
  client_request_id uuid not null,
  context_epoch bigint not null default 0 check (context_epoch >= 0),
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id)
    references public.conversations(id, user_id) on delete cascade,
  unique (conversation_id, client_request_id, role),
  unique (id, user_id),
  unique (id, conversation_id, user_id)
);

create table public.memory_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  source_message_id uuid,
  suggested_content text
    check (suggested_content is null or char_length(btrim(suggested_content)) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  decided_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (conversation_id, user_id)
    references public.conversations(id, user_id) on delete cascade,
  foreign key (source_message_id, conversation_id, user_id)
    references public.messages(id, conversation_id, user_id)
    on delete set null (source_message_id),
  unique (id, user_id),
  check (expires_at > created_at),
  check (
    (status = 'pending' and suggested_content is not null and decided_at is null)
    or (status in ('accepted', 'rejected') and suggested_content is null and decided_at is not null)
  )
);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  source_proposal_id uuid unique,
  approved_at timestamptz not null default now(),
  expires_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (source_proposal_id, user_id)
    references public.memory_proposals(id, user_id)
    on delete set null (source_proposal_id),
  check (expires_at is null or expires_at >= approved_at)
);

create table public.social_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null check (char_length(btrim(description)) between 1 and 2000),
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'completed', 'dismissed')),
  due_at timestamptz,
  completed_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (conversation_id, user_id)
    references public.conversations(id, user_id)
    on delete set null (conversation_id),
  check ((status = 'completed') = (completed_at is not null))
);

create index conversations_owner_recent_idx on public.conversations (user_id, updated_at desc);
create index messages_context_order_idx on public.messages
  (conversation_id, context_epoch, created_at, id);
create index memory_proposals_owner_pending_idx on public.memory_proposals
  (user_id, status, expires_at);
create index memories_owner_expiry_idx on public.memories (user_id, expires_at);
create index social_actions_owner_status_idx on public.social_actions (user_id, status, created_at desc);

create function public.touch_versioned_row()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;
revoke all on function public.touch_versioned_row() from public, anon, authenticated;

create function public.touch_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  if row(new.display_name, new.city, new.interests, new.tone)
    is distinct from row(old.display_name, old.city, old.interests, old.tone) then
    new.memory_revision := old.memory_revision + 1;
  end if;
  return new;
end;
$$;
revoke all on function public.touch_profile() from public, anon, authenticated;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_profile();
create trigger conversations_touch before update on public.conversations
  for each row execute function public.touch_versioned_row();
create trigger memory_proposals_touch before update on public.memory_proposals
  for each row execute function public.touch_versioned_row();
create trigger memories_touch before update on public.memories
  for each row execute function public.touch_versioned_row();
create trigger social_actions_touch before update on public.social_actions
  for each row execute function public.touch_versioned_row();

-- Every authenticated identity, including an explicitly enabled guest identity,
-- gets one empty profile. Existing identities are backfilled once by migration.
create function public.create_user_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.create_user_profile() from public, anon, authenticated;
create trigger dartmouth_user_profile after insert on auth.users
  for each row execute function public.create_user_profile();
insert into public.profiles(id) select id from auth.users on conflict (id) do nothing;

create function public.invalidate_profile_context()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if row(new.display_name, new.city, new.interests, new.tone)
    is distinct from row(old.display_name, old.city, old.interests, old.tone) then
    update public.conversations set context_epoch = context_epoch + 1 where user_id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function public.invalidate_profile_context() from public, anon, authenticated;
create trigger profiles_invalidate_context after update on public.profiles
  for each row execute function public.invalidate_profile_context();

-- Invalidate model context immediately on explicit approved-memory changes.
-- Wall-clock expiry does not fire a trigger: see the retrieval contract in docs.
create function public.invalidate_memory_context()
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
  update public.profiles set memory_revision = memory_revision + 1 where id = owner_id;
  update public.conversations set context_epoch = context_epoch + 1 where user_id = owner_id;
  return null;
end;
$$;
revoke all on function public.invalidate_memory_context() from public, anon, authenticated;
create trigger memories_invalidate_context after insert or update or delete on public.memories
  for each row execute function public.invalidate_memory_context();

-- A stale streaming request must not append a response to the new context epoch.
create function public.check_message_context()
returns trigger language plpgsql set search_path = '' as $$
declare
  current_epoch bigint;
begin
  select context_epoch into current_epoch from public.conversations
    where id = new.conversation_id and user_id = new.user_id for update;
  if not found then raise exception 'conversation_not_found' using errcode = 'P0002'; end if;
  if new.context_epoch <> current_epoch then
    raise exception 'stale_conversation_context' using errcode = '40001';
  end if;
  return new;
end;
$$;
revoke all on function public.check_message_context() from public, anon, authenticated;
create trigger messages_check_context before insert on public.messages
  for each row execute function public.check_message_context();

-- Supabase may have default table grants. Start from an explicit deny, then
-- expose only the operations and columns needed by a signed-in data owner.
revoke all on table public.profiles, public.conversations, public.messages,
  public.memory_proposals, public.memories, public.social_actions from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on table public.profiles, public.conversations, public.messages,
  public.memory_proposals, public.memories, public.social_actions to authenticated;

grant insert (id, display_name, city, interests, tone) on public.profiles to authenticated;
grant update (display_name, city, interests, tone) on public.profiles to authenticated;
grant insert (id, user_id, title, scenario) on public.conversations to authenticated;
grant update (title, status) on public.conversations to authenticated;
grant delete on public.conversations to authenticated;
grant insert (id, user_id, conversation_id, role, content, client_request_id, context_epoch)
  on public.messages to authenticated;
grant delete on public.messages to authenticated;
grant insert (id, user_id, conversation_id, source_message_id, suggested_content, expires_at)
  on public.memory_proposals to authenticated;
grant delete on public.memory_proposals to authenticated;
-- No direct INSERT into memories and no direct proposal-status UPDATE.
grant update (content, expires_at) on public.memories to authenticated;
grant delete on public.memories to authenticated;
grant insert (id, user_id, conversation_id, title, description, due_at)
  on public.social_actions to authenticated;
grant update (title, description, due_at) on public.social_actions to authenticated;
grant delete on public.social_actions to authenticated;
grant all on table public.profiles, public.conversations, public.messages,
  public.memory_proposals, public.memories, public.social_actions to service_role;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.memory_proposals enable row level security;
alter table public.memories enable row level security;
alter table public.social_actions enable row level security;

create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_create on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_edit on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy conversations_read on public.conversations for select to authenticated
  using (user_id = (select auth.uid()));
create policy conversations_create on public.conversations for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy conversations_edit on public.conversations for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy conversations_delete on public.conversations for delete to authenticated
  using (user_id = (select auth.uid()));

create policy messages_read on public.messages for select to authenticated
  using (user_id = (select auth.uid()));
create policy messages_create on public.messages for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy messages_delete on public.messages for delete to authenticated
  using (user_id = (select auth.uid()));

create policy memory_proposals_read on public.memory_proposals for select to authenticated
  using (user_id = (select auth.uid()));
create policy memory_proposals_create on public.memory_proposals for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy memory_proposals_delete on public.memory_proposals for delete to authenticated
  using (user_id = (select auth.uid()));

create policy memories_read on public.memories for select to authenticated
  using (user_id = (select auth.uid()));
create policy memories_edit on public.memories for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy memories_delete on public.memories for delete to authenticated
  using (user_id = (select auth.uid()));

create policy social_actions_read on public.social_actions for select to authenticated
  using (user_id = (select auth.uid()));
create policy social_actions_create on public.social_actions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy social_actions_edit on public.social_actions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy social_actions_delete on public.social_actions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Only the explicit user-approval endpoint invokes this function. Model tools
-- never receive this capability. Definer rights allow the protected INSERT;
-- ownership and expiry are checked here rather than accepting a supplied owner.
create function public.accept_memory_proposal(
  p_proposal_id uuid,
  p_content text default null,
  p_expires_at timestamptz default null,
  p_expected_version bigint default null
) returns public.memories language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  proposal public.memory_proposals;
  saved_memory public.memories;
begin
  if actor_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_expected_version is null then raise exception 'expected_version_required' using errcode = '22023'; end if;
  select * into proposal from public.memory_proposals
    where id = p_proposal_id and user_id = actor_id for update;
  if not found then raise exception 'proposal_not_found' using errcode = 'P0002'; end if;
  if proposal.status = 'accepted' then
    select * into saved_memory from public.memories
      where source_proposal_id = proposal.id and user_id = actor_id;
    if found then return saved_memory; end if;
    raise exception 'accepted_memory_was_deleted' using errcode = 'P0001';
  end if;
  if proposal.status <> 'pending' then raise exception 'proposal_already_resolved' using errcode = 'P0001'; end if;
  if proposal.expires_at <= now() then raise exception 'proposal_expired' using errcode = 'P0001'; end if;
  if p_expected_version <> proposal.version then
    raise exception 'stale_proposal_version' using errcode = '40001';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'memory_expiry_must_be_future' using errcode = '22023';
  end if;
  insert into public.memories(user_id, content, source_proposal_id, expires_at)
    values (actor_id, btrim(coalesce(p_content, proposal.suggested_content)), proposal.id, p_expires_at)
    returning * into saved_memory;
  update public.memory_proposals set status = 'accepted', suggested_content = null, decided_at = now()
    where id = proposal.id;
  return saved_memory;
end;
$$;

create function public.reject_memory_proposal(p_proposal_id uuid, p_expected_version bigint default null)
returns public.memory_proposals language plpgsql security definer set search_path = '' as $$
declare
  proposal public.memory_proposals;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_expected_version is null then raise exception 'expected_version_required' using errcode = '22023'; end if;
  select * into proposal from public.memory_proposals
    where id = p_proposal_id and user_id = auth.uid() for update;
  if not found then raise exception 'proposal_not_found' using errcode = 'P0002'; end if;
  if proposal.status = 'rejected' then return proposal; end if;
  if proposal.status <> 'pending' then raise exception 'proposal_already_resolved' using errcode = 'P0001'; end if;
  if p_expected_version <> proposal.version then
    raise exception 'stale_proposal_version' using errcode = '40001';
  end if;
  update public.memory_proposals set status = 'rejected', suggested_content = null, decided_at = now()
    where id = proposal.id returning * into proposal;
  return proposal;
end;
$$;

create function public.reset_conversation_context(p_conversation_id uuid, p_expected_epoch bigint)
returns public.conversations language plpgsql security definer set search_path = '' as $$
declare
  conversation public.conversations;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  update public.conversations set context_epoch = context_epoch + 1
    where id = p_conversation_id and user_id = auth.uid() and context_epoch = p_expected_epoch
    returning * into conversation;
  if not found then raise exception 'missing_or_stale_conversation' using errcode = '40001'; end if;
  return conversation;
end;
$$;

create function public.transition_social_action(p_action_id uuid, p_status text, p_expected_version bigint)
returns public.social_actions language plpgsql security definer set search_path = '' as $$
declare
  action public.social_actions;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_expected_version is null then raise exception 'expected_version_required' using errcode = '22023'; end if;
  select * into action from public.social_actions
    where id = p_action_id and user_id = auth.uid() for update;
  if not found then raise exception 'action_not_found' using errcode = 'P0002'; end if;
  if action.status = p_status then return action; end if;
  if action.version <> p_expected_version then raise exception 'stale_action_version' using errcode = '40001'; end if;
  if not ((action.status = 'proposed' and p_status in ('accepted', 'dismissed'))
    or (action.status = 'accepted' and p_status in ('completed', 'dismissed'))) then
    raise exception 'invalid_action_transition' using errcode = '22023';
  end if;
  update public.social_actions set status = p_status,
    completed_at = case when p_status = 'completed' then now() else null end
    where id = action.id returning * into action;
  return action;
end;
$$;

revoke all on function public.accept_memory_proposal(uuid, text, timestamptz, bigint)
  from public, anon, authenticated;
revoke all on function public.reject_memory_proposal(uuid, bigint) from public, anon, authenticated;
revoke all on function public.reset_conversation_context(uuid, bigint) from public, anon, authenticated;
revoke all on function public.transition_social_action(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.accept_memory_proposal(uuid, text, timestamptz, bigint) to authenticated;
grant execute on function public.reject_memory_proposal(uuid, bigint) to authenticated;
grant execute on function public.reset_conversation_context(uuid, bigint) to authenticated;
grant execute on function public.transition_social_action(uuid, text, bigint) to authenticated;

comment on table public.memory_proposals is 'Unapproved suggestions. Never load these as long-term model memory.';
comment on table public.memories is 'User-approved facts. Retrieval must filter expires_at on every request.';
comment on column public.conversations.context_epoch is 'Model-context generation, separate from displayable transcript history.';
comment on column public.profiles.memory_revision is 'Invalidates model context after memory or profile changes; expiry also needs wall-clock checks.';

commit;
