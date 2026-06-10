-- Migration 026: Seed test admin accounts for each role
-- Accounts are for development / initial setup only.
-- Passwords are not used — login is OTP-based via phone number.

-- SUPERVISOR
INSERT INTO super_admins (full_name, email, phone_number, role, is_active)
VALUES (
  'Thean Supervisor',
  'supervisor@thean.in',
  '+919000000001',
  'SUPERVISOR',
  TRUE
)
ON CONFLICT (phone_number) DO NOTHING;

-- CHECKER
INSERT INTO super_admins (full_name, email, phone_number, role, is_active)
VALUES (
  'Thean Checker',
  'checker@thean.in',
  '+919000000002',
  'CHECKER',
  TRUE
)
ON CONFLICT (phone_number) DO NOTHING;

-- AUDITOR
INSERT INTO super_admins (full_name, email, phone_number, role, is_active)
VALUES (
  'Thean Auditor',
  'auditor@thean.in',
  '+919000000003',
  'AUDITOR',
  TRUE
)
ON CONFLICT (phone_number) DO NOTHING;

-- TEAM_LEAD
INSERT INTO super_admins (full_name, email, phone_number, role, is_active)
VALUES (
  'Thean Team Lead',
  'teamlead@thean.in',
  '+919000000004',
  'TEAM_LEAD',
  TRUE
)
ON CONFLICT (phone_number) DO NOTHING;
