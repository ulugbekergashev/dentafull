import { PrismaClient } from '@prisma/client';

// SOURCE: The database that HAS the data (found in check_prod_data.ts)
const sourceUrl = 'postgresql://postgres:aleGfSHPFhpJTYnTMpPghOJGGHKIZmXi@switchyard.proxy.rlwy.net:56686/railway';

// TARGET: The database that is currently empty/demo (the live one)
// We will try to get this from process.env.DATABASE_URL if run locally with .env
const targetUrl = process.env.TARGET_DATABASE_URL;

if (!targetUrl) {
    console.error('❌ Error: TARGET_DATABASE_URL environment variable is required.');
    console.log('Usage: TARGET_DATABASE_URL=your_live_db_url npx ts-node migrate_data.ts');
    process.exit(1);
}

const sourcePrisma = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
const targetPrisma = new PrismaClient({ datasources: { db: { url: targetUrl } } });

async function migrate() {
    console.log('🚀 Starting emergency data migration...');
    console.log(`Source: ${sourceUrl.substring(0, 30)}...`);
    console.log(`Target: ${targetUrl.substring(0, 30)}...`);

    try {
        // 1. Fetch all data from source
        console.log('📥 Fetching data from source...');
        const plans = await sourcePrisma.subscriptionPlan.findMany();
        const clinics = await sourcePrisma.clinic.findMany();
        const doctors = await sourcePrisma.doctor.findMany();
        const patients = await sourcePrisma.patient.findMany();
        const appointments = await sourcePrisma.appointment.findMany();
        const transactions = await sourcePrisma.transaction.findMany();
        const services = await sourcePrisma.service.findMany();
        const icd10 = await sourcePrisma.iCD10Code.findMany();
        const diagnoses = await sourcePrisma.patientDiagnosis.findMany();

        console.log(`Found: ${clinics.length} clinics, ${patients.length} patients, ${doctors.length} doctors.`);

        // 2. Clean target (Optional but safer for a clean restore)
        console.log('🧹 Cleaning target database...');
        await targetPrisma.patientDiagnosis.deleteMany({});
        await targetPrisma.iCD10Code.deleteMany({});
        await targetPrisma.service.deleteMany({});
        await targetPrisma.transaction.deleteMany({});
        await targetPrisma.appointment.deleteMany({});
        await targetPrisma.patient.deleteMany({});
        await targetPrisma.doctor.deleteMany({});
        await targetPrisma.clinic.deleteMany({});
        await targetPrisma.subscriptionPlan.deleteMany({});

        // 3. Push to target (Order matters for foreign keys)
        console.log('📤 Pushing data to target...');

        console.log('- Plans...');
        await targetPrisma.subscriptionPlan.createMany({ data: plans });

        console.log('- Clinics...');
        await targetPrisma.clinic.createMany({ data: clinics });

        console.log('- Doctors...');
        await targetPrisma.doctor.createMany({ data: doctors });

        console.log('- Patients...');
        await targetPrisma.patient.createMany({ data: patients });

        console.log('- Appointments...');
        await targetPrisma.appointment.createMany({ data: appointments });

        console.log('- Transactions...');
        await targetPrisma.transaction.createMany({ data: transactions });

        console.log('- Services...');
        await targetPrisma.service.createMany({ data: services });

        console.log('- ICD10...');
        await targetPrisma.iCD10Code.createMany({ data: icd10 });

        console.log('- Diagnoses...');
        await targetPrisma.patientDiagnosis.createMany({ data: diagnoses });

        console.log('✅ Migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await sourcePrisma.$disconnect();
        await targetPrisma.$disconnect();
    }
}

migrate();
