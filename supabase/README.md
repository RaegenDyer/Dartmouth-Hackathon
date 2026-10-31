# Supabase preparation

The migrations `migrations/202610300001_initial_schema.sql` and `migrations/202610310001_chat_persistence.sql` (conversation state, message safety flag, memory-change time, encrypted emergency contact) have **not been applied to the shared Supabase project**. It prepares the relational model, row-level security, memory-approval RPCs, and context invalidation. The application and deployment credentials are separate from this migration and must stay out of source control.

Read [the data model](../docs/data-model.md) before changing the schema. Keep database changes in migrations so contributors work from the same definition.

## Isolated schema checks

After installing the repository dependencies, run:

```sh
npm run check:schema
```

`scripts/check-schema.mjs` runs the migration and 37 focused checks against an in-memory PGlite PostgreSQL instance. It reads only the migration file, creates synthetic users and test data, and closes the database when finished. It neither loads credentials nor contacts Supabase or another remote service. The test dependency is pinned to PGlite `0.5.13`. Regression checks include whitespace-padded text limits, bounded profile interests, and expiry passing during an explicit transaction.

The harness supplies minimal `auth.users`, `auth.uid()`, and database-role stubs. Passing these checks verifies the exercised SQL behavior; it does not validate real Supabase JWTs, Auth signup behavior, the Data API, or concurrent requests. The designated development-project checks below remain necessary before applying the migration to the shared project.

## First implementation pass

1. Agree on guest access versus permanent sign-in, transcript retention, and the context reset UX.
2. Review this migration against the API contracts. Its `ON DELETE SET NULL (column)` syntax targets PostgreSQL 15 or later.
3. Apply it to a disposable local or separate development Supabase database, using the normal migration workflow. Do not paste it into the shared project just to test it.
4. Run the checks below using two authenticated test identities and an unauthenticated client. Then wire the app to Supabase with its publishable key and the current user's JWT.
5. Promote the migration through the team's deployment process after review. Applying a schema does not configure Supabase Auth providers, email delivery, URLs, or production environment variables.

## Focused verification checklist

| Check | Expected result |
|---|---|
| Create a test Auth user | One empty `profiles` row appears with the same ID |
| Unauthenticated Data API select/insert/update/delete on every app table | Denied; no public table access |
| User A reads or modifies user B's known row ID | No rows returned/modified, or authorization error |
| User A inserts a message or proposal referencing user B's conversation | Rejected by RLS or composite foreign key |
| User A creates a pending proposal | Visible to A; absent from approved memories |
| A inserts directly into `memories` or sets proposal status directly | Permission denied |
| A explicitly accepts their unexpired proposal via RPC | Exactly one approved memory is created; proposal text is cleared |
| A transaction waits past proposal or requested memory expiry before approval | Rejected using the actual decision time, even if the transaction began before expiry |
| A writes oversized whitespace-padded text or invalid profile interests | Rejected by database constraints as well as API validation |
| Repeat the same acceptance request | Existing memory returned; no second insert |
| Accept a rejected, expired, foreign, or deleted-memory proposal | Rejected; no resurrection or new memory |
| Update/delete an approved memory | `memory_revision` and conversation epochs increment |
| Edit or clear profile name/city/interests/tone | Revision and conversation epochs increment; stale model context is discarded |
| Insert an assistant message with an earlier context epoch | Rejected with `40001` |
| Repeat a message with the same conversation/request ID/role | Unique constraint rejects a duplicate row |
| Complete a proposed action without first accepting it | Rejected by transition RPC |
| Delete a conversation | Messages/proposals removed; approved memories and actions survive with detached source references |
| Delete the Auth user using trusted administration in the disposable database | All app rows for that user are removed through foreign-key cascades |

SQL-editor queries run as an administrator and bypass the protections an app user encounters. RLS checks must use the publishable key plus a real user session, or explicitly impersonate the intended role in a disposable database. Do not mistake an administrator's successful query for an RLS test.

Useful inspection queries, after applying the migration to the disposable database:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'conversations', 'messages',
    'memory_proposals', 'memories', 'social_actions');

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

select table_name, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and grantee = 'authenticated'
order by table_name, column_name;
```

## Boundaries

- This is schema preparation, not a tested production migration. A focused in-memory PGlite PostgreSQL check exercised grants, RLS, constraints, approval retries, action transitions, context invalidation, expiry filtering, and cascades with two test identities and a minimal `auth.uid()` stub. It did not use the hosted Supabase project. Real Supabase Auth/JWT, Data API, and concurrent network-request behavior still require the designated test-project checks above.
- The model receives neither a Supabase management token nor database write tools. User decisions are separate authenticated requests.
- `service_role` has administrative access and bypasses RLS. Ordinary app operations should use the user's session; management tokens belong only in controlled setup/deployment workflows.
- Memory expiry hides rows from model-context retrieval. A scheduled cleanup job and a transcript retention policy are future implementation decisions, not existing guarantees.

Primary references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), and [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).
