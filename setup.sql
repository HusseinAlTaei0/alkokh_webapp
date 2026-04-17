-- =============================================
-- ALKOKH VET CLINIC — DATABASE SETUP
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- =============================================

-- =============================================
-- 1. TABLES
-- =============================================

-- Services table
CREATE TABLE IF NOT EXISTS public.services (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('cat_grooming', 'dog_grooming', 'bath')),
  type_ar TEXT NOT NULL,
  type_en TEXT NOT NULL,
  icon TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Employees table
CREATE TABLE IF NOT EXISTS public.employees (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  specialization TEXT NOT NULL CHECK (specialization IN ('groomer', 'bather')),
  avatar_color TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Orders (Work Orders) table
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  pet_name TEXT NOT NULL,
  pet_type TEXT NOT NULL CHECK (pet_type IN ('cat', 'dog')),
  service_id TEXT REFERENCES public.services(id),
  employee_id TEXT REFERENCES public.employees(id),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  assigned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_actual INTEGER
);

-- Customers history table (tracks returning customers)
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  total_visits INTEGER DEFAULT 1,
  last_visit TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 2. INDEXES (for performance)
-- =============================================
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_name ON public.orders(customer_name);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);

-- =============================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- SERVICES: Anyone can read, only authenticated (admin) can modify
CREATE POLICY "services_select_public" ON public.services
  FOR SELECT USING (true);

CREATE POLICY "services_all_admin" ON public.services
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- EMPLOYEES: Anyone can read, only authenticated (admin) can modify
CREATE POLICY "employees_select_public" ON public.employees
  FOR SELECT USING (true);

CREATE POLICY "employees_all_admin" ON public.employees
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ORDERS: Anyone can insert (booking), only authenticated (admin) can read/update/delete
CREATE POLICY "orders_insert_public" ON public.orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "orders_select_admin" ON public.orders
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "orders_update_admin" ON public.orders
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "orders_delete_admin" ON public.orders
  FOR DELETE USING (auth.role() = 'authenticated');

-- CUSTOMERS: Only authenticated (admin) can manage
CREATE POLICY "customers_all_admin" ON public.customers
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- =============================================
-- 4. RPC FUNCTION: Get waiting count (bypasses RLS for anonymous booking confirmation)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_waiting_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM public.orders WHERE status = 'waiting';
$$;

-- =============================================
-- 5. RPC FUNCTION: Upsert customer (called after booking)
-- =============================================
CREATE OR REPLACE FUNCTION public.upsert_customer(p_name TEXT, p_phone TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.customers (name, phone, total_visits, last_visit, updated_at)
  VALUES (p_name, p_phone, 1, now(), now())
  ON CONFLICT ON CONSTRAINT customers_name_phone_unique
  DO UPDATE SET
    total_visits = public.customers.total_visits + 1,
    last_visit = now(),
    updated_at = now(),
    phone = COALESCE(EXCLUDED.phone, public.customers.phone);
END;
$$;

-- Add unique constraint for customer upsert
ALTER TABLE public.customers
  ADD CONSTRAINT customers_name_phone_unique UNIQUE (name, phone);

-- =============================================
-- 6. SEED DATA
-- =============================================

-- Seed Services
INSERT INTO public.services (id, category, type_ar, type_en, icon, duration_minutes) VALUES
  ('s1', 'cat_grooming', 'نمرة خفيفة', 'Light Grade', 'assets/alkokh_icons/haircut.png', 30),
  ('s2', 'cat_grooming', 'شورت هير', 'Short Hair', 'assets/alkokh_icons/haircut.png', 25),
  ('s3', 'dog_grooming', 'نمرة 1', 'Grade 1', 'assets/alkokh_icons/haircut.png', 40),
  ('s4', 'dog_grooming', 'شورت هير', 'Short Hair', 'assets/alkokh_icons/haircut.png', 35),
  ('s5', 'dog_grooming', 'قصة مميزة', 'Special Cut', 'assets/alkokh_icons/special_haircut.png', 50),
  ('s6', 'bath', 'تحميم اعتيادي', 'Regular Bath', 'assets/alkokh_icons/bath.png', 20),
  ('s7', 'bath', 'تحميم طبي', 'Medical Bath', 'assets/alkokh_icons/medical_bath.png', 30)
ON CONFLICT (id) DO NOTHING;

-- Seed Employees
INSERT INTO public.employees (id, name_ar, name_en, specialization, avatar_color) VALUES
  ('e1', 'عباس', 'Abbas', 'bather', '#3B82F6'),
  ('e2', 'أنور', 'Anwar', 'bather', '#10B981'),
  ('e3', 'سهيل', 'Suheil', 'groomer', '#F59E0B'),
  ('e4', 'قاسم', 'Qasim', 'groomer', '#EF4444')
ON CONFLICT (id) DO NOTHING;
