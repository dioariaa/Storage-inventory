-- ============================================================
-- SEED DATA - BERLARIS KOPI & RESTO (Divisi Bar MVP)
-- Supabase Migration: 002_seed_data
-- ============================================================

-- 1. Master Bahan Baku awal sesuai BRD
insert into public.bahan_baku (id, nama, satuan, stok_awal, minimum_stok, is_active)
values
  ('b1111111-1111-1111-1111-111111111111', 'House Blend Premio', 'Gram', 1000, 200, true),
  ('b2222222-2222-2222-2222-222222222222', 'Fresh Milk Diamond', 'Ml', 2000, 500, true),
  ('b3333333-3333-3333-3333-333333333333', 'Palm Sugar', 'Gram', 500, 100, true),
  ('b4444444-4444-4444-4444-444444444444', 'Mineral Water', 'Ml', 5000, 1000, true),
  ('b5555555-5555-5555-5555-555555555555', 'Es Batu', 'Gram', 5000, 1000, true)
on conflict (nama) do nothing;

-- 2. Master Menu awal sesuai BRD (Gunakan hex valid a-f, bukan huruf m)
insert into public.menu (id, nama, kategori, is_active)
values
  ('a1111111-1111-1111-1111-111111111111', 'Americano', 'Kopi', true),
  ('a2222222-2222-2222-2222-222222222222', 'Caffe Latte', 'Kopi', true)
on conflict (nama) do nothing;

-- 3. Recipe Komposisi Menu sesuai BRD
-- Americano 1 Porsi: House Blend Premio (9 gr), Mineral Water (150 ml), Es Batu (100 gr)
insert into public.recipe (menu_id, bahan_baku_id, qty)
values
  ('a1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 9),
  ('a1111111-1111-1111-1111-111111111111', 'b4444444-4444-4444-4444-444444444444', 150),
  ('a1111111-1111-1111-1111-111111111111', 'b5555555-5555-5555-5555-555555555555', 100)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;

-- Caffe Latte 1 Porsi: House Blend Premio (9 gr), Fresh Milk Diamond (100 ml), Palm Sugar (20 gr)
insert into public.recipe (menu_id, bahan_baku_id, qty)
values
  ('a2222222-2222-2222-2222-222222222222', 'b1111111-1111-1111-1111-111111111111', 9),
  ('a2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 100),
  ('a2222222-2222-2222-2222-222222222222', 'b3333333-3333-3333-3333-333333333333', 20)
on conflict (menu_id, bahan_baku_id) do update set qty = excluded.qty;
