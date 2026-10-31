// Isolated in-memory PostgreSQL checks. No credentials, hosted services, or network calls.
// Supabase roles and auth.uid() are minimal stubs, not a JWT/Data API integration.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = await PGlite.create();
const sources = ['202610300001_initial_schema.sql', '202610310001_chat_persistence.sql']
  .map(name => new URL('../supabase/migrations/' + name, import.meta.url));
let checks = 0;
function pass(label) { checks++; console.log('PASS ' + label); }
async function expectError(label, sql, params, codes) {
  try { await db.query(sql, params); }
  catch (error) { assert(codes.includes(error.code), label + ': unexpected SQLSTATE ' + error.code); pass(label); return; }
  throw new Error(label + ': expected rejection');
}
async function actor(id) {
  await db.exec('reset role; set role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  for (const source of sources) await db.exec(await readFile(source, 'utf8'));
  pass('migrations apply to isolated PostgreSQL runtime');
  await db.query('insert into auth.users(id) values ($1), ($2)', [A, B]);
  assert.equal((await db.query('select count(*)::int as n from public.profiles')).rows[0].n, 2);
  pass('Auth insert trigger creates both profiles');
  await db.exec('set role anon');
  await expectError('unauthenticated table access denied', 'select * from public.profiles', [], ['42501']);
  await actor(A);
  assert.equal((await db.query('select count(*)::int as n from public.profiles')).rows[0].n, 1);
  pass('RLS exposes only current user profile');
  await expectError('oversized padded profile tone rejected', 'update public.profiles set tone=$1 where id=$2', ['warm' + ' '.repeat(60), A], ['23514']);
  await expectError('oversized profile interest rejected', 'update public.profiles set interests=$1 where id=$2', [['h'.repeat(61)], A], ['23514']);
  await expectError('null profile interest rejected', 'update public.profiles set interests=array[null]::text[] where id=$1', [A], ['23514']);
  await expectError('blank profile interest rejected', 'update public.profiles set interests=$1 where id=$2', [['   '], A], ['23514']);
  await expectError('multidimensional interests rejected', "update public.profiles set interests=array[['hiking','music']] where id=$1", [A], ['23514']);
  const ca = (await db.query('insert into public.conversations(user_id) values ($1) returning id', [A])).rows[0].id;
  await expectError('oversized padded conversation title rejected', 'update public.conversations set title=$1 where id=$2', ['A chat' + ' '.repeat(120), ca], ['23514']);
  await actor(B);
  const cb = (await db.query('insert into public.conversations(user_id) values ($1) returning id', [B])).rows[0].id;
  await actor(A);
  assert.equal((await db.query('select * from public.conversations where id = $1', [cb])).rows.length, 0);
  pass('cross-user conversation read returns no rows');
  await expectError('cross-user conversation attachment denied', 'insert into public.messages(user_id,conversation_id,role,content,client_request_id) values ($1,$2,$3,$4,$5)', [A, cb, 'user', 'test', requestId], ['P0002','23503','42501']);
  await expectError('oversized padded message rejected', 'insert into public.messages(user_id,conversation_id,role,content,client_request_id) values ($1,$2,$3,$4,$5)', [A, ca, 'user', 'hello' + ' '.repeat(12000), requestId], ['23514']);
  const ma = (await db.query('insert into public.messages(user_id,conversation_id,role,content,client_request_id) values ($1,$2,$3,$4,$5) returning id', [A, ca, 'user', 'I like hiking.', requestId])).rows[0].id;
  await expectError('oversized padded proposal rejected', 'insert into public.memory_proposals(user_id,conversation_id,suggested_content) values ($1,$2,$3)', [A, ca, 'Hikes.' + ' '.repeat(1000)], ['23514']);
  const p1 = (await db.query('insert into public.memory_proposals(user_id,conversation_id,source_message_id,suggested_content) values ($1,$2,$3,$4) returning id', [A, ca, ma, 'I like hiking.'])).rows[0].id;
  await expectError('direct approved-memory insertion denied', 'insert into public.memories(user_id,content) values ($1,$2)', [A, 'unapproved'], ['42501']);
  await expectError('direct proposal status mutation denied', 'update public.memory_proposals set status = $1 where id = $2', ['accepted', p1], ['42501']);
  const saved = (await db.query('select * from public.accept_memory_proposal($1,$2,null,1)', [p1, 'Enjoys hiking.'])).rows[0];
  assert.equal(saved.content, 'Enjoys hiking.');
  assert.equal((await db.query('select suggested_content from public.memory_proposals where id=$1', [p1])).rows[0].suggested_content, null);
  assert.equal(String((await db.query('select memory_revision from public.profiles where id=$1', [A])).rows[0].memory_revision), '1');
  assert.equal(String((await db.query('select context_epoch from public.conversations where id=$1', [ca])).rows[0].context_epoch), '1');
  pass('approval inserts memory, redacts proposal and invalidates context atomically');
  const retry = (await db.query('select * from public.accept_memory_proposal($1,null,null,1)', [p1])).rows[0];
  assert.equal(retry.id, saved.id);
  assert.equal((await db.query('select count(*)::int as n from public.memories')).rows[0].n, 1);
  pass('approval retry returns same memory');
  await expectError('oversized padded approved-memory edit rejected', 'update public.memories set content=$1 where id=$2', ['Hikes.' + ' '.repeat(1000), saved.id], ['23514']);
  await expectError('stale assistant context rejected', 'insert into public.messages(user_id,conversation_id,role,content,client_request_id,context_epoch) values ($1,$2,$3,$4,$5,0)', [A, ca, 'assistant', 'old answer', requestId], ['40001']);
  await expectError('duplicate user turn rejected', 'insert into public.messages(user_id,conversation_id,role,content,client_request_id,context_epoch) values ($1,$2,$3,$4,$5,1)', [A, ca, 'user', 'retry', requestId], ['23505']);
  await actor(B);
  await expectError('foreign proposal cannot be accepted', 'select * from public.accept_memory_proposal($1,null,null,1)', [p1], ['P0002']);
  await actor(A);
  const edited = await db.query('update public.memories set content=$1 where id=$2 and version=1 returning version', ['Enjoys short hikes.', saved.id]);
  assert.equal(String(edited.rows[0].version), '2');
  assert.equal(String((await db.query('select memory_revision from public.profiles where id=$1', [A])).rows[0].memory_revision), '2');
  pass('memory edit increments revision and optimistic version');
  await db.query('delete from public.memories where id=$1', [saved.id]);
  await expectError('retry cannot resurrect deleted approved memory', 'select * from public.accept_memory_proposal($1,null,null,1)', [p1], ['P0001']);
  await expectError('oversized padded action title rejected', 'insert into public.social_actions(user_id,conversation_id,title,description) values ($1,$2,$3,$4)', [A, ca, 'Hello' + ' '.repeat(120), 'Ask about lunch.'], ['23514']);
  await expectError('oversized padded action description rejected', 'insert into public.social_actions(user_id,conversation_id,title,description) values ($1,$2,$3,$4)', [A, ca, 'Hello', 'Ask about lunch.' + ' '.repeat(2000)], ['23514']);
  const action = (await db.query('insert into public.social_actions(user_id,conversation_id,title,description) values ($1,$2,$3,$4) returning id', [A, ca, 'Say hello', 'Ask a classmate about lunch.'])).rows[0].id;
  await expectError('proposed action cannot skip acceptance', 'select * from public.transition_social_action($1,$2,1)', [action, 'completed'], ['22023']);
  await db.query('select * from public.transition_social_action($1,$2,1)', [action, 'accepted']);
  const completed = (await db.query('select * from public.transition_social_action($1,$2,2)', [action, 'completed'])).rows[0];
  assert(completed.completed_at);
  pass('social action transitions enforce acceptance before completion');
  const p2 = (await db.query('insert into public.memory_proposals(user_id,conversation_id,source_message_id,suggested_content) values ($1,$2,$3,$4) returning id', [A, ca, ma, 'Enjoys museums.'])).rows[0].id;
  const m2 = (await db.query('select * from public.accept_memory_proposal($1,null,null,1)', [p2])).rows[0].id;
  await db.query('update public.memories set expires_at=approved_at where id=$1', [m2]);
  assert.equal((await db.query('select id from public.memories where expires_at is null or expires_at > now()')).rows.length, 0);
  pass('expiry retrieval filter excludes an expired approved row');
  const beforeProfile = (await db.query('select memory_revision from public.profiles where id=$1', [A])).rows[0];
  const beforeConversation = (await db.query('select context_epoch from public.conversations where id=$1', [ca])).rows[0];
  await db.query('update public.profiles set city=$1 where id=$2', ['Hanover', A]);
  assert.equal(BigInt((await db.query('select memory_revision from public.profiles where id=$1', [A])).rows[0].memory_revision), BigInt(beforeProfile.memory_revision)+1n);
  assert.equal(BigInt((await db.query('select context_epoch from public.conversations where id=$1', [ca])).rows[0].context_epoch), BigInt(beforeConversation.context_epoch)+1n);
  pass('profile personal-field change invalidates model context');
  await expectError('missing proposal version rejected', 'select * from public.accept_memory_proposal($1)', [p1], ['22023']);
  await expectError('missing action version rejected', 'select * from public.transition_social_action($1,$2,null)', [action, 'completed'], ['22023']);

  const exp = (await db.query("insert into public.memory_proposals(user_id,conversation_id,suggested_content,expires_at) values ($1,$2,$3,now()+interval '1 microsecond') returning id", [A, ca, 'Expired proposal'])).rows[0].id;
  await db.exec('reset role');
  await db.query("update public.memory_proposals set created_at=now()-interval '2 days', expires_at=now()-interval '1 day' where id=$1", [exp]);
  await actor(A);
  await expectError('expired proposal cannot be approved', 'select * from public.accept_memory_proposal($1,null,null,1)', [exp], ['P0001']);
  // Explicit transactions reproduce time passing after transaction start (as
  // with a lock wait) without pretending to test concurrent network requests.
  await db.exec('begin');
  const lateProposal = (await db.query("insert into public.memory_proposals(user_id,conversation_id,suggested_content,expires_at) values ($1,$2,$3,clock_timestamp()+interval '10 milliseconds') returning id", [A, ca, 'Approval arrived late.'])).rows[0].id;
  await new Promise(resolve => setTimeout(resolve, 50));
  await expectError('proposal expiry checked at decision time instead of transaction start', 'select * from public.accept_memory_proposal($1,null,null,1)', [lateProposal], ['P0001']);
  await db.exec('rollback');
  const lateMemory = (await db.query('insert into public.memory_proposals(user_id,conversation_id,suggested_content) values ($1,$2,$3) returning id', [A, ca, 'Memory expiry arrived late.'])).rows[0].id;
  await db.exec('begin');
  const deadline = (await db.query("select clock_timestamp()+interval '10 milliseconds' as expiry")).rows[0].expiry;
  await new Promise(resolve => setTimeout(resolve, 50));
  await expectError('memory expiry checked at decision time instead of transaction start', 'select * from public.accept_memory_proposal($1,null,$2,1)', [lateMemory, deadline], ['22023']);
  await db.exec('rollback');
  await db.query('delete from public.conversations where id=$1', [ca]);
  assert.equal((await db.query('select * from public.messages')).rows.length, 0);
  assert.equal((await db.query('select * from public.memory_proposals')).rows.length, 0);
  assert.equal((await db.query('select source_proposal_id from public.memories where id=$1', [m2])).rows[0].source_proposal_id, null);
  assert.equal((await db.query('select conversation_id from public.social_actions where id=$1', [action])).rows[0].conversation_id, null);
  pass('conversation deletion preserves approved memory/action with detached sources');

  // 202610310001_chat_persistence
  const cc = (await db.query('insert into public.conversations(user_id,title_sealed) values ($1,$2) returning id, kept, disclosed, ended_reason', [A, 'v2.sealed-title'])).rows[0];
  assert.equal(cc.kept, true); assert.equal(cc.disclosed, false); assert.equal(cc.ended_reason, null);
  await db.query("update public.conversations set disclosed=true, ended_reason='safety', memories_referenced=$1 where id=$2", [[A], cc.id]);
  pass('owner can record conversation state; threads are kept by default');
  await expectError('unknown ended reason rejected', "update public.conversations set ended_reason='other' where id=$1", [cc.id], ['23514']);
  await expectError('context epoch still not client-writable', 'update public.conversations set context_epoch=99 where id=$1', [cc.id], ['42501']);
  const epoch = (await db.query('select context_epoch from public.conversations where id=$1', [cc.id])).rows[0].context_epoch;
  await db.query('insert into public.messages(user_id,conversation_id,role,content,client_request_id,context_epoch,safety) values ($1,$2,$3,$4,$5,$6,true)', [A, cc.id, 'user', 'v2.hidden', requestId, epoch]);
  pass('messages accept the safety flag');
  await actor(B);
  assert.equal((await db.query('select * from public.conversations where id=$1', [cc.id])).rows.length, 0);
  assert.equal((await db.query("update public.conversations set ended_reason=null where id=$1 returning id", [cc.id])).rows.length, 0);
  pass('cross-user conversation state is neither visible nor writable');
  await actor(A);
  const pc = (await db.query('insert into public.memory_proposals(user_id,conversation_id,suggested_content) values ($1,$2,$3) returning id', [A, cc.id, 'v2.proposal'])).rows[0].id;
  await db.query('select * from public.accept_memory_proposal($1,null,null,1)', [pc]);
  assert((await db.query('select memory_changed_at from public.profiles where id=$1', [A])).rows[0].memory_changed_at);
  pass('memory change records memory_changed_at');
  await db.query('insert into public.emergency_contacts(user_id,sealed) values ($1,$2)', [A, 'v2.contact']);
  await expectError('cannot store a contact for another user', 'insert into public.emergency_contacts(user_id,sealed) values ($1,$2)', [B, 'v2.contact'], ['42501']);
  await actor(B);
  assert.equal((await db.query('select * from public.emergency_contacts')).rows.length, 0);
  pass('emergency contact is private to its owner');
  await db.exec('set role anon');
  await expectError('unauthenticated contact access denied', 'select * from public.emergency_contacts', [], ['42501']);

  await db.exec('reset role');
  await db.query('delete from auth.users where id=$1', [A]);
  for (const table of ['profiles','conversations','messages','memory_proposals','memories','social_actions','emergency_contacts']) {
    const column = table === 'profiles' ? 'id' : 'user_id';
    assert.equal((await db.query(`select count(*)::int as n from public.${table} where ${column}=$1`, [A])).rows[0].n, 0);
  }
  pass('Auth-user deletion cascades through all app data');
  console.log('Completed ' + checks + ' isolated database checks. Supabase Auth/JWT and concurrent network behavior still require integration tests.');
} finally { await db.close(); }
