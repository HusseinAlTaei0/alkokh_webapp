-- ============================================
-- Medical Clinic Expansion Schema
-- Adds 9 tables for doctor management, patient files, visits, and AI reports
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. DOCTORS TABLE
-- ============================================
CREATE TABLE doctors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  specialization TEXT,
  avatar_color TEXT DEFAULT '#7c3aed',
  is_admin BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  phone TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_doctors_auth_user ON doctors(auth_user_id);
CREATE INDEX idx_doctors_active ON doctors(is_active);

-- ============================================
-- 2. PATIENTS TABLE (permanent animal file)
-- ============================================
CREATE TABLE patients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  name TEXT,
  animal_type TEXT NOT NULL,
  breed TEXT,
  age_months INT,
  gender TEXT,
  weight_kg NUMERIC,
  neutered BOOLEAN,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_patients_customer ON patients(customer_id);
CREATE INDEX idx_patients_animal_type ON patients(animal_type);

-- ============================================
-- 3. VISITS TABLE (each doctor visit)
-- ============================================
CREATE TABLE visits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  primary_doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting','in_progress','completed','cancelled')),

  -- Intake form fields
  intake_customer_name TEXT NOT NULL,
  intake_phone TEXT NOT NULL,
  intake_area TEXT,
  intake_animal_type TEXT NOT NULL,
  intake_animal_age TEXT,
  intake_notes TEXT,

  -- Examination fields
  vital_temperature NUMERIC,
  vital_weight_kg NUMERIC,
  vital_heart_rate INT,
  diagnosis TEXT,
  treatment TEXT,
  prescription TEXT,
  lab_results TEXT,
  severity TEXT CHECK (severity IN ('low','medium','high','critical')),

  -- Timestamps
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_visits_status ON visits(status, created_at DESC);
CREATE INDEX idx_visits_patient ON visits(patient_id, created_at DESC);
CREATE INDEX idx_visits_doctor ON visits(primary_doctor_id, created_at DESC);
CREATE INDEX idx_visits_customer ON visits(customer_id);

-- ============================================
-- 4. VISIT_SYMPTOMS TABLE (many-to-many)
-- ============================================
CREATE TABLE visit_symptoms (
  visit_id UUID REFERENCES visits(id) ON DELETE CASCADE,
  symptom_key TEXT NOT NULL,
  PRIMARY KEY (visit_id, symptom_key)
);

CREATE INDEX idx_visit_symptoms_visit ON visit_symptoms(visit_id);

-- ============================================
-- 5. VISIT_NOTES TABLE (time-series notes)
-- ============================================
CREATE TABLE visit_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID REFERENCES visits(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_visit_notes_visit ON visit_notes(visit_id, created_at DESC);
CREATE INDEX idx_visit_notes_doctor ON visit_notes(doctor_id);

-- ============================================
-- 6. VISIT_APPOINTMENTS TABLE (follow-up scheduling)
-- ============================================
CREATE TABLE visit_appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID REFERENCES visits(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','reminded','attended','missed','cancelled')),
  reminder_sent_at TIMESTAMPTZ,
  attended_at TIMESTAMPTZ,
  missed_followup_sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES doctors(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_appointments_scheduled ON visit_appointments(scheduled_at)
  WHERE status IN ('pending','reminded');
CREATE INDEX idx_appointments_visit ON visit_appointments(visit_id);
CREATE INDEX idx_appointments_patient ON visit_appointments(patient_id);

-- ============================================
-- 7. VISIT_COLLABORATORS TABLE (assisting doctor)
-- ============================================
CREATE TABLE visit_collaborators (
  visit_id UUID REFERENCES visits(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES doctors(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES doctors(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (visit_id, doctor_id)
);

CREATE INDEX idx_collaborators_doctor ON visit_collaborators(doctor_id);

-- ============================================
-- 8. CHAT_MESSAGES TABLE (team chat - Realtime)
-- ============================================
CREATE TABLE chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_channel ON chat_messages(channel, created_at DESC);
CREATE INDEX idx_chat_sender ON chat_messages(sender_id);

-- ============================================
-- 9. AI_REPORTS TABLE
-- ============================================
CREATE TABLE ai_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_type TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  content_md TEXT NOT NULL,
  stats_json JSONB,
  generated_by UUID REFERENCES doctors(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_reports_type ON ai_reports(report_type, created_at DESC);
CREATE INDEX idx_ai_reports_period ON ai_reports(period_start, period_end);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION is_doctor()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM doctors
    WHERE auth_user_id = auth.uid() AND is_active
  );
$$;

CREATE OR REPLACE FUNCTION is_clinic_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM doctors
    WHERE auth_user_id = auth.uid() AND is_admin AND is_active
  );
$$;

-- ============================================
-- ROW-LEVEL SECURITY (RLS)
-- ============================================

-- DOCTORS: Authenticated doctors can read all doctors; only admins can update
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doctors_read_authenticated" ON doctors
  FOR SELECT
  USING (is_doctor());

CREATE POLICY "doctors_update_admin" ON doctors
  FOR UPDATE
  USING (is_clinic_admin());

-- PATIENTS: Authenticated doctors can CRUD
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patients_crud_doctor" ON patients
  FOR ALL
  USING (is_doctor());

-- VISITS: Authenticated doctors can CRUD; anon can INSERT (public intake)
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visits_anon_insert_intake" ON visits
  FOR INSERT
  WITH CHECK (auth.role() = 'anon');

CREATE POLICY "visits_doctor_crud" ON visits
  FOR ALL
  USING (is_doctor());

-- VISIT_SYMPTOMS: Authenticated doctors can CRUD
ALTER TABLE visit_symptoms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visit_symptoms_doctor_crud" ON visit_symptoms
  FOR ALL
  USING (is_doctor());

-- VISIT_NOTES: Authenticated doctors can CRUD
ALTER TABLE visit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visit_notes_doctor_crud" ON visit_notes
  FOR ALL
  USING (is_doctor());

-- VISIT_APPOINTMENTS: Authenticated doctors can CRUD
ALTER TABLE visit_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visit_appointments_doctor_crud" ON visit_appointments
  FOR ALL
  USING (is_doctor());

-- VISIT_COLLABORATORS: Authenticated doctors can CRUD
ALTER TABLE visit_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visit_collaborators_doctor_crud" ON visit_collaborators
  FOR ALL
  USING (is_doctor());

-- CHAT_MESSAGES: Authenticated doctors can SELECT/INSERT
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_messages_doctor_read" ON chat_messages
  FOR SELECT
  USING (is_doctor());

CREATE POLICY "chat_messages_doctor_insert" ON chat_messages
  FOR INSERT
  WITH CHECK (is_doctor() AND sender_id = auth.uid());

-- AI_REPORTS: Authenticated doctors can SELECT; Edge Function (service_role) can INSERT
ALTER TABLE ai_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_reports_doctor_read" ON ai_reports
  FOR SELECT
  USING (is_doctor());

CREATE POLICY "ai_reports_service_insert" ON ai_reports
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- REALTIME PUBLICATION
-- ============================================

-- Enable Realtime for team collaboration
ALTER PUBLICATION supabase_realtime ADD TABLE visits;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE visit_notes;

-- ============================================
-- TIMESTAMP UPDATES
-- ============================================

CREATE OR REPLACE FUNCTION update_patient_timestamp()
RETURNS TRIGGER
LANGUAGE PLPGSQL AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER patients_updated_at
BEFORE UPDATE ON patients
FOR EACH ROW
EXECUTE FUNCTION update_patient_timestamp();
