// Payme jadvallari — server.ts dagi runStartupMigrations() ketma-ket bajaradi.
// Faqat QO'SHADI (CREATE ... IF NOT EXISTS). prisma/schema.prisma dagi
// PaymeOrder va PaymeTransaction modellari bilan bir xil bo'lishi shart.

import type { MigrationSql } from '../support/schema';

const NOW = 'TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP';

export const PAYME_MIGRATIONS: MigrationSql[] = [
    {
        label: 'PaymeOrder table',
        sql: `CREATE TABLE IF NOT EXISTS "PaymeOrder" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "clinicId"  TEXT NOT NULL,
            "months"    INTEGER NOT NULL,
            "amount"    DOUBLE PRECISION NOT NULL,
            "status"    TEXT NOT NULL DEFAULT 'new',
            "createdBy" TEXT,
            "createdAt" ${NOW},
            "paidAt"    TIMESTAMP(3)
        )`,
    },
    {
        label: 'PaymeOrder index (clinicId, createdAt)',
        sql: `CREATE INDEX IF NOT EXISTS "PaymeOrder_clinicId_createdAt_idx" ON "PaymeOrder" ("clinicId", "createdAt")`,
    },
    {
        label: 'PaymeTransaction table',
        sql: `CREATE TABLE IF NOT EXISTS "PaymeTransaction" (
            "id"          TEXT NOT NULL PRIMARY KEY,
            "paymeId"     TEXT NOT NULL,
            "orderId"     TEXT NOT NULL,
            "clinicId"    TEXT NOT NULL,
            "amount"      DOUBLE PRECISION NOT NULL,
            "state"       INTEGER NOT NULL,
            "reason"      INTEGER,
            "paymeTime"   DOUBLE PRECISION NOT NULL,
            "createTime"  DOUBLE PRECISION NOT NULL,
            "performTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
            "cancelTime"  DOUBLE PRECISION NOT NULL DEFAULT 0,
            "createdAt"   ${NOW}
        )`,
    },
    {
        label: 'PaymeTransaction unique (paymeId)',
        sql: `CREATE UNIQUE INDEX IF NOT EXISTS "PaymeTransaction_paymeId_key" ON "PaymeTransaction" ("paymeId")`,
    },
    {
        label: 'PaymeTransaction index (orderId)',
        sql: `CREATE INDEX IF NOT EXISTS "PaymeTransaction_orderId_idx" ON "PaymeTransaction" ("orderId")`,
    },
    {
        label: 'PaymeTransaction index (paymeTime)',
        sql: `CREATE INDEX IF NOT EXISTS "PaymeTransaction_paymeTime_idx" ON "PaymeTransaction" ("paymeTime")`,
    },
];
