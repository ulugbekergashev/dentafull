-- First, identify and delete duplicate transactions keeping only the first one
-- This deletes all but one of each duplicate group

DELETE t1 FROM Transaction t1
INNER JOIN (
    SELECT MIN(id) as keep_id, patientId, date, service, amount
    FROM Transaction
    WHERE patientId IS NOT NULL
    GROUP BY patientId, date, service, amount
    HAVING COUNT(*) > 1
) duplicates ON t1.patientId = duplicates.patientId 
    AND t1.date = duplicates.date 
    AND t1.service = duplicates.service 
    AND t1.amount = duplicates.amount
    AND t1.id != duplicates.keep_id;
