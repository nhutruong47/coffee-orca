-- V9: Attendance Evidence (GPS Geofence + Photo Proof), Attendance Settings, Corrections & Payroll Member Rates

ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_in_address VARCHAR(500);
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS location_accuracy_meters DOUBLE PRECISION;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS distance_meters INTEGER;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS location_verified BOOLEAN;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS location_status VARCHAR(50);
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS location_unavailable_reason VARCHAR(500);
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_in_photo_url TEXT;

ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_out_address VARCHAR(500);
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_out_latitude DOUBLE PRECISION;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_out_longitude DOUBLE PRECISION;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_out_location_accuracy_meters DOUBLE PRECISION;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_out_distance_meters INTEGER;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_out_location_verified BOOLEAN;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_out_location_status VARCHAR(50);
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_out_location_unavailable_reason VARCHAR(500);
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS check_out_photo_url TEXT;

ALTER TABLE attendances ADD COLUMN IF NOT EXISTS standard_hours DOUBLE PRECISION;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS hourly_rate_vnd DOUBLE PRECISION;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS overtime_multiplier DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS attendance_settings (
    id UUID PRIMARY KEY,
    team_id UUID NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
    work_start_time VARCHAR(20) DEFAULT '08:00',
    work_end_time VARCHAR(20) DEFAULT '17:00',
    standard_hours DOUBLE PRECISION DEFAULT 8.0,
    break_minutes INTEGER DEFAULT 60,
    hourly_rate_vnd DOUBLE PRECISION DEFAULT 50000.0,
    overtime_multiplier DOUBLE PRECISION DEFAULT 1.5,
    workshop_address VARCHAR(500),
    workshop_lat DOUBLE PRECISION,
    workshop_lng DOUBLE PRECISION,
    allowed_radius_meters INTEGER DEFAULT 200,
    require_location BOOLEAN DEFAULT FALSE,
    require_photo BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS attendance_corrections (
    id UUID PRIMARY KEY,
    attendance_id UUID NOT NULL REFERENCES attendances(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_check_in_time TIMESTAMP,
    old_check_out_time TIMESTAMP,
    new_check_in_time TIMESTAMP,
    new_check_out_time TIMESTAMP,
    reason VARCHAR(500) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attendance_corrections_attendance_id
    ON attendance_corrections(attendance_id);

CREATE TABLE IF NOT EXISTS payroll_member_rates (
    id UUID PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hourly_rate_vnd DOUBLE PRECISION NOT NULL CHECK (hourly_rate_vnd >= 1000 AND hourly_rate_vnd <= 10000000),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_payroll_member_rates_team_user UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_member_rates_team_id
    ON payroll_member_rates(team_id);
