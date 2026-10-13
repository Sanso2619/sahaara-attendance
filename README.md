# sahaara-attendance
A multi-organization digital attendance management platform for NGO schools and learning centres.

## Tech Stack
- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript, JWT with HTTP-only Cookies
- **Database**: PostgreSQL (Multi-tenant schema with strict tenant isolation)
- **Testing**: Jest & Supertest (Backend), Vitest (Frontend)

## Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **PostgreSQL**: v14.0 or higher

## Local Development Setup

### 1. Environment Configuration
Copy `.env.example` to create your local `.env` configuration file:
```bash
cp .env.example .env
```
Ensure database credentials in `.env` match your local PostgreSQL setup:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sahaara_db
DB_USER=sahaara_user
DB_PASSWORD=sahaara_secure_password
JWT_SECRET=super_secret_sahaara_dev_jwt_key_32_chars
COOKIE_SECRET=super_secret_sahaara_dev_cookie_key_32
```

### 2. PostgreSQL Database Setup
Create the local PostgreSQL database:
```bash
createdb -h localhost -U postgres sahaara_db
```

### 3. Installation
Install root workspaces dependencies:
```bash
npm install
```

### 4. Database Migrations & Seed Data
Run transactional PostgreSQL migrations:
```bash
npm run db:migrate
```
Seed anonymized development dataset (NGOs, Admins, Teachers):
```bash
npm run db:seed
```

### 5. Running Development Servers
Start both backend and frontend concurrently:
- **Backend API Server** (`http://localhost:4000`):
  ```bash
  npm run dev:backend
  ```
- **Frontend Next.js App** (`http://localhost:3000`):
  ```bash
  npm run dev:frontend
  ```

### 6. Testing & Building
- **Run Backend Tests**:
  ```bash
  npm run test:backend
  ```
- **Build Backend**:
  ```bash
  npm run build:backend
  ```
- **Run Frontend Tests**:
  ```bash
  npm run test:frontend
  ```
- **Build Frontend**:
  ```bash
  npm run build:frontend
  ```
