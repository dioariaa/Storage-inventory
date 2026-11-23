-- ============================================================
-- INVENTORY MANAGEMENT SYSTEM - BERLARIS KOPI & RESTO
-- Supabase Migration: 001_initial_schema
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================

create type transaction_type as enum ('IN', 'OUT');
create type transaction_source as enum ('MANUAL_IN', 'MANUAL_OUT', 'POS_IMPORT', 'MANUAL_SALE');
create type out_reason as enum ('WASTE', 'EXPIRED', 'TESTING', 'OPERATIONAL', 'OTHER');
create type user_role as enum ('admin', 'staff');
create type recipe_status as enum ('DRAFT', 'COMPLETE');

-- ============================================================
-- USER PROFILES (extends Supabase Auth)
-- ============================================================

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role        user_role not null default 'staff',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- MASTER BAHAN BAKU
-- ============================================================

create table public.bahan_baku (
  id            uuid primary key default uuid_generate_v4(),
  nama          text not null,
  satuan        text not null,
  stok_awal     numeric(12,3) not null default 0,
  minimum_stok  numeric(12,3),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),

  constraint bahan_baku_nama_unique unique (nama),
  constraint bahan_baku_stok_awal_check check (stok_awal >= 0),
  constraint bahan_baku_minimum_stok_check check (minimum_stok is null or minimum_stok >= 0)
);

-- ============================================================
-- MASTER MENU
-- ============================================================

create table public.menu (
  id          uuid primary key default uuid_generate_v4(),
  nama        text not null,
  kategori    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),

  constraint menu_nama_unique unique (nama)
);

-- ============================================================
-- RECIPE (Komposisi Menu)
-- ============================================================

create table public.recipe (
  id            uuid primary key default uuid_generate_v4(),
  menu_id       uuid not null references public.menu(id) on delete restrict,
  bahan_baku_id uuid not null references public.bahan_baku(id) on delete restrict,
  qty           numeric(12,3) not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),

  constraint recipe_qty_check check (qty > 0),
  constraint recipe_menu_bahan_unique unique (menu_id, bahan_baku_id)
);

-- ============================================================
-- TRANSAKSI HEADER (IN / OUT)
-- ============================================================

create table public.transaksi (
  id              uuid primary key default uuid_generate_v4(),
  tgl_transaksi   date not null,
  jenis           transaction_type not null,
  sumber          transaction_source not null,
  alasan_out      out_reason,
  catatan         text,
  is_posted       boolean not null default false,
  posted_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id),

  -- For POS import: prevent double-import
  pos_import_ref  text unique,

  -- For sales: link to sales session
  penjualan_id    uuid
);

-- ============================================================
-- DETAIL TRANSAKSI (line items)
-- ============================================================

create table public.transaksi_detail (
  id              uuid primary key default uuid_generate_v4(),
  transaksi_id    uuid not null references public.transaksi(id) on delete cascade,
  bahan_baku_id   uuid not null references public.bahan_baku(id) on delete restrict,
  qty             numeric(12,3) not null,
  saldo_sebelum   numeric(12,3) not null default 0,
  saldo_sesudah   numeric(12,3) not null default 0,
  created_at      timestamptz not null default now(),

  constraint transaksi_detail_qty_check check (qty > 0)
);

-- ============================================================
-- PENJUALAN SESSION (Sales order header)
-- ============================================================

create table public.penjualan (
  id              uuid primary key default uuid_generate_v4(),
  tgl_penjualan   date not null,
  metode          text not null check (metode in ('POS_IMPORT', 'MANUAL')),
  pos_filename    text,
  catatan         text,
  is_posted       boolean not null default false,
  posted_at       timestamptz,
  transaksi_id    uuid references public.transaksi(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id)
);

-- ============================================================
-- DETAIL PENJUALAN (menu line items)
-- ============================================================

create table public.penjualan_detail (
  id              uuid primary key default uuid_generate_v4(),
  penjualan_id    uuid not null references public.penjualan(id) on delete cascade,
  menu_id         uuid not null references public.menu(id) on delete restrict,
  qty_terjual     numeric(10,0) not null,
  created_at      timestamptz not null default now(),

  constraint penjualan_detail_qty_check check (qty_terjual > 0)
);

-- ============================================================
-- VIEW: SALDO BAHAN BAKU (computed balance)
-- ============================================================

create or replace view public.v_saldo_bahan_baku as
select
  b.id,
  b.nama,
  b.satuan,
  b.stok_awal,
  b.minimum_stok,
  b.is_active,
  coalesce(sum(case when t.jenis = 'IN'  then td.qty else 0 end), 0) as total_in,
  coalesce(sum(case when t.jenis = 'OUT' then td.qty else 0 end), 0) as total_out,
  b.stok_awal
  + coalesce(sum(case when t.jenis = 'IN'  then td.qty else 0 end), 0)
  - coalesce(sum(case when t.jenis = 'OUT' then td.qty else 0 end), 0) as saldo_akhir
from public.bahan_baku b
left join public.transaksi_detail td on td.bahan_baku_id = b.id
left join public.transaksi t on t.id = td.transaksi_id and t.is_posted = true
group by b.id, b.nama, b.satuan, b.stok_awal, b.minimum_stok, b.is_active;

-- ============================================================
-- VIEW: MUTASI DASHBOARD (ledger per bahan baku)
-- ============================================================

create or replace view public.v_mutasi_dashboard as
select
  td.id,
  t.tgl_transaksi,
  t.created_at as waktu_pencatatan,
  t.jenis,
  t.sumber,
  t.alasan_out,
  t.catatan,
  b.id    as bahan_baku_id,
  b.nama  as bahan_baku_nama,
  b.satuan,
  td.qty,
  td.saldo_sebelum,
  td.saldo_sesudah,
  p.full_name as created_by_name,
  t.id    as transaksi_id
from public.transaksi_detail td
join public.transaksi t   on t.id = td.transaksi_id and t.is_posted = true
join public.bahan_baku b  on b.id = td.bahan_baku_id
left join public.profiles p on p.id = t.created_by
order by t.tgl_transaksi, t.created_at, td.created_at;

-- ============================================================
-- FUNCTION: Get current stock for a bahan_baku
-- ============================================================

create or replace function public.get_saldo_bahan(p_bahan_baku_id uuid)
returns numeric as $$
  select
    b.stok_awal
    + coalesce(sum(case when t.jenis = 'IN'  then td.qty else 0 end), 0)
    - coalesce(sum(case when t.jenis = 'OUT' then td.qty else 0 end), 0)
  from public.bahan_baku b
  left join public.transaksi_detail td on td.bahan_baku_id = b.id
  left join public.transaksi t on t.id = td.transaksi_id and t.is_posted = true
  where b.id = p_bahan_baku_id
  group by b.stok_awal
$$ language sql stable;

-- ============================================================
-- FUNCTION: Check if menu has complete recipe
-- ============================================================

create or replace function public.menu_recipe_lengkap(p_menu_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.recipe r
    join public.bahan_baku b on b.id = r.bahan_baku_id
    where r.menu_id = p_menu_id
      and b.is_active = true
  );
$$ language sql stable;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles          enable row level security;
alter table public.bahan_baku        enable row level security;
alter table public.menu              enable row level security;
alter table public.recipe            enable row level security;
alter table public.transaksi         enable row level security;
alter table public.transaksi_detail  enable row level security;
alter table public.penjualan         enable row level security;
alter table public.penjualan_detail  enable row level security;

-- Helper function: get current user role
create or replace function public.get_my_role()
returns text as $$
  select role::text from public.profiles where id = auth.uid()
$$ language sql stable security definer;

-- Profiles: user can read own profile; admin can read all
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or public.get_my_role() = 'admin');

create policy "profiles_update" on public.profiles for update
  using (id = auth.uid() or public.get_my_role() = 'admin');

create policy "profiles_insert" on public.profiles for insert
  with check (true);

-- Bahan Baku: semua user bisa baca; hanya admin bisa CUD
create policy "bahan_baku_select" on public.bahan_baku for select to authenticated using (true);
create policy "bahan_baku_insert" on public.bahan_baku for insert to authenticated
  with check (public.get_my_role() = 'admin');
create policy "bahan_baku_update" on public.bahan_baku for update to authenticated
  using (public.get_my_role() = 'admin');
create policy "bahan_baku_delete" on public.bahan_baku for delete to authenticated
  using (public.get_my_role() = 'admin');

-- Menu: semua user bisa baca; hanya admin bisa CUD
create policy "menu_select" on public.menu for select to authenticated using (true);
create policy "menu_insert" on public.menu for insert to authenticated
  with check (public.get_my_role() = 'admin');
create policy "menu_update" on public.menu for update to authenticated
  using (public.get_my_role() = 'admin');
create policy "menu_delete" on public.menu for delete to authenticated
  using (public.get_my_role() = 'admin');

-- Recipe: semua user bisa baca; hanya admin bisa CUD
create policy "recipe_select" on public.recipe for select to authenticated using (true);
create policy "recipe_insert" on public.recipe for insert to authenticated
  with check (public.get_my_role() = 'admin');
create policy "recipe_update" on public.recipe for update to authenticated
  using (public.get_my_role() = 'admin');
create policy "recipe_delete" on public.recipe for delete to authenticated
  using (public.get_my_role() = 'admin');

-- Transaksi: semua authenticated user bisa baca dan insert; hanya admin bisa update/delete
create policy "transaksi_select" on public.transaksi for select to authenticated using (true);
create policy "transaksi_insert" on public.transaksi for insert to authenticated with check (true);
create policy "transaksi_update" on public.transaksi for update to authenticated
  using (public.get_my_role() = 'admin');
create policy "transaksi_delete" on public.transaksi for delete to authenticated
  using (public.get_my_role() = 'admin');

-- Transaksi Detail
create policy "transaksi_detail_select" on public.transaksi_detail for select to authenticated using (true);
create policy "transaksi_detail_insert" on public.transaksi_detail for insert to authenticated with check (true);
create policy "transaksi_detail_update" on public.transaksi_detail for update to authenticated
  using (public.get_my_role() = 'admin');
create policy "transaksi_detail_delete" on public.transaksi_detail for delete to authenticated
  using (public.get_my_role() = 'admin');

-- Penjualan
create policy "penjualan_select" on public.penjualan for select to authenticated using (true);
create policy "penjualan_insert" on public.penjualan for insert to authenticated with check (true);
create policy "penjualan_update" on public.penjualan for update to authenticated
  using (public.get_my_role() = 'admin');
create policy "penjualan_delete" on public.penjualan for delete to authenticated
  using (public.get_my_role() = 'admin');

-- Penjualan Detail
create policy "penjualan_detail_select" on public.penjualan_detail for select to authenticated using (true);
create policy "penjualan_detail_insert" on public.penjualan_detail for insert to authenticated with check (true);
create policy "penjualan_detail_update" on public.penjualan_detail for update to authenticated
  using (public.get_my_role() = 'admin');
create policy "penjualan_detail_delete" on public.penjualan_detail for delete to authenticated
  using (public.get_my_role() = 'admin');

-- ============================================================
-- TRIGGERS: auto updated_at
-- ============================================================

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger trg_bahan_baku_updated_at
  before update on public.bahan_baku
  for each row execute function public.handle_updated_at();

create trigger trg_menu_updated_at
  before update on public.menu
  for each row execute function public.handle_updated_at();

create trigger trg_recipe_updated_at
  before update on public.recipe
  for each row execute function public.handle_updated_at();

create trigger trg_transaksi_updated_at
  before update on public.transaksi
  for each row execute function public.handle_updated_at();

create trigger trg_penjualan_updated_at
  before update on public.penjualan
  for each row execute function public.handle_updated_at();

-- ============================================================
-- TRIGGER: auto-create profile after signup
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public
as $$
declare
  v_role user_role;
begin
  begin
    v_role := coalesce((new.raw_user_meta_data->>'role')::user_role, 'staff'::user_role);
  exception when others then
    v_role := 'staff'::user_role;
  end;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'Staff Bar'),
    v_role
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    updated_at = now();

  return new;
end;
$$ language plpgsql;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- GRANTS & PRIVILEGES
-- ============================================================

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant select on public.v_saldo_bahan_baku to authenticated, anon;
grant select on public.v_mutasi_dashboard to authenticated, anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated, anon;


-- ============================================================
-- INDEXES for performance
-- ============================================================

create index idx_transaksi_tgl           on public.transaksi(tgl_transaksi);
create index idx_transaksi_jenis         on public.transaksi(jenis);
create index idx_transaksi_sumber        on public.transaksi(sumber);
create index idx_transaksi_is_posted     on public.transaksi(is_posted);
create index idx_transaksi_detail_trx    on public.transaksi_detail(transaksi_id);
create index idx_transaksi_detail_bahan  on public.transaksi_detail(bahan_baku_id);
create index idx_recipe_menu             on public.recipe(menu_id);
create index idx_recipe_bahan            on public.recipe(bahan_baku_id);
create index idx_penjualan_detail_pen    on public.penjualan_detail(penjualan_id);
create index idx_penjualan_detail_menu   on public.penjualan_detail(menu_id);
