-- =====================================================================
-- FLOWCRAFT · SOPConnect — skema database (Supabase / PostgreSQL)
-- Jalankan sekali di Supabase: Dashboard → SQL Editor → tempel → Run.
-- Semua hak akses dijaga di server lewat Row Level Security (RLS).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- tipe ----------
create type public.flow_status     as enum ('draft', 'review', 'final');
create type public.flow_visibility as enum ('org', 'restricted');
create type public.access_role     as enum ('editor', 'reader');
create type public.app_role        as enum ('user', 'admin');

-- ---------- pengaturan aplikasi (satu baris) ----------
create table public.app_settings (
  id                   boolean primary key default true check (id),
  allowed_email_domain text,            -- null = semua domain email boleh mendaftar
  updated_at           timestamptz not null default now()
);
insert into public.app_settings default values;

-- ---------- profil pengguna ----------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text not null default '' check (char_length(full_name) <= 120),
  unit       text not null default '' check (char_length(unit) <= 120),
  role       public.app_role not null default 'user',
  created_at timestamptz not null default now()
);

-- ---------- flowchart ----------
create table public.flowcharts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default '' check (char_length(title) <= 200),
  code        text not null default '' check (char_length(code) <= 60),
  unit        text not null default '' check (char_length(unit) <= 120),
  description text not null default '' check (char_length(description) <= 4000),
  status      public.flow_status not null default 'draft',
  visibility  public.flow_visibility not null default 'org',
  steps       jsonb not null default '[]'::jsonb
              check (jsonb_typeof(steps) = 'array' and octet_length(steps::text) < 300000),
  version     integer not null default 0,     -- nomor versi tersimpan terakhir (0 = belum pernah)
  revision    integer not null default 1,     -- naik di setiap penyimpanan; untuk deteksi bentrok edit
  owner_id    uuid not null references public.profiles (id),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);
create index flowcharts_owner_idx   on public.flowcharts (owner_id);
create index flowcharts_updated_idx on public.flowcharts (updated_at desc);

-- ---------- akses per dokumen ----------
create table public.flowchart_access (
  flowchart_id uuid not null references public.flowcharts (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.access_role not null default 'reader',
  granted_by   uuid references public.profiles (id) on delete set null,
  granted_at   timestamptz not null default now(),
  primary key (flowchart_id, user_id)
);
create index flowchart_access_user_idx on public.flowchart_access (user_id);

-- ---------- versi (snapshot) ----------
create table public.flowchart_versions (
  id           uuid primary key default gen_random_uuid(),
  flowchart_id uuid not null references public.flowcharts (id) on delete cascade,
  version      integer not null,
  title        text not null,
  steps        jsonb not null,
  note         text not null default '' check (char_length(note) <= 500),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (flowchart_id, version)
);

-- ---------- riwayat aktivitas ----------
create table public.activity_log (
  id           bigint generated always as identity primary key,
  flowchart_id uuid not null references public.flowcharts (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null check (char_length(action) <= 60),
  detail       text not null default '' check (char_length(detail) <= 500),
  created_at   timestamptz not null default now()
);
create index activity_log_flow_idx on public.activity_log (flowchart_id, created_at desc);

-- =====================================================================
-- Fungsi bantu hak akses (security definer: dipakai di dalam RLS tanpa rekursi)
-- =====================================================================
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Peran pengguna saat ini terhadap satu flowchart:
-- 'owner' | 'admin' | 'editor' | 'reader' | 'viewer' (visibilitas org) | null (tidak boleh melihat)
create or replace function public.flow_role(fid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
           when f.owner_id = auth.uid()   then 'owner'
           when public.is_admin()         then 'admin'
           when a.role = 'editor'         then 'editor'
           when a.role = 'reader'         then 'reader'
           when f.visibility = 'org'      then 'viewer'
         end
  from public.flowcharts f
  left join public.flowchart_access a on a.flowchart_id = f.id and a.user_id = auth.uid()
  where f.id = fid;
$$;

create or replace function public.can_view(fid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.flow_role(fid) is not null;
$$;
create or replace function public.can_edit(fid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.flow_role(fid) in ('owner', 'admin', 'editor'), false);
$$;
create or replace function public.can_manage(fid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.flow_role(fid) in ('owner', 'admin'), false);
$$;
create or replace function public.has_explicit_access(fid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.flowchart_access where flowchart_id = fid and user_id = auth.uid());
$$;

-- =====================================================================
-- Trigger
-- =====================================================================

-- Pengguna baru → profil. Pengguna pertama otomatis menjadi admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  dom text;
begin
  select allowed_email_domain into dom from public.app_settings where id;
  if dom is not null and dom <> '' and lower(split_part(new.email, '@', 2)) <> lower(trim(leading '@' from dom)) then
    raise exception 'Pendaftaran hanya untuk email @%', trim(leading '@' from dom) using errcode = '42501';
  end if;
  insert into public.profiles (id, email, full_name, unit, role)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    left(coalesce(new.raw_user_meta_data ->> 'unit', ''), 120),
    case when exists (select 1 from public.profiles where role = 'admin') then 'user' else 'admin' end::public.app_role
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profil: hanya admin yang boleh mengubah peran aplikasi.
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Hanya admin yang dapat mengubah peran pengguna' using errcode = '42501';
  end if;
  new.id := old.id; new.email := old.email; new.created_at := old.created_at;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- Flowchart baru: pemilik = pembuat.
create or replace function public.flowcharts_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.owner_id   := auth.uid();
  new.created_by := auth.uid();
  new.updated_by := auth.uid();
  new.created_at := now();
  new.updated_at := now();
  new.version    := 0;
  new.revision   := 1;
  return new;
end $$;
create trigger flowcharts_before_insert before insert on public.flowcharts
  for each row execute function public.flowcharts_before_insert();

-- Perubahan flowchart: jaga kolom yang hanya boleh diubah pemilik/admin atau lewat fungsi khusus.
create or replace function public.flowcharts_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  privileged boolean := coalesce(current_setting('flowcraft.privileged', true), '') = 'on';
begin
  if not privileged then
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Gunakan fungsi alih kepemilikan untuk mengganti pemilik' using errcode = '42501';
    end if;
    if new.visibility is distinct from old.visibility and not public.can_manage(old.id) then
      raise exception 'Hanya pemilik yang dapat mengubah visibilitas' using errcode = '42501';
    end if;
    if new.version is distinct from old.version then
      raise exception 'Nomor versi hanya berubah lewat Simpan versi' using errcode = '42501';
    end if;
  end if;
  new.id         := old.id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.revision   := old.revision + 1;
  return new;
end $$;
create trigger flowcharts_before_update before update on public.flowcharts
  for each row execute function public.flowcharts_before_update();

-- Catat perubahan penting secara otomatis.
create or replace function public.flowcharts_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (flowchart_id, actor_id, action, detail) values (new.id, auth.uid(), 'created', 'Flowchart dibuat');
  else
    if new.status is distinct from old.status then
      insert into public.activity_log (flowchart_id, actor_id, action, detail)
      values (new.id, auth.uid(), 'status', 'Status diubah menjadi ' || initcap(new.status::text));
    end if;
    if new.visibility is distinct from old.visibility then
      insert into public.activity_log (flowchart_id, actor_id, action, detail)
      values (new.id, auth.uid(), 'visibility',
              case new.visibility when 'org' then 'Visibilitas: semua pengguna' else 'Visibilitas: hanya yang diberi akses' end);
    end if;
  end if;
  return null;
end $$;
create trigger flowcharts_log after insert or update on public.flowcharts
  for each row execute function public.flowcharts_log();

create or replace function public.access_log()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  nm text;
begin
  select coalesce(nullif(full_name, ''), email) into nm from public.profiles where id = coalesce(new.user_id, old.user_id);
  if tg_op = 'INSERT' then
    insert into public.activity_log (flowchart_id, actor_id, action, detail)
    values (new.flowchart_id, auth.uid(), 'access', 'Akses ' || case new.role when 'editor' then 'Editor' else 'Pembaca' end || ' diberikan ke ' || nm);
  elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
    insert into public.activity_log (flowchart_id, actor_id, action, detail)
    values (new.flowchart_id, auth.uid(), 'access', 'Peran ' || nm || ' diubah menjadi ' || case new.role when 'editor' then 'Editor' else 'Pembaca' end);
  elsif tg_op = 'DELETE' and exists (select 1 from public.flowcharts where id = old.flowchart_id) then
    insert into public.activity_log (flowchart_id, actor_id, action, detail)
    values (old.flowchart_id, auth.uid(), 'access', 'Akses dicabut dari ' || nm);
  end if;
  return null;
end $$;
create trigger flowchart_access_log after insert or update or delete on public.flowchart_access
  for each row execute function public.access_log();

create or replace function public.access_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.flowcharts where id = new.flowchart_id and owner_id = new.user_id) then
    raise exception 'Pemilik sudah memiliki akses penuh' using errcode = '23514';
  end if;
  new.granted_by := auth.uid();
  new.granted_at := now();
  return new;
end $$;
create trigger flowchart_access_before_write before insert or update on public.flowchart_access
  for each row execute function public.access_before_write();

-- =====================================================================
-- Fungsi yang dipanggil aplikasi (RPC)
-- =====================================================================

-- Simpan snapshot versi baru dari isi flowchart saat ini.
create or replace function public.save_version(fid uuid, note text default '')
returns integer language plpgsql security definer set search_path = '' as $$
declare
  f public.flowcharts;
  v integer;
begin
  if not public.can_edit(fid) then
    raise exception 'Anda tidak dapat mengubah flowchart ini' using errcode = '42501';
  end if;
  select * into f from public.flowcharts where id = fid for update;
  v := f.version + 1;
  insert into public.flowchart_versions (flowchart_id, version, title, steps, note, created_by)
  values (fid, v, f.title, f.steps, left(coalesce(note, ''), 500), auth.uid());
  perform set_config('flowcraft.privileged', 'on', true);
  update public.flowcharts set version = v where id = fid;
  perform set_config('flowcraft.privileged', '', true);
  insert into public.activity_log (flowchart_id, actor_id, action, detail)
  values (fid, auth.uid(), 'version', 'Versi ' || v || ' disimpan' || case when coalesce(note, '') <> '' then ': ' || left(note, 400) else '' end);
  return v;
end $$;

-- Kembalikan isi flowchart ke snapshot versi tertentu.
create or replace function public.restore_version(fid uuid, ver integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.flowchart_versions;
begin
  if not public.can_edit(fid) then
    raise exception 'Anda tidak dapat mengubah flowchart ini' using errcode = '42501';
  end if;
  select * into s from public.flowchart_versions where flowchart_id = fid and version = ver;
  if not found then raise exception 'Versi % tidak ditemukan', ver; end if;
  update public.flowcharts set steps = s.steps, title = s.title where id = fid;
  insert into public.activity_log (flowchart_id, actor_id, action, detail)
  values (fid, auth.uid(), 'restore', 'Isi dikembalikan ke versi ' || ver);
end $$;

-- Alihkan kepemilikan. Pemilik lama otomatis menjadi Editor.
create or replace function public.transfer_ownership(fid uuid, new_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  old_owner uuid;
  nm text;
begin
  if not public.can_manage(fid) then
    raise exception 'Hanya pemilik atau admin yang dapat mengalihkan kepemilikan' using errcode = '42501';
  end if;
  select owner_id into old_owner from public.flowcharts where id = fid for update;
  if old_owner = new_owner then return; end if;
  if not exists (select 1 from public.profiles where id = new_owner) then
    raise exception 'Pengguna tujuan tidak ditemukan';
  end if;
  delete from public.flowchart_access where flowchart_id = fid and user_id = new_owner;
  perform set_config('flowcraft.privileged', 'on', true);
  update public.flowcharts set owner_id = new_owner where id = fid;
  perform set_config('flowcraft.privileged', '', true);
  insert into public.flowchart_access (flowchart_id, user_id, role) values (fid, old_owner, 'editor')
  on conflict (flowchart_id, user_id) do update set role = 'editor';
  select coalesce(nullif(full_name, ''), email) into nm from public.profiles where id = new_owner;
  insert into public.activity_log (flowchart_id, actor_id, action, detail)
  values (fid, auth.uid(), 'owner', 'Kepemilikan dialihkan ke ' || nm);
end $$;

-- Admin: ubah peran aplikasi pengguna.
create or replace function public.set_user_role(target uuid, new_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin' using errcode = '42501';
  end if;
  if target = auth.uid() and new_role <> 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'Harus ada minimal satu admin';
  end if;
  update public.profiles set role = new_role where id = target;
end $$;

-- Admin: batasi pendaftaran ke domain email tertentu (null/'' = bebas).
create or replace function public.set_allowed_domain(domain text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin' using errcode = '42501';
  end if;
  update public.app_settings
     set allowed_email_domain = nullif(lower(trim(leading '@' from trim(coalesce(domain, '')))), ''),
         updated_at = now()
   where id;
end $$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.app_settings       enable row level security;
alter table public.profiles           enable row level security;
alter table public.flowcharts         enable row level security;
alter table public.flowchart_access   enable row level security;
alter table public.flowchart_versions enable row level security;
alter table public.activity_log       enable row level security;

-- app_settings: semua pengguna masuk boleh membaca; perubahan lewat RPC admin.
create policy "settings: baca" on public.app_settings for select to authenticated using (true);

-- profiles: rekan kerja dapat saling melihat nama (untuk berbagi akses); ubah profil sendiri.
create policy "profiles: baca" on public.profiles for select to authenticated using (true);
create policy "profiles: ubah sendiri" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- flowcharts
create policy "flowcharts: lihat" on public.flowcharts for select to authenticated
  using (
    owner_id = (select auth.uid())
    or visibility = 'org'
    or public.has_explicit_access(id)
    or (select public.is_admin())
  );
create policy "flowcharts: buat" on public.flowcharts for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "flowcharts: ubah" on public.flowcharts for update to authenticated
  using (public.can_edit(id)) with check (public.can_edit(id));
create policy "flowcharts: hapus" on public.flowcharts for delete to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));

-- flowchart_access
create policy "akses: lihat" on public.flowchart_access for select to authenticated
  using (public.can_view(flowchart_id));
create policy "akses: tambah" on public.flowchart_access for insert to authenticated
  with check (public.can_manage(flowchart_id));
create policy "akses: ubah" on public.flowchart_access for update to authenticated
  using (public.can_manage(flowchart_id)) with check (public.can_manage(flowchart_id));
create policy "akses: cabut" on public.flowchart_access for delete to authenticated
  using (public.can_manage(flowchart_id));

-- flowchart_versions: dibaca siapa pun yang boleh melihat; ditulis lewat RPC save_version.
create policy "versi: lihat" on public.flowchart_versions for select to authenticated
  using (public.can_view(flowchart_id));

-- activity_log: dibaca siapa pun yang boleh melihat; aplikasi boleh mencatat atas nama dirinya.
create policy "riwayat: lihat" on public.activity_log for select to authenticated
  using (public.can_view(flowchart_id));
create policy "riwayat: catat" on public.activity_log for insert to authenticated
  with check (actor_id = (select auth.uid()) and public.can_view(flowchart_id));

-- =====================================================================
-- Hak kolom: peran & email profil tidak bisa diubah langsung oleh pengguna.
-- =====================================================================
revoke update on public.profiles from authenticated, anon;
grant  update (full_name, unit) on public.profiles to authenticated;
revoke all on public.app_settings from anon;
revoke insert, update, delete on public.app_settings from authenticated;
revoke insert, update, delete on public.flowchart_versions from authenticated, anon;

revoke execute on function public.save_version(uuid, text)            from anon, public;
revoke execute on function public.restore_version(uuid, integer)      from anon, public;
revoke execute on function public.transfer_ownership(uuid, uuid)      from anon, public;
revoke execute on function public.set_user_role(uuid, public.app_role) from anon, public;
revoke execute on function public.set_allowed_domain(text)            from anon, public;
grant  execute on function public.save_version(uuid, text)            to authenticated;
grant  execute on function public.restore_version(uuid, integer)      to authenticated;
grant  execute on function public.transfer_ownership(uuid, uuid)      to authenticated;
grant  execute on function public.set_user_role(uuid, public.app_role) to authenticated;
grant  execute on function public.set_allowed_domain(text)            to authenticated;
