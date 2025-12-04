
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const patient = await prisma.patient.findFirst({
        where: { firstName: 'hi', lastName: 'hi' },
        include: { clinic: true }
    });

    if (patient) {
        console.log('Patient found:', patient.firstName, patient.lastName);
        console.log('Clinic ID:', patient.clinicId);
        console.log('Clinic Name:', patient.clinic.name);
        console.log('Clinic Bot Token:', patient.clinic.botToken);
    } else {
        console.log('Patient "hi hi" not found.');
        // List all patients to be sure
        const allPatients = await prisma.patient.findMany();
        console.log('All patients:', allPatients.map(p => `${p.firstName} ${p.lastName} (${p.clinicId})`));
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
