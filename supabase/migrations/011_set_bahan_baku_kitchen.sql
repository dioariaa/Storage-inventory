-- 011_set_bahan_baku_kitchen.sql
-- Pindahkan bahan baku dari Cetak.xlsx ke divisi 'kitchen'
-- Idempotent: aman dijalankan berulang kali.
-- Cocokkan nama TANPA case-sensitive, dan abaikan suffix porsi
-- (contoh: "@150GR", "(10 TUSUK)", "100GR") supaya cocok baik ke
-- "BUNTUT SAPI @150GR" maupun "Buntut Sapi".

begin;

-- 1) Pastikan kolom division ada (aman kalau 010 belum dijalankan)
alter table public.bahan_baku
  add column if not exists division text not null default 'bar';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bahan_baku'::regclass and conname = 'bahan_baku_division_check'
  ) then
    alter table public.bahan_baku
      add constraint bahan_baku_division_check check (division in ('bar','kitchen'));
  end if;
end $$;

-- 2) Sumber daftar dari Cetak.xlsx (kolom "ITEM (PORSI)")
create temp table _src_kitchen (xlsx_nama text primary key) on commit drop;
insert into _src_kitchen (xlsx_nama) values
  ('BUNTUT SAPI @150GR'),
  ('NASGOR BUNTUT @30GR'),
  ('IGA SUIR KWETIAU @30GR'),
  ('IGA SAPI @150GR'),
  ('DAGING SAPI SOTO BETAWI @40GR'),
  ('SATE SAPI MARANGGI @200GR/(10 TSK)'),
  ('MOZARELLA FINGER'),
  ('SATE AYAM @200gr (10 TUSUK)'),
  ('DAGING KAMBING @50GR'),
  ('BEEF PATTY BURGER @50GR'),
  ('BEEF PATTY SLDER @20GR/PCS (3prs)'),
  ('BEEF BOLOGNAISE @80GR'),
  ('AYAM BERLARIS'),
  ('AYAM DADU @20GR'),
  ('AYAM DADA SLICE @100gr'),
  ('MIX SEAFOOD @30GR'),
  ('FISH'' N CHIPS @100GR'),
  ('MUSHROOM SOUP'),
  ('SINGKONG @200GR'),
  ('FRENCH FRIES @200GR'),
  ('FRENCH FRIES @100GR'),
  ('POTATO WADGES'),
  ('KOREAN SPICY WING @200GR'),
  ('KETUPAT'),
  ('ROTI TAWAR @1PACK (8PCS)'),
  ('ROTI BURGER'),
  ('ROTI SLIDER @1PACK (3PCS)'),
  ('ROTI BAGUETTE'),
  ('ROTI HOTDOG'),
  ('KUAH SOTO MIE'),
  ('RISOL SOTO'),
  ('MIE SOTO BOGOR'),
  ('FETTUCINI @130GR'),
  ('SPAGHETTI @130GR'),
  ('MACARONI ELBOW @130GR'),
  ('KWETIAW @130GR'),
  ('BIHUN @130GR'),
  ('MIE NYEMEK @100GR'),
  ('MIE GORENG @130GR'),
  ('KUAH SOTO @200ML'),
  ('SOSIS BRATWURSE (HANZEL) 5PCS/PACK'),
  ('TAHU SUTRA @10PCS/PACK'),
  ('JAMUR ENOKI@100GR (30GR/PORSI)'),
  ('PISANG TANDUK'),
  ('SPRINGROLL @5PCS/PORSI'),
  ('SMOKE BEEF @20GR)'),
  ('SAUCE CREAM 150ML'),
  ('KULIT CORN TORTILA'),
  ('AYAM SUIR @20GR'),
  ('PAHA DUNGDUNG'),
  ('TUNA CHUNK @30GR'),
  ('TEMPE MENDOAN @3PCS'),
  ('TAHU ISI @4PCS'),
  ('TAPE GORENG @150GR 4PCS'),
  ('IGA NASI GORENG'),
  ('RATATOUILLE'),
  ('JAGUNG CARNEL'),
  ('SAMBAL BAWANG'),
  ('BUMBU KACANG'),
  ('SAMBAL EMPAL'),
  ('SAMOSA'),
  ('DAGING SAPI TONGSENG'),
  ('DOUGH PIZZA'),
  ('SOSIS 40GR'),
  ('BEBEK'),
  ('BUMBU BEBEK'),
  ('SINGKONG 100GR'),
  ('MOZARELLA PIZZA'),
  ('TELUR AYAM'),
  ('RUMPI'),
  ('DAGING KAMBING UTUH'),
  ('SMOKED BEEF UTUH'),
  ('KULIT CORN TORTILA UTUH'),
  ('UDANG KUPAS'),
  ('KULIT SPRINGROLL'),
  ('KECOMBRANG');

-- 3) Kunci pencocokan: lowercase, buang "(...)", "@...", dan angka+satuan di akhir
create temp table _key_kitchen on commit drop as
select
  xlsx_nama,
  regexp_replace(
    regexp_replace(
      regexp_replace(lower(trim(xlsx_nama)), '\s*\([^)]*\)', '', 'g'),
      '\s*@.*$', '', 'g'),
    '\s+[0-9]+\s*[a-z]*\.?$', '') as k
from _src_kitchen;

-- 4) Update bahan_baku -> divisi kitchen
with norm as (
  select
    b.id,
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(trim(b.nama)), '\s*\([^)]*\)', '', 'g'),
        '\s*@.*$', '', 'g'),
      '\s+[0-9]+\s*[a-z]*\.?$', '') as k
  from public.bahan_baku b
)
update public.bahan_baku b
set division = 'kitchen',
    updated_at = now()
from norm n
join _key_kitchen s on s.k = n.k
where b.id = n.id;

-- 5) Laporan: mana yang ter-update, mana yang tidak ketemu di DB
select
  s.xlsx_nama,
  b.nama as db_nama,
  coalesce(b.division, '-') as divisi,
  case when b.id is null then 'TIDAK ADA DI DB' else 'ok' end as status
from _key_kitchen s
left join lateral (
  select b2.id, b2.nama, b2.division
  from public.bahan_baku b2
  where lower(b2.nama) = lower(s.xlsx_nama)
     or regexp_replace(
          regexp_replace(
            regexp_replace(lower(trim(b2.nama)), '\s*\([^)]*\)', '', 'g'),
            '\s*@.*$', '', 'g'),
          '\s+[0-9]+\s*[a-z]*\.?$', '') = s.k
  order by (lower(b2.nama) = lower(s.xlsx_nama)) desc nulls last
  limit 1
) b on true
order by status desc, s.xlsx_nama;

commit;
