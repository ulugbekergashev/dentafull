import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: 'postgresql://postgres:aleGfSHPFhpJTYnTMpPghOJGGHKIZmXi@switchyard.proxy.rlwy.net:56686/railway'
        }
    }
});

async function main() {
    console.log('Checking PRODUCTION data...');

    const clinics = await prisma.clinic.findMany({
        include: {
            _count: {
                select: {
                    patients: true,
                    doctors: true,
                    appointments: true
                }
            }
        }
    });
    console.log(`Total clinics found: ${clinics.length}`);

    clinics.forEach(c => {
        console.log(`- Clinic: ${c.name}`);
        console.log(`  ID: ${c.id}`);
        console.log(`  Admin Name: ${c.adminName}`);
        console.log(`  Username: ${c.username}`);
        console.log(`  Patients: ${c._count.patients}`);
        console.log(`  Doctors: ${c._count.doctors}`);
        console.log(`  Appointments: ${c._count.appointments}`);
        console.log(`  Status: ${c.status}`);
        console.log('---');
    });

    const plans = await prisma.subscriptionPlan.findMany();
    console.log('\nAvailable Plans:');
    plans.forEach(p => {
        console.log(`- Plan: ${p.name}, ID: ${p.id}`);
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
