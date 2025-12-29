import express from 'express';
import cron from 'node-cron';
import { botManager } from './botManager';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dj2qs9kgk',
    api_key: process.env.CLOUDINARY_API_KEY || '628899167499441',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'RiLepq8hhEn2QlX0DqkeAmbNl0c'
});

// Configure Multer with Cloudinary Storage
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        return {
            folder: 'patient-photos',
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
            public_id: `${Date.now()}-${Math.round(Math.random() * 1E9)}`
        };
    }
});

const upload = multer({ storage: storage });

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_denta_crm_2024';

// CORS configuration
app.use(cors({
    origin: [
        'http://localhost:3000',
        'https://dentafull.vercel.app',
        'https://dentafull-production.up.railway.app'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// --- Middleware ---
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    console.log('🔐 Auth check:', {
        hasAuthHeader: !!authHeader,
        tokenPreview: token?.substring(0, 20) + '...',
        path: req.path
    });

    if (!token) {
        console.log('❌ No token provided');
        return res.status(401).json({ error: 'Token topilmadi (Unauthorized)' });
    }

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) {
            console.log('❌ Token verification failed:', err.message);
            return res.status(403).json({ error: 'Token yaroqsiz (Forbidden)' });
        }
        console.log('✅ Token verified for user:', user);
        (req as any).user = user;
        next();
    });
};

// --- Authentication ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Login va parol kiritilishi shart' });
        }

        const cleanUsername = String(username).trim();
        const cleanPassword = String(password).trim();

        let userPayload = null;
        let responseData = null;

        // Check for super admin
        if (cleanUsername === 'superadminulugbek' && cleanPassword === 'superadminpassword') {
            userPayload = { role: 'SUPER_ADMIN', name: 'Ulugbek (Super Admin)' };
            responseData = {
                success: true,
                role: 'SUPER_ADMIN',
                name: 'Ulugbek (Super Admin)'
            };
        } else {
            // Check for clinic admin in database
            const clinic = await prisma.clinic.findUnique({
                where: { username: cleanUsername },
                include: { plan: true }
            });

            if (clinic && clinic.password === cleanPassword) {
                if (clinic.status !== 'Active') {
                    return res.status(403).json({
                        success: false,
                        error: 'Klinika bloklangan yoki kutilmoqda'
                    });
                }
                userPayload = { role: 'CLINIC_ADMIN', name: clinic.adminName, clinicId: clinic.id };
                responseData = {
                    success: true,
                    role: 'CLINIC_ADMIN',
                    name: clinic.adminName,
                    clinicId: clinic.id,
                    clinicName: clinic.name,
                    botUsername: clinic.botToken ? (await botManager.getBotUsername(clinic.id)) : null
                };
            } else {
                // Check for doctor
                const doctor = await prisma.doctor.findUnique({
                    where: { username: cleanUsername },
                    include: { clinic: true }
                });

                if (doctor && doctor.password === cleanPassword) {
                    if (doctor.status !== 'Active') {
                        return res.status(403).json({ success: false, error: 'Shifokor bloklangan' });
                    }
                    userPayload = { role: 'DOCTOR', name: `${doctor.firstName} ${doctor.lastName}`, clinicId: doctor.clinicId, doctorId: doctor.id };
                    responseData = {
                        success: true,
                        role: 'DOCTOR',
                        name: `${doctor.firstName} ${doctor.lastName}`,
                        clinicId: doctor.clinicId,
                        doctorId: doctor.id
                    };
                }
            }
        }

        if (userPayload && responseData) {
            const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '24h' });
            return res.json({ ...responseData, token });
        }

        // Invalid credentials
        return res.status(401).json({
            success: false,
            error: 'Login yoki parol noto\'g\'ri'
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Tizimga kirishda xatolik yuz berdi'
        });
    }
});

// --- Patients ---
app.get('/api/patients', authenticateToken, async (req, res) => {
    try {
        const { clinicId } = req.query;
        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }

        const patients = await prisma.patient.findMany({
            where: { clinicId: clinicId as string },
            orderBy: { lastVisit: 'desc' }
        });
        res.json(patients);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch patients' });
    }
});

app.post('/api/patients', authenticateToken, async (req, res) => {
    try {
        const patient = await prisma.patient.create({
            data: req.body
        });
        res.json(patient);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create patient' });
    }
});

app.put('/api/patients/:id', authenticateToken, async (req, res) => {
    try {
        const patient = await prisma.patient.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(patient);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update patient' });
    }
});

app.delete('/api/patients/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.patient.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete patient' });
    }
});

// --- Appointments ---
app.get('/api/appointments', authenticateToken, async (req, res) => {
    try {
        const { clinicId } = req.query;
        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }

        const appointments = await prisma.appointment.findMany({
            where: { clinicId: clinicId as string },
            orderBy: { date: 'asc' }
        });
        res.json(appointments);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
});

app.post('/api/appointments', authenticateToken, async (req, res) => {
    try {
        const appointment = await prisma.appointment.create({
            data: req.body
        });
        res.json(appointment);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create appointment' });
    }
});

app.put('/api/appointments/:id', authenticateToken, async (req, res) => {
    try {
        const appointment = await prisma.appointment.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(appointment);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update appointment' });
    }
});

app.delete('/api/appointments/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.appointment.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete appointment' });
    }
});

// Manual Appointment Reminder
app.post('/api/appointments/:id/remind', authenticateToken, async (req, res) => {
    try {
        const appointment = await prisma.appointment.findUnique({
            where: { id: req.params.id },
            include: { patient: { include: { clinic: true } }, doctor: true }
        });

        if (!appointment || !appointment.patient) {
            return res.status(404).json({ error: 'Appointment or patient not found' });
        }

        // Check if bot is configured for this clinic
        if (!appointment.patient.clinic.botToken) {
            return res.status(400).json({ error: 'Bot not configured' });
        }

        if (!appointment.patient.telegramChatId) {
            return res.status(400).json({ error: 'Patient telegram not linked' });
        }

        const date = new Date(appointment.date).toLocaleDateString('uz-UZ');
        const time = appointment.time;
        const doctorName = appointment.doctor ? `${appointment.doctor.firstName} ${appointment.doctor.lastName}` : 'Shifokor';

        const message = `🔔 Eslatma!\n\nHurmatli ${appointment.patient.firstName},\nSizning ${date} kuni soat ${time} da ${doctorName} qabuliga yozilganingizni eslatamiz.\n\nIltimos, kechikmasdan keling!`;

        await botManager.notifyClinicUser(appointment.clinicId, appointment.patient.telegramChatId, message);

        res.json({ success: true });
    } catch (error) {
        console.error('Reminder error:', error);
        res.status(500).json({ error: 'Failed to send reminder' });
    }
});

// Manual Debt Reminder
app.post('/api/patients/:id/remind-debt', authenticateToken, async (req, res) => {
    try {
        const { amount } = req.body;
        const patient = await prisma.patient.findUnique({
            where: { id: req.params.id },
            include: { clinic: true }
        });

        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        // Check if bot is configured for this clinic
        if (!patient.clinic.botToken) {
            return res.status(400).json({ error: 'Bot not configured' });
        }

        if (!patient.telegramChatId) {
            return res.status(400).json({ error: 'Patient telegram not linked' });
        }

        const debtMessage = amount
            ? `sizning ${amount.toLocaleString()} so'm qarzdorligingiz mavjud.`
            : `sizning qarzdorligingiz mavjud.`;

        const message = `💰 To'lov eslatmasi!\n\nHurmatli ${patient.firstName}, ${debtMessage}\n\nIltimos, to'lovni amalga oshiring.`;

        await botManager.notifyClinicUser(patient.clinicId, patient.telegramChatId, message);

        res.json({ success: true });
    } catch (error) {
        console.error('Debt reminder error:', error);
        res.status(500).json({ error: 'Failed to send debt reminder' });
    }
});

// Manual Custom Message
app.post('/api/patients/:id/send-message', authenticateToken, async (req, res) => {
    try {
        const { message } = req.body;
        const patient = await prisma.patient.findUnique({
            where: { id: req.params.id },
            include: { clinic: true }
        });

        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        // Check if bot is configured for this clinic
        if (!patient.clinic.botToken) {
            return res.status(400).json({ error: 'Bot not configured' });
        }

        if (!patient.telegramChatId) {
            return res.status(400).json({ error: 'Patient telegram not linked' });
        }

        if (!message) {
            return res.status(400).json({ error: 'Message content is required' });
        }

        await botManager.notifyClinicUser(patient.clinicId, patient.telegramChatId, message);

        res.json({ success: true });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// --- Transactions ---
app.get('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const { clinicId } = req.query;
        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }

        const transactions = await prisma.transaction.findMany({
            where: { clinicId: clinicId as string },
            orderBy: { date: 'desc' }
        });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

app.post('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const transaction = await prisma.transaction.create({
            data: req.body
        });
        res.json(transaction);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create transaction' });
    }
});

app.put('/api/transactions/:id', authenticateToken, async (req, res) => {
    try {
        console.log('Updating transaction:', req.params.id, req.body);
        const transaction = await prisma.transaction.update({
            where: { id: req.params.id },
            data: req.body
        });
        console.log('Transaction updated successfully:', transaction);
        res.json(transaction);
    } catch (error) {
        console.error('Transaction update error:', error);
        res.status(500).json({ error: 'Failed to update transaction' });
    }
});

// --- Doctors ---
app.get('/api/doctors', authenticateToken, async (req, res) => {
    try {
        const { clinicId } = req.query;
        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }

        const doctors = await prisma.doctor.findMany({
            where: { clinicId: clinicId as string }
        });
        res.json(doctors);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch doctors' });
    }
});

app.post('/api/doctors', authenticateToken, async (req, res) => {
    try {
        const { firstName, lastName, specialty, phone, email, status, clinicId, username, password } = req.body;

        // Check subscription limit
        const clinic = await prisma.clinic.findUnique({
            where: { id: clinicId },
            include: { plan: true }
        });

        if (!clinic) {
            return res.status(404).json({ error: 'Klinika topilmadi' });
        }

        const currentDoctorCount = await prisma.doctor.count({
            where: { clinicId }
        });

        if (currentDoctorCount >= clinic.plan.maxDoctors) {
            return res.status(403).json({
                error: `Sizning "${clinic.plan.name}" tarifingizda maksimal ${clinic.plan.maxDoctors} ta shifokor qo'shish mumkin. Limitga yetdingiz. Tarifni o'zgartirish uchun biz bilan bog'laning.`
            });
        }

        if (username) {
            const existing = await prisma.doctor.findUnique({ where: { username } });
            if (existing) {
                return res.status(400).json({ error: 'Bu login (username) allaqachon band.' });
            }
        }

        const data: any = {
            firstName, lastName, specialty, phone, status, clinicId, username, password
        };
        if (email) data.email = email;

        const newDoctor = await prisma.doctor.create({ data });
        res.json(newDoctor);
    } catch (error: any) {
        console.error('Doctor creation error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Bu login (username) allaqachon band.' });
        }
        res.status(500).json({ error: error.message || 'Failed to create doctor' });
    }
});

app.put('/api/doctors/:id', authenticateToken, async (req, res) => {
    try {
        const { username } = req.body;
        if (username) {
            const existing = await prisma.doctor.findUnique({ where: { username } });
            if (existing && existing.id !== req.params.id) {
                return res.status(400).json({ error: 'Bu login (username) allaqachon band.' });
            }
        }
        const doctor = await prisma.doctor.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(doctor);
    } catch (error: any) {
        console.error('Doctor update error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Bu login (username) allaqachon band.' });
        }
        res.status(500).json({ error: error.message || 'Failed to update doctor' });
    }
});

app.delete('/api/doctors/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.doctor.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error: any) {
        console.error('Doctor delete error:', error);
        res.status(500).json({ error: error.message || 'Failed to delete doctor' });
    }
});

// --- Services ---
app.get('/api/services', authenticateToken, async (req, res) => {
    try {
        const { clinicId } = req.query;
        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId is required' });
        }

        const services = await prisma.service.findMany({
            where: { clinicId: clinicId as string }
        });
        res.json(services);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch services' });
    }
});

app.post('/api/services', authenticateToken, async (req, res) => {
    try {
        const service = await prisma.service.create({
            data: req.body
        });
        res.json(service);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create service' });
    }
});

app.put('/api/services/:id', authenticateToken, async (req, res) => {
    try {
        const service = await prisma.service.update({
            where: { id: parseInt(req.params.id) },
            data: req.body
        });
        res.json(service);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update service' });
    }
});

// --- Super Admin: Clinics & Plans ---
app.get('/api/clinics', authenticateToken, async (req, res) => {
    try {
        const clinics = await prisma.clinic.findMany({
            include: { plan: true }
        });
        res.json(clinics);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch clinics' });
    }
});

app.post('/api/clinics', authenticateToken, async (req, res) => {
    try {
        const { name, adminName, username, password, phone, planId, status, subscriptionStartDate, expiryDate, monthlyRevenue } = req.body;

        const clinic = await prisma.clinic.create({
            data: {
                name,
                adminName,
                username: username.trim(),
                password: password.trim(),
                phone,
                planId,
                status,
                subscriptionStartDate,
                expiryDate,
                monthlyRevenue
            }
        });
        res.json(clinic);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create clinic' });
    }
});

app.put('/api/clinics/:id', authenticateToken, async (req, res) => {
    try {
        const clinic = await prisma.clinic.update({
            where: { id: req.params.id },
            data: req.body
        });
        res.json(clinic);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update clinic' });
    }
});

app.delete('/api/clinics/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.clinic.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error: any) {
        console.error('Clinic delete error:', error);
        res.status(500).json({ error: error.message || 'Failed to delete clinic' });
    }
});

app.get('/api/plans', authenticateToken, async (req, res) => {
    try {
        const plans = await prisma.subscriptionPlan.findMany();
        const parsedPlans = plans.map(p => ({
            ...p,
            features: JSON.parse(p.features)
        }));
        res.json(parsedPlans);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch plans' });
    }
});

app.put('/api/plans/:id', authenticateToken, async (req, res) => {
    try {
        const data = { ...req.body };
        if (data.features) {
            data.features = JSON.stringify(data.features);
        }
        const plan = await prisma.subscriptionPlan.update({
            where: { id: req.params.id },
            data: data
        });
        res.json({ ...plan, features: JSON.parse(plan.features) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update plan' });
    }
});

// --- Bot Settings ---
app.put('/api/clinics/:id/settings', authenticateToken, async (req, res) => {
    try {
        const { botToken } = req.body;
        const clinicId = req.params.id;

        // Update clinic with new bot token
        const clinic = await prisma.clinic.update({
            where: { id: clinicId },
            data: { botToken: botToken || null }
        });

        // Restart bot if token is provided, otherwise remove it
        if (botToken) {
            botManager.startBot(clinicId, botToken);
        } else {
            botManager.removeBot(clinicId);
        }

        res.json({ success: true, clinic });
    } catch (error: any) {
        console.error('Bot settings update error:', error);
        res.status(500).json({ error: error.message || 'Failed to update bot settings' });
    }
});

// Get bot username for clinic (public endpoint - no auth needed)
app.get('/api/clinics/:id/bot-username', async (req, res) => {
    try {
        const clinicId = req.params.id;
        console.log(`Requesting bot username for clinic: ${clinicId}`);
        const username = await botManager.getBotUsername(clinicId);
        console.log(`Found username: ${username}`);
        res.json({ botUsername: username });
    } catch (error: any) {
        console.error('Get bot username error:', error);
        res.status(500).json({ error: error.message || 'Failed to get bot username' });
    }
});

// --- ICD-10 & Diagnoses ---
app.get('/api/icd10', authenticateToken, async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.json([]);
        }

        const codes = await prisma.iCD10Code.findMany({
            where: {
                OR: [
                    { code: { contains: query as string } },
                    { name: { contains: query as string } },
                    { category: { contains: query as string } }
                ]
            },
            take: 50
        });
        res.json(codes);
    } catch (error) {
        console.error('ICD-10 search error:', error);
        res.status(500).json({ error: 'Failed to search ICD-10 codes' });
    }
});

app.post('/api/diagnoses', authenticateToken, async (req, res) => {
    try {
        const { patientId, code, date, notes, status, clinicId } = req.body;

        const diagnosis = await prisma.patientDiagnosis.create({
            data: {
                patientId,
                code,
                date,
                notes,
                status,
                clinicId
            },
            include: { icd10: true }
        });
        res.json(diagnosis);
    } catch (error) {
        console.error('Create diagnosis error:', error);
        res.status(500).json({ error: 'Failed to create diagnosis' });
    }
});

app.get('/api/diagnoses', authenticateToken, async (req, res) => {
    try {
        const { patientId } = req.query;
        if (!patientId) {
            return res.status(400).json({ error: 'patientId is required' });
        }

        const diagnoses = await prisma.patientDiagnosis.findMany({
            where: { patientId: patientId as string },
            include: { icd10: true },
            orderBy: { date: 'desc' }
        });
        res.json(diagnoses);
    } catch (error) {
        console.error('Get diagnoses error:', error);
        res.status(500).json({ error: 'Failed to fetch diagnoses' });
    }
});

app.delete('/api/diagnoses/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.patientDiagnosis.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete diagnosis error:', error);
        res.status(500).json({ error: 'Failed to delete diagnosis' });
    }
});

// --- Patient Photos ---
app.post('/api/patients/:id/photos', authenticateToken, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { description, category } = req.body;
        const patientId = req.params.id;

        const photo = await prisma.patientPhoto.create({
            data: {
                patientId,
                url: (req.file as any).path, // Cloudinary URL
                description,
                category: category || 'Other'
            }
        });

        res.json(photo);
    } catch (error: any) {
        console.error('Upload photo error:', error);
        res.status(500).json({
            error: 'Failed to upload photo',
            details: error.message || 'Unknown error',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});



app.delete('/api/clinics/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.clinic.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error: any) {
        console.error('Clinic delete error:', error);
        res.status(500).json({ error: error.message || 'Failed to delete clinic' });
    }
});

app.get('/api/plans', authenticateToken, async (req, res) => {
    try {
        const plans = await prisma.subscriptionPlan.findMany();
        const parsedPlans = plans.map(p => ({
            ...p,
            features: JSON.parse(p.features)
        }));
        res.json(parsedPlans);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch plans' });
    }
});

app.put('/api/plans/:id', authenticateToken, async (req, res) => {
    try {
        const data = { ...req.body };
        if (data.features) {
            data.features = JSON.stringify(data.features);
        }
        const plan = await prisma.subscriptionPlan.update({
            where: { id: req.params.id },
            data: data
        });
        res.json({ ...plan, features: JSON.parse(plan.features) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update plan' });
    }
});

// --- Bot Settings ---
app.put('/api/clinics/:id/settings', authenticateToken, async (req, res) => {
    try {
        const { botToken } = req.body;
        const clinicId = req.params.id;

        // Update clinic with new bot token
        const clinic = await prisma.clinic.update({
            where: { id: clinicId },
            data: { botToken: botToken || null }
        });

        // Restart bot if token is provided, otherwise remove it
        if (botToken) {
            botManager.startBot(clinicId, botToken);
        } else {
            botManager.removeBot(clinicId);
        }

        res.json({ success: true, clinic });
    } catch (error: any) {
        console.error('Bot settings update error:', error);
        res.status(500).json({ error: error.message || 'Failed to update bot settings' });
    }
});

// Get bot username for clinic (public endpoint - no auth needed)
app.get('/api/clinics/:id/bot-username', async (req, res) => {
    try {
        const clinicId = req.params.id;
        console.log(`Requesting bot username for clinic: ${clinicId}`);
        const username = await botManager.getBotUsername(clinicId);
        console.log(`Found username: ${username}`);
        res.json({ botUsername: username });
    } catch (error: any) {
        console.error('Get bot username error:', error);
        res.status(500).json({ error: error.message || 'Failed to get bot username' });
    }
});

// --- ICD-10 & Diagnoses ---
app.get('/api/icd10', authenticateToken, async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.json([]);
        }

        const codes = await prisma.iCD10Code.findMany({
            where: {
                OR: [
                    { code: { contains: query as string } },
                    { name: { contains: query as string } },
                    { category: { contains: query as string } }
                ]
            },
            take: 50
        });
        res.json(codes);
    } catch (error) {
        console.error('ICD-10 search error:', error);
        res.status(500).json({ error: 'Failed to search ICD-10 codes' });
    }
});

app.post('/api/diagnoses', authenticateToken, async (req, res) => {
    try {
        const { patientId, code, date, notes, status, clinicId } = req.body;

        const diagnosis = await prisma.patientDiagnosis.create({
            data: {
                patientId,
                code,
                date,
                notes,
                status,
                clinicId
            },
            include: { icd10: true }
        });
        res.json(diagnosis);
    } catch (error) {
        console.error('Create diagnosis error:', error);
        res.status(500).json({ error: 'Failed to create diagnosis' });
    }
});

app.get('/api/diagnoses', authenticateToken, async (req, res) => {
    try {
        const { patientId } = req.query;
        if (!patientId) {
            return res.status(400).json({ error: 'patientId is required' });
        }

        const diagnoses = await prisma.patientDiagnosis.findMany({
            where: { patientId: patientId as string },
            include: { icd10: true },
            orderBy: { date: 'desc' }
        });
        res.json(diagnoses);
    } catch (error) {
        console.error('Get diagnoses error:', error);
        res.status(500).json({ error: 'Failed to fetch diagnoses' });
    }
});

app.delete('/api/diagnoses/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.patientDiagnosis.delete({
            where: { id: req.params.id }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete diagnosis error:', error);
        res.status(500).json({ error: 'Failed to delete diagnosis' });
    }
});

// --- Patient Photos ---
app.post('/api/patients/:id/photos', authenticateToken, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { description, category } = req.body;
        const patientId = req.params.id;

        const photo = await prisma.patientPhoto.create({
            data: {
                patientId,
                url: (req.file as any).path, // Cloudinary URL
                description,
                category: category || 'Other'
            }
        });

        res.json(photo);
    } catch (error: any) {
        console.error('Upload photo error:', error);
        res.status(500).json({
            error: 'Failed to upload photo',
            details: error.message || 'Unknown error',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

app.get('/api/patients/:id/photos', authenticateToken, async (req, res) => {
    try {
        const photos = await prisma.patientPhoto.findMany({
            where: { patientId: req.params.id },
            orderBy: { date: 'desc' }
        });
        res.json(photos);
    } catch (error: any) {
        console.error('Get photos error:', error);
        res.status(500).json({
            error: 'Failed to fetch photos',
            details: error.message || 'Unknown error',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

app.delete('/api/photos/:id', authenticateToken, async (req, res) => {
    try {
        const photo = await prisma.patientPhoto.findUnique({
            where: { id: req.params.id }
        });

        if (!photo) {
            return res.status(404).json({ error: 'Photo not found' });
        }

        // Delete from Cloudinary
        if (photo.url.includes('cloudinary')) {
            const publicId = photo.url.split('/').pop()?.split('.')[0];
            if (publicId) {
                await cloudinary.uploader.destroy(`patient-photos/${publicId}`);
            }
        }

        await prisma.patientPhoto.delete({
            where: { id: req.params.id }
        });

        res.json({ success: true });
    } catch (error: any) {
        console.error('Delete photo error:', error);
        res.status(500).json({
            error: 'Failed to delete photo',
            details: error.message || 'Unknown error',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// --- Tooth Data ---
app.get('/api/patients/:id/teeth', authenticateToken, async (req, res) => {
    try {
        const teeth = await prisma.toothData.findMany({
            where: { patientId: req.params.id }
        });

        // Parse conditions JSON
        const parsedTeeth = teeth.map(t => ({
            ...t,
            conditions: JSON.parse(t.conditions)
        }));

        res.json(parsedTeeth);
    } catch (error) {
        console.error('Get teeth error:', error);
        res.status(500).json({ error: 'Failed to fetch tooth data' });
    }
});

app.post('/api/patients/:id/teeth', authenticateToken, async (req, res) => {
    try {
        const patientId = req.params.id;
        const { number, conditions, notes } = req.body;

        // Upsert tooth data
        const tooth = await prisma.toothData.upsert({
            where: {
                patientId_number: {
                    patientId,
                    number
                }
            },
            update: {
                conditions: JSON.stringify(conditions),
                notes
            },
            create: {
                patientId,
                number,
                conditions: JSON.stringify(conditions),
                notes
            }
        });

        res.json({
            ...tooth,
            conditions: JSON.parse(tooth.conditions)
        });
    } catch (error) {
        console.error('Save tooth error:', error);
        res.status(500).json({ error: 'Failed to save tooth data' });
    }
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        details: err.message || 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
