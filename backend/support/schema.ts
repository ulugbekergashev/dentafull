// Yordam boti va diagnostika jadvallari — server.ts dagi runStartupMigrations()
// shu ro'yxatni ketma-ket bajaradi. Faqat QO'SHADI (CREATE ... IF NOT EXISTS):
// mavjud jadval va ma'lumotga tegmaydi. prisma/schema.prisma dagi modellar
// bilan bir xil bo'lishi shart.

export interface MigrationSql {
    label: string;
    sql: string;
}

const TS = 'TIMESTAMP(3)';
const NOW = `${TS} NOT NULL DEFAULT CURRENT_TIMESTAMP`;

const index = (table: string, cols: string[]): MigrationSql => ({
    label: `${table} index (${cols.join(', ')})`,
    sql: `CREATE INDEX IF NOT EXISTS "${table}_${cols.join('_')}_idx" ON "${table}" (${cols.map(c => `"${c}"`).join(', ')})`,
});

export const SUPPORT_MIGRATIONS: MigrationSql[] = [
    {
        label: 'DiagEvent table',
        sql: `CREATE TABLE IF NOT EXISTS "DiagEvent" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "clinicId"  TEXT,
            "kind"      TEXT NOT NULL,
            "subject"   TEXT,
            "message"   TEXT NOT NULL,
            "meta"      TEXT,
            "count"     INTEGER NOT NULL DEFAULT 1,
            "createdAt" ${NOW},
            "lastAt"    ${NOW}
        )`,
    },
    index('DiagEvent', ['clinicId', 'kind', 'lastAt']),
    index('DiagEvent', ['kind', 'lastAt']),

    {
        label: 'SupportUser table',
        sql: `CREATE TABLE IF NOT EXISTS "SupportUser" (
            "chatId"      TEXT NOT NULL PRIMARY KEY,
            "tgName"      TEXT,
            "tgUsername"  TEXT,
            "phone"       TEXT,
            "lang"        TEXT NOT NULL DEFAULT 'uz',
            "script"      TEXT NOT NULL DEFAULT 'latin',
            "clinicId"    TEXT,
            "role"        TEXT,
            "staffId"     TEXT,
            "staffName"   TEXT,
            "verifiedVia" TEXT,
            "linkedAt"    ${TS},
            "blocked"     BOOLEAN NOT NULL DEFAULT false,
            "createdAt"   ${NOW},
            "updatedAt"   ${NOW}
        )`,
    },
    index('SupportUser', ['clinicId']),

    {
        label: 'SupportLink table',
        sql: `CREATE TABLE IF NOT EXISTS "SupportLink" (
            "code"      TEXT NOT NULL PRIMARY KEY,
            "clinicId"  TEXT,
            "role"      TEXT NOT NULL,
            "staffId"   TEXT,
            "staffName" TEXT,
            "expiresAt" ${TS} NOT NULL,
            "usedAt"    ${TS},
            "usedBy"    TEXT,
            "createdAt" ${NOW}
        )`,
    },

    {
        label: 'SupportTicket table',
        sql: `CREATE TABLE IF NOT EXISTS "SupportTicket" (
            "id"           TEXT NOT NULL PRIMARY KEY,
            "chatId"       TEXT NOT NULL,
            "clinicId"     TEXT,
            "category"     TEXT NOT NULL DEFAULT 'other',
            "status"       TEXT NOT NULL DEFAULT 'open',
            "subject"      TEXT,
            "summary"      TEXT,
            "resolvedBy"   TEXT,
            "rating"       INTEGER,
            "createdAt"    ${NOW},
            "updatedAt"    ${NOW},
            "firstReplyAt" ${TS},
            "closedAt"     ${TS}
        )`,
    },
    index('SupportTicket', ['chatId', 'status']),
    index('SupportTicket', ['clinicId', 'createdAt']),
    index('SupportTicket', ['status', 'updatedAt']),

    {
        label: 'SupportMessage table',
        sql: `CREATE TABLE IF NOT EXISTS "SupportMessage" (
            "id"          TEXT NOT NULL PRIMARY KEY,
            "ticketId"    TEXT,
            "chatId"      TEXT NOT NULL,
            "direction"   TEXT NOT NULL,
            "author"      TEXT NOT NULL,
            "kind"        TEXT NOT NULL DEFAULT 'text',
            "text"        TEXT,
            "fileId"      TEXT,
            "state"       TEXT NOT NULL DEFAULT 'done',
            "tgMessageId" INTEGER,
            "opMessageId" INTEGER,
            "meta"        TEXT,
            "createdAt"   ${NOW}
        )`,
    },
    index('SupportMessage', ['ticketId', 'createdAt']),
    index('SupportMessage', ['chatId', 'createdAt']),
    index('SupportMessage', ['direction', 'state']),
    index('SupportMessage', ['opMessageId']),

    {
        label: 'SupportArticle table',
        sql: `CREATE TABLE IF NOT EXISTS "SupportArticle" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "module"    TEXT NOT NULL,
            "roles"     TEXT NOT NULL DEFAULT '*',
            "titleUz"   TEXT NOT NULL,
            "titleRu"   TEXT NOT NULL,
            "bodyUz"    TEXT NOT NULL,
            "bodyRu"    TEXT NOT NULL,
            "keywords"  TEXT,
            "paths"     TEXT,
            "guideId"   TEXT,
            "source"    TEXT NOT NULL DEFAULT 'seed',
            "active"    BOOLEAN NOT NULL DEFAULT true,
            "uses"      INTEGER NOT NULL DEFAULT 0,
            "createdAt" ${NOW},
            "updatedAt" ${NOW}
        )`,
    },
    index('SupportArticle', ['module']),

    {
        label: 'SupportAction table',
        sql: `CREATE TABLE IF NOT EXISTS "SupportAction" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "ticketId"  TEXT,
            "chatId"    TEXT NOT NULL,
            "clinicId"  TEXT,
            "kind"      TEXT NOT NULL,
            "args"      TEXT NOT NULL,
            "status"    TEXT NOT NULL DEFAULT 'pending',
            "approver"  TEXT NOT NULL,
            "decidedBy" TEXT,
            "result"    TEXT,
            "createdAt" ${NOW},
            "decidedAt" ${TS}
        )`,
    },
    index('SupportAction', ['status', 'createdAt']),
    index('SupportAction', ['clinicId', 'kind', 'createdAt']),

    {
        label: 'SubscriptionPayment table',
        sql: `CREATE TABLE IF NOT EXISTS "SubscriptionPayment" (
            "id"            TEXT NOT NULL PRIMARY KEY,
            "clinicId"      TEXT NOT NULL,
            "kind"          TEXT NOT NULL DEFAULT 'payment',
            "months"        INTEGER NOT NULL DEFAULT 0,
            "days"          INTEGER NOT NULL DEFAULT 0,
            "amount"        DOUBLE PRECISION,
            "fromExpiry"    TEXT,
            "toExpiry"      TEXT NOT NULL,
            "receiptFileId" TEXT,
            "approvedBy"    TEXT,
            "note"          TEXT,
            "createdAt"     ${NOW}
        )`,
    },
    index('SubscriptionPayment', ['clinicId', 'createdAt']),
];
