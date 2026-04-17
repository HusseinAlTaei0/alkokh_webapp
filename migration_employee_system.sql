-- =============================================
-- ALKOKH VET CLINIC — EMPLOYEE SYSTEM MIGRATION
-- Run this in Supabase SQL Editor after setup.sql
-- =============================================

-- 1. Add 'assigned' status to orders
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('waiting', 'assigned', 'in_progress', 'completed', 'cancelled'));

-- 2. Add PIN column to employees
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS pin TEXT;

-- Set random PINs for existing employees
UPDATE public.employees SET pin = '7294' WHERE id = 'e1'; -- عباس
UPDATE public.employees SET pin = '3851' WHERE id = 'e2'; -- أنور
UPDATE public.employees SET pin = '6037' WHERE id = 'e3'; -- سهيل
UPDATE public.employees SET pin = '4518' WHERE id = 'e4'; -- قاسم

-- 3. RPC: Employee login by PIN (SECURITY DEFINER bypasses RLS for anonymous access)
CREATE OR REPLACE FUNCTION public.employee_login(p_pin TEXT)
RETURNS TABLE(id TEXT, name_ar TEXT, name_en TEXT, specialization TEXT, avatar_color TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.name_ar, e.name_en, e.specialization, e.avatar_color 
  FROM public.employees e
  WHERE e.pin = p_pin AND e.is_active = true
  LIMIT 1;
$$;

-- 4. RPC: Get orders assigned to a specific employee
CREATE OR REPLACE FUNCTION public.get_employee_orders(p_employee_id TEXT)
RETURNS SETOF public.orders
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.orders 
  WHERE employee_id = p_employee_id 
  AND status IN ('assigned', 'in_progress')
  ORDER BY 
    CASE status WHEN 'assigned' THEN 0 WHEN 'in_progress' THEN 1 END,
    created_at ASC;
$$;

-- 5. RPC: Get completed orders for employee (today only)
CREATE OR REPLACE FUNCTION public.get_employee_completed(p_employee_id TEXT)
RETURNS SETOF public.orders
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.orders 
  WHERE employee_id = p_employee_id 
  AND status = 'completed'
  AND completed_at >= CURRENT_DATE
  ORDER BY completed_at DESC
  LIMIT 20;
$$;

-- 6. RPC: Employee accepts an assigned order (assigned → in_progress)
CREATE OR REPLACE FUNCTION public.accept_order(p_order_id UUID, p_employee_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders 
  SET status = 'in_progress', started_at = now()
  WHERE id = p_order_id 
  AND employee_id = p_employee_id 
  AND status = 'assigned';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not assigned to this employee';
  END IF;
END;
$$;

-- 7. RPC: Employee completes an order (in_progress → completed)
CREATE OR REPLACE FUNCTION public.complete_order_employee(p_order_id UUID, p_employee_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duration INTEGER;
BEGIN
  SELECT EXTRACT(EPOCH FROM (now() - started_at))::INTEGER / 60 
  INTO v_duration
  FROM public.orders 
  WHERE id = p_order_id;
  
  UPDATE public.orders 
  SET status = 'completed', completed_at = now(), duration_actual = v_duration
  WHERE id = p_order_id 
  AND employee_id = p_employee_id 
  AND status = 'in_progress';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not in progress for this employee';
  END IF;
  
  RETURN v_duration;
END;
$$;
