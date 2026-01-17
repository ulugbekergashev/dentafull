-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Doctor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "status" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "telegramChatId" TEXT,
    "percentage" REAL NOT NULL DEFAULT 0,
    "clinicId" TEXT NOT NULL,
    CONSTRAINT "Doctor_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Doctor" ("clinicId", "email", "firstName", "id", "lastName", "password", "phone", "specialty", "status", "telegramChatId", "username") SELECT "clinicId", "email", "firstName", "id", "lastName", "password", "phone", "specialty", "status", "telegramChatId", "username" FROM "Doctor";
DROP TABLE "Doctor";
ALTER TABLE "new_Doctor" RENAME TO "Doctor";
CREATE UNIQUE INDEX "Doctor_username_key" ON "Doctor"("username");
CREATE UNIQUE INDEX "Doctor_clinicId_telegramChatId_key" ON "Doctor"("clinicId", "telegramChatId");
CREATE TABLE "new_Service" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "cost" REAL NOT NULL DEFAULT 0,
    "duration" INTEGER NOT NULL,
    "clinicId" TEXT NOT NULL,
    CONSTRAINT "Service_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Service" ("clinicId", "duration", "id", "name", "price") SELECT "clinicId", "duration", "id", "name", "price" FROM "Service";
DROP TABLE "Service";
ALTER TABLE "new_Service" RENAME TO "Service";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
