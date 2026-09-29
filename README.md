# DentaCRM - Dental Clinic Management System

A full-stack SaaS application for managing dental clinics with role-based access control.

## 🚀 Tech Stack

**Frontend:**
- React + TypeScript
- Vite
- Tailwind CSS

**Backend:**
- Node.js + Express
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT Authentication

## 📦 Installation

### Prerequisites
- Node.js 18+
- PostgreSQL database

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

4. Update `.env` with your database credentials and JWT secret

5. Run database migrations:
```bash
npx prisma migrate dev
```

6. Seed the database:
```bash
npx ts-node seed.ts
```

7. Start the server:
```bash
npm run dev
```

### Frontend Setup

1. Navigate to root directory:
```bash
cd ..
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

4. Update `VITE_API_URL` in `.env` to point to your backend

5. Start the development server:
```bash
npm run dev
```

## 🔐 Default Credentials

**Super Admin:**
- Username: `superadmin`
- Password: `superadminparol`

**Demo Clinic Admin:**
- Username: `demoklinikaadmin`
- Password: `demoklinikaparol`
- Runs entirely in the browser (no backend requests, nothing is written to the database); demo data is rebuilt for the current day (`services/demoSeed.ts`)

## 🚢 Deployment

### Backend (Railway)
1. Push code to GitHub
2. Create new project on Railway
3. Connect GitHub repository
4. Set root directory to `backend`
5. Add environment variables:
   - `DATABASE_URL` (from Railway PostgreSQL)
   - `JWT_SECRET`
6. Deploy

### Frontend (Vercel)
1. Create new project on Vercel
2. Connect GitHub repository
3. Set root directory to `./`
4. Add environment variable:
   - `VITE_API_URL` (Railway backend URL)
5. Deploy

## 📝 Features

- Multi-tenant architecture
- Role-based access control (Super Admin, Clinic Admin, Doctor)
- Patient management
- Appointment scheduling
- Financial tracking
- Subscription plans with limits
- JWT authentication

## 📄 License

MIT
