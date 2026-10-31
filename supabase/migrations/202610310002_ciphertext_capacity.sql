-- Keep ciphertext storage bounds separate from application plaintext limits.
-- A valid 280 UTF-16-unit memory can use 840 UTF-8 bytes. The v2 AES-GCM
-- envelope and Base64 encoding expand that to 1,165 stored characters, so the
-- previous 1,000-character checks rejected valid Unicode before/after approval.
-- App contracts still enforce the 280-unit plaintext limit before encryption.
begin;

alter table public.memory_proposals
  drop constraint memory_proposals_suggested_content_check,
  add constraint memory_proposals_suggested_content_check
    check (suggested_content is null or
      (char_length(suggested_content) <= 2048 and btrim(suggested_content) <> ''));

alter table public.memories
  drop constraint memories_content_check,
  add constraint memories_content_check
    check (char_length(content) <= 2048 and btrim(content) <> '');

commit;
