-- First, remove existing duplicates by keeping only the earliest record for each patient-date combo
WITH duplicate_appointments AS (
  SELECT id, 
         ROW_NUMBER() OVER (PARTITION BY "patientId", date ORDER BY "id") as rn
  FROM "Appointment"
)
DELETE FROM "Appointment"
WHERE id IN (
  SELECT id FROM duplicate_appointments WHERE rn > 1
);

-- Then add the unique constraint
CREATE UNIQUE INDEX "unique_patient_date" ON "Appointment"("patientId", "date");
