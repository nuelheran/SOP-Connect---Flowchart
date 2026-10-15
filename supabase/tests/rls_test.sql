-- Uji kebijakan akses. Jalankan setelah _stub_supabase.sql + migrasi di database kosong.
\set ON_ERROR_STOP 1
\set adm   '''00000000-0000-0000-0000-00000000000a'''
\set budi  '''00000000-0000-0000-0000-00000000000b'''
\set citra '''00000000-0000-0000-0000-00000000000c'''
\set dewi  '''00000000-0000-0000-0000-00000000000d'''
insert into auth.users (id, email, raw_user_meta_data) values
 (:adm, 'admin@contoh.co.id', '{"full_name":"Admin SOP"}'),
 (:budi, 'budi@contoh.co.id', '{"full_name":"Budi","unit":"HR"}'),
 (:citra, 'citra@contoh.co.id', '{"full_name":"Citra"}'),
 (:dewi, 'dewi@contoh.co.id', '{"full_name":"Dewi"}');
select email, role from public.profiles order by email;

create or replace function pg_temp.login(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', u)::text, false); end $$;

-- 1. Budi membuat flowchart; mencoba memalsukan owner_id → tetap Budi
select pg_temp.login(:budi); set role authenticated;
insert into public.flowcharts (title, owner_id, steps) values ('Pengajuan Cuti', :citra, '[{"id":"s1","type":"start","text":"Mulai","lane":"Karyawan"}]');
select title, owner_id = :budi as owner_is_budi, version, revision from public.flowcharts;
reset role;

-- 2. Citra (visibilitas org) bisa melihat tapi tidak bisa mengubah
select pg_temp.login(:citra); set role authenticated;
select count(*) as citra_sees from public.flowcharts;
with u as (update public.flowcharts set title = 'dibajak' returning 1) select count(*) as citra_updated from u;
reset role;

-- 3. Budi membatasi visibilitas → Citra tidak melihat, Admin tetap melihat
select pg_temp.login(:budi); set role authenticated;
update public.flowcharts set visibility = 'restricted';
reset role;
select pg_temp.login(:citra); set role authenticated; select count(*) as citra_sees_restricted from public.flowcharts; reset role;
select pg_temp.login(:adm);   set role authenticated; select count(*) as admin_sees_restricted from public.flowcharts; reset role;

-- 4. Citra tidak bisa memberi dirinya akses
select pg_temp.login(:citra); set role authenticated;
do $$ begin
  insert into public.flowchart_access (flowchart_id, user_id, role) select id, auth.uid(), 'editor' from public.flowcharts;
  raise notice 'citra self-grant rows: none visible (OK if 0 rows inserted)';
exception when insufficient_privilege then raise notice 'OK citra self-grant ditolak';
end $$;
reset role;
select count(*) as access_rows_after_citra_attempt from public.flowchart_access;

-- 5. Budi memberi Citra Pembaca → bisa melihat, tidak bisa mengubah
select pg_temp.login(:budi); set role authenticated;
insert into public.flowchart_access (flowchart_id, user_id, role) select id, :citra, 'reader' from public.flowcharts;
reset role;
select pg_temp.login(:citra); set role authenticated;
select count(*) as reader_sees from public.flowcharts;
with u as (update public.flowcharts set title = 'x' returning 1) select count(*) as reader_updated from u;
reset role;

-- 6. Jadikan Editor → bisa ubah isi, tapi tidak visibilitas/pemilik/versi
select pg_temp.login(:budi); set role authenticated; update public.flowchart_access set role = 'editor' where user_id = :citra; reset role;
select pg_temp.login(:citra); set role authenticated;
with u as (update public.flowcharts set steps = steps || '[{"id":"s2","type":"process","text":"Mengisi formulir","lane":"Karyawan"}]' returning revision) select revision as editor_update_revision from u;
do $$ begin update public.flowcharts set visibility = 'org'; raise exception 'GAGAL: editor bisa ubah visibilitas';
exception when insufficient_privilege then raise notice 'OK editor tidak bisa ubah visibilitas'; end $$;
do $$ begin update public.flowcharts set owner_id = auth.uid(); raise exception 'GAGAL: editor bisa ganti pemilik';
exception when insufficient_privilege then raise notice 'OK editor tidak bisa ganti pemilik'; end $$;
do $$ begin update public.flowcharts set version = 99; raise exception 'GAGAL: versi bisa diubah langsung';
exception when insufficient_privilege then raise notice 'OK versi tidak bisa diubah langsung'; end $$;
select public.save_version(id, 'Versi awal') as saved_version from public.flowcharts;
do $$ begin insert into public.flowchart_access (flowchart_id, user_id, role) select id, '00000000-0000-0000-0000-00000000000d', 'reader' from public.flowcharts;
  raise exception 'GAGAL: editor bisa memberi akses';
exception when insufficient_privilege then raise notice 'OK editor tidak bisa memberi akses'; end $$;
do $$ begin perform public.transfer_ownership(id, auth.uid()) from public.flowcharts; raise exception 'GAGAL: editor bisa ambil alih';
exception when insufficient_privilege then raise notice 'OK editor tidak bisa alih kepemilikan'; end $$;
reset role;

-- 7. Dewi (tanpa akses) tidak melihat apa pun dan tidak bisa simpan versi
select pg_temp.login(:dewi); set role authenticated;
select count(*) as dewi_sees from public.flowcharts;
do $$ begin perform public.save_version(id) from public.flowcharts; raise notice 'OK dewi: tidak ada baris terlihat'; end $$;
do $$ begin perform public.save_version((select id from public.flowcharts limit 1)); exception when others then raise notice 'OK dewi save_version: %', sqlerrm; end $$;
do $$ begin update public.profiles set role = 'admin' where id = auth.uid(); raise exception 'GAGAL: bisa jadi admin';
exception when insufficient_privilege then raise notice 'OK dewi tidak bisa jadi admin'; end $$;
do $$ begin perform public.set_user_role(auth.uid(), 'admin'); raise exception 'GAGAL';
exception when insufficient_privilege then raise notice 'OK set_user_role ditolak untuk non-admin'; end $$;
update public.profiles set full_name = 'Dewi Lestari' where id = auth.uid();
reset role;
select full_name from public.profiles where email like 'dewi%';

-- 8. Budi alihkan ke Citra; Budi menjadi Editor
select pg_temp.login(:budi); set role authenticated;
select public.transfer_ownership(id, :citra) from public.flowcharts;
reset role;
select (owner_id = :citra) as citra_is_owner from public.flowcharts;
select role as budi_role from public.flowchart_access where user_id = :budi;

-- 9. Restore versi, lalu hapus oleh pemilik (cascade tanpa error)
select pg_temp.login(:budi); set role authenticated;
select public.restore_version(id, 1) from public.flowcharts;
with d as (delete from public.flowcharts returning 1) select count(*) as budi_deleted from d;
reset role;
select jsonb_array_length(steps) as steps_after_restore from public.flowcharts;
select pg_temp.login(:citra); set role authenticated;
select action, detail from public.activity_log order by id;
with d as (delete from public.flowcharts returning 1) select count(*) as citra_deleted from d;
reset role;
select count(*) as flowcharts_left, (select count(*) from public.activity_log) as logs_left from public.flowcharts;

-- 10. Batasi domain
select pg_temp.login(:adm); set role authenticated; select public.set_allowed_domain('@Contoh.co.id'); reset role;
select allowed_email_domain from public.app_settings;
do $$ begin insert into auth.users (id, email) values (gen_random_uuid(), 'luar@gmail.com'); raise exception 'GAGAL: domain luar diterima';
exception when insufficient_privilege then raise notice 'OK domain luar ditolak: %', sqlerrm; end $$;
insert into auth.users (id, email) values (gen_random_uuid(), 'eko@contoh.co.id');
select email, role from public.profiles where email like 'eko%';

-- 11. Anon tidak melihat apa pun
select pg_temp.login(null); set role anon;
do $$ begin perform count(*) from public.profiles; raise notice 'anon profiles visible rows: %', (select count(*) from public.profiles); end $$;
reset role;
