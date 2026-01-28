# Multi-Tenant Insurance Claims Platform

A production-ready, multi-tenant insurance claims management system with async processing built with Node.js, TypeScript, PostgreSQL, and BullMQ.

## 🚀 Features

- **Multi-Tenant Architecture**: Complete data isolation between organizations with automatic tenant filtering
- **Role-Based Access Control**: 4-tier permission system (Admin, Claims Processor, Provider, Patient)
- **Async Processing**: Background jobs for patient status changes using BullMQ (admission, discharge, treatment)
- **RESTful API**: Comprehensive endpoints for claims, patients, and organization management
- **Automatic Tenant Filtering**: All queries automatically filtered by organization - no manual WHERE clauses
- **Idempotent Jobs**: Safe retry logic with exponential backoff (3 retries max)
- **Transaction Safety**: Atomic operations in background jobs with rollback support
- **Comprehensive Validation**: Zod schemas for all API inputs
- **Structured Logging**: Winston logger with JSON formatting and file rotation

## 🏗️ Architecture

### Project Structure
```
src/
├── config/           # Configuration (database, Redis, environment)
├── controllers/      # Route handlers (auth, claims, patients, organizations)
├── middleware/       # Express middleware (auth, tenant, error)
├── models/          # Database schemas (Drizzle ORM)
├── repositories/    # Data access layer with automatic tenant filtering
├── services/        # Business logic layer
├── jobs/           # BullMQ job processors
├── workers/        # Queue workers
├── routes/         # API route definitions
├── types/          # TypeScript type definitions
├── utils/          # Utilities (validation, errors, logger, helpers)
└── index.ts        # Application entry point
```

### Multi-Tenancy Strategy
- **Data Isolation**: Every table includes `organization_id` for tenant separation
- **Repository Pattern**: `BaseRepository` automatically adds tenant filtering to all queries
- **Tenant Context**: Set via JWT token in middleware and propagated through services
- **Security**: Cross-tenant access attempts blocked at middleware, service, and repository levels

### Database Schema
- **organizations**: Top-level tenant entity
- **users**: Authentication with roles (admin/claims_processor/provider/patient)
- **patients**: Patient information with user linkage
- **claims**: Core claims data with status lifecycle
- **providers**: Healthcare providers
- **patient_status_changes**: Triggers async job processing
- **claim_status_history**: Complete audit trail
- **diagnosis_codes**: Reference data
- **job_queues**: BullMQ job tracking

## 🛠️ Tech Stack

- **Runtime**: Node.js 20
- **Language**: TypeScript 5
- **Framework**: Express.js
- **ORM**: Drizzle ORM with PostgreSQL
- **Queue**: BullMQ with Redis
- **Authentication**: JWT with Passport.js
- **Validation**: Zod schema validation
- **Logging**: Winston with structured logging
- **Environment**: dotenv for configuration

## 📦 Prerequisites

- Node.js 20 or higher
- PostgreSQL 15 or higher
- Redis 7 or higher
- npm or yarn package manager

## 🚀 Quick Start

### 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd insurance-claims-platform

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

### 2. Configure Environment

Edit `.env` file:
```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/insurance_db

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# Application
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# BullMQ
BULL_QUEUE_NAME=claims-processing
MAX_RETRY_ATTEMPTS=3
RETRY_DELAY=5000

# Super Admin (for organization management)
SUPER_ADMIN_TOKEN=your-super-admin-token-change-in-production
```

### 3. Database Setup

```bash
# Create PostgreSQL database
createdb insurance_db

# Run generate
npm run db:generate

# Run migrate (due to drizzle-kit version I opt to this instead)
npx drizzle-kit push:pg --driver=pg --schema ./src/models/schema.ts --connectionString=postgresql://username:password@localhost:5432/insurance_db
```

### 4. Start Services

Open two terminal windows:

**Terminal 1 - API Server:**
```bash
npm run dev
```

**Terminal 2 - Worker (for async processing):**
```bash
npm run worker
```

### 5. Verify Installation

```bash
# Health check
curl http://localhost:3000/api/health

# API info
curl http://localhost:3000/api/
```

## 📡 API Endpoints

### Authentication (Public)
```
POST   /api/auth/login                 # User login
POST   /api/auth/register              # Register new user (within organization)
POST   /api/auth/reset-password        # Request password reset
POST   /api/auth/reset-password/confirm # Confirm password reset
```

### Organization Management (Super Admin - Public with token)
```
POST   /api/organizations              # Create new organization
GET    /api/organizations              # List all organizations
GET    /api/organizations/:id          # Get organization details
PATCH  /api/organizations/:id          # Update organization
POST   /api/organizations/:id/deactivate # Deactivate organization
POST   /api/organizations/:id/activate  # Activate organization
GET    /api/organizations/:id/stats    # Organization statistics
```

### Protected Routes (Require JWT Token)

#### Claims Management
```
POST   /api/claims                    # Create claim
GET    /api/claims                    # List claims with filtering
GET    /api/claims/stats              # Claim statistics
GET    /api/claims/:id                # Get claim details
PATCH  /api/claims/:id/status         # Update claim status
POST   /api/claims/bulk-status-update # Bulk status update
PATCH  /api/claims/:id                # Update claim
POST   /api/claims/:id/assign         # Assign to processor
GET    /api/claims/:id/history        # Status history
```

#### Patient Management
```
POST   /api/patients                  # Create patient
GET    /api/patients/search           # Search patients
GET    /api/patients/stats            # Patient statistics
GET    /api/patients/:id              # Get patient
PATCH  /api/patients/:id              # Update patient
POST   /api/patients/:id/link-user    # Link to user account
```

#### Patient Status (Triggers async jobs)
```
POST   /api/patient-status            # Create status change (admission/discharge/treatment)
GET    /api/patient-status/history/:patientId  # Status history
```

#### User Management
```
POST   /api/auth/change-password      # Change password
GET    /api/auth/profile              # Get user profile
POST   /api/auth/logout               # Logout
GET    /api/organizations/:orgId/validate-access # Validate access
```

## 🔒 Authentication & Authorization

### JWT Token Usage
```bash
# Get token from login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@healthplus.com",
    "password": "Password123!"
  }'

# Use token in subsequent requests
curl -X GET http://localhost:3000/api/claims \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Role-Based Permissions

| Role | Claims Access | Patient Access | Organization Access |
|------|--------------|---------------|---------------------|
| **Admin** | All (read/write) | All (read/write) | Full organization |
| **Claims Processor** | Assigned only (read/write) | Read all | Limited |
| **Provider** | Own only (read) | Read assigned | None |
| **Patient** | Own only (read) | Own only (read) | None |

## 🏢 Organization Creation

### Create First Organization (Super Admin)

```bash
curl -X POST http://localhost:3000/api/organizations \
  -H "Content-Type: application/json" \
  -H "X-Super-Admin-Token: your-super-admin-token" \
  -d '{
    "name": "HealthPlus Insurance",
    "slug": "healthplus",
    "adminEmail": "admin@healthplus.com",
    "adminPassword": "SecurePass123!",
    "adminFirstName": "John",
    "adminLastName": "Admin"
  }'
```

### Login as Organization Admin

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@healthplus.com",
    "password": "SecurePass123!"
  }'
```

## 🔄 Async Processing (BullMQ Jobs)

### Job Types
1. **Patient Admission**: Marks submitted claims as "under_review"
2. **Patient Discharge**: Auto-approves/pays pending claims
3. **Treatment Initiated**: Triggers claim review based on treatment

### Triggering Jobs
```bash
# Create patient status change (triggers job)
curl -X POST http://localhost:3000/api/patient-status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "patient-uuid",
    "statusType": "admission",
    "occurredAt": "2024-01-28T10:00:00Z",
    "details": { "hospital": "City General" }
  }'
```

### Job Features
- **Idempotent**: Safe to retry without data corruption
- **Retry Logic**: Exponential backoff (max 3 attempts)
- **Transaction Safety**: Atomic database operations
- **Monitoring**: Complete logging in `job_queues` table

## 🗄️ Database Operations

### Migrations
```bash
# Generate migration from schema changes
npm run db:generate

# Apply migrations
#(due to drizzle-kit version I opt to this instead)
npx drizzle-kit push:pg --driver=pg --schema ./src/models/schema.ts --connectionString=postgresql://username:password@localhost:5432/insurance_db

# Open Drizzle Studio (if configured)
npm run db:studio
```

### Sample Queries

```sql
-- Get all claims for an organization
SELECT * FROM claims WHERE organization_id = 'org-uuid';

-- Get claim statistics by status
SELECT status, COUNT(*) as count 
FROM claims 
WHERE organization_id = 'org-uuid'
GROUP BY status;

-- Find claims requiring review
SELECT * FROM claims 
WHERE organization_id = 'org-uuid' 
  AND status = 'submitted'
  AND submission_date > NOW() - INTERVAL '30 days';
```

## 🧪 Testing the API

### 1. Create Organization
```bash
curl -X POST http://localhost:3000/api/organizations \
  -H "Content-Type: application/json" \
  -H "X-Super-Admin-Token: super-admin-secret-123" \
  -d '{
    "name": "Test Insurance",
    "slug": "testinsurance",
    "adminEmail": "admin@test.com",
    "adminPassword": "TestPass123!",
    "adminFirstName": "Test",
    "adminLastName": "Admin"
  }'
```

### 2. Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "TestPass123!"
  }'
```

### 3. Create Patient
```bash
curl -X POST http://localhost:3000/api/patients \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "dateOfBirth": "1985-06-15",
    "email": "john.doe@email.com",
    "insuranceMemberId": "TEST-001"
  }'
```

### 4. Create Claim
```bash
curl -X POST http://localhost:3000/api/claims \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "patient-uuid-from-step3",
    "providerId": "provider-uuid",
    "diagnosisCode": "I10",
    "amount": "250.00",
    "notes": "Hypertension follow-up"
  }'
```

### 5. Trigger Async Processing
```bash
curl -X POST http://localhost:3000/api/patient-status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "patient-uuid-from-step3",
    "statusType": "admission",
    "occurredAt": "2024-01-28T10:00:00Z"
  }'
```

## 🔧 Development

### Code Structure Patterns

#### Repository Pattern (Automatic Tenant Filtering)
```typescript
// All queries automatically include tenant filtering
const claims = await claimRepo.findAll(
  eq(claims.status, 'submitted')
);
// Automatically adds: WHERE organization_id = :tenantId AND status = 'submitted'
```

#### Service Layer (Business Logic + Permissions)
```typescript
class ClaimService {
  async updateClaimStatus(claimId: string, status: string) {
    // 1. Check tenant access
    await this.checkClaimAccess(claimId, 'update');
    
    // 2. Validate business rules
    this.validateStatusTransition(oldStatus, newStatus);
    
    // 3. Update with audit trail
    return this.claimRepo.updateClaimStatus(claimId, status, userId);
  }
}
```

#### Job Processing (Idempotent)
```typescript
export async function processPatientAdmission(job: Job) {
  // Job is safe to retry - checks current state before acting
  const submittedClaims = await findSubmittedClaims();
  
  // Only update if not already updated
  if (submittedClaims.length > 0) {
    await updateClaimsToUnderReview(submittedClaims);
  }
}
```

### Adding New Features

1. **Add new table to `src/models/schema.ts`**
2. **Create repository in `src/repositories/`** (extends `BaseRepository`)
3. **Create service in `src/services/`** (includes business logic)
4. **Create controller in `src/controllers/`** (API endpoints)
5. **Add routes to `src/routes/index.ts`**
6. **Add validation schemas in `src/utils/validation.ts`**

## 📊 Monitoring & Logging

### Log Files
- `logs/error.log`: Error-level logs
- `logs/combined.log`: All application logs
- `logs/exceptions.log`: Uncaught exceptions
- `logs/rejections.log`: Unhandled promise rejections

### Checking Job Queue Status
```bash
# Connect to Redis
redis-cli

# Monitor queue activity
MONITOR

# Check queue length
LLEN bull:claims-processing:wait
```

### Viewing Database
```bash
# Connect to PostgreSQL
psql insurance_db

# View recent claims
SELECT claim_number, status, amount, submission_date 
FROM claims 
WHERE organization_id = 'your-org-id'
ORDER BY submission_date DESC 
LIMIT 10;
```

## 🚨 Common Issues & Solutions

### 1. Database Connection Failed
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution:** Ensure PostgreSQL is running: `sudo service postgresql start`

### 2. Redis Connection Failed
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```
**Solution:** Start Redis: `redis-server`

### 3. JWT Token Expired/Invalid
```
Error: Invalid token
```
**Solution:** Login again to get new token

### 4. Tenant Access Denied
```
Error: Cross-tenant access denied
```
**Solution:** Ensure you're using correct organization credentials

### 5. Migration Errors
```
Error: Relation already exists
```
**Solution:** Drop and recreate database, or fix migration conflicts

## 📈 Performance Optimization

### Database Indexes
The schema includes optimized indexes for:
- Tenant-based queries (`organization_id`)
- Status filtering (`status`)
- Date ranges (`submission_date`)
- Composite queries (`organization_id + status + date`)

### Query Optimization
- **Eager Loading**: Related data loaded efficiently
- **Pagination**: All list endpoints support limit/offset
- **Selective Fields**: Avoid `SELECT *` in repositories
- **Batch Operations**: Bulk updates for efficiency

### Caching Strategy
- **Redis**: Session storage and job queue
- **Query Caching**: Frequent queries cached (future enhancement)
- **Rate Limiting**: Per-tenant request limiting

## 🔐 Security Considerations

### Implemented Security Features
1. **Tenant Isolation**: Automatic filtering prevents data leakage
2. **Input Validation**: All inputs validated with Zod schemas
3. **Password Hashing**: bcrypt with salt rounds
4. **JWT Security**: Short-lived tokens with secure secrets
5. **SQL Injection Protection**: Drizzle ORM uses parameterized queries
6. **XSS Protection**: Input sanitization in utilities
7. **Rate Limiting**: Prevents abuse per tenant

### Recommended for Production
1. **HTTPS**: Enable TLS/SSL
2. **CORS**: Restrict allowed origins
3. **WAF**: Web Application Firewall
4. **Audit Logging**: Complete API request logging
5. **Security Headers**: Implement CSP, HSTS, etc.

## 🚢 Deployment Considerations

### Environment Variables for Production
```env
# Production database (use connection pooling)
DATABASE_URL=postgresql://user:pass@host:5432/db?pool_timeout=30&connection_limit=20

# Redis with TLS (if using Upstash/Redis Cloud)
REDIS_URL=rediss://:password@host:port

# Strong secrets (generate with: openssl rand -base64 32)
JWT_SECRET=generated-32+-character-secret
SUPER_ADMIN_TOKEN=another-secure-token

# Production settings
NODE_ENV=production
PORT=8080
LOG_LEVEL=warn
```

### Process Management
```bash
# Using PM2
npm install -g pm2
pm2 start ecosystem.config.js

# Ecosystem config
module.exports = {
  apps: [{
    name: 'api',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster'
  }, {
    name: 'worker',
    script: 'dist/workers/claims.worker.js',
    instances: 2
  }]
}
```

### Health Checks
```bash
# Application health
curl http://localhost:3000/api/health

# Database health
pg_isready -d insurance_db

# Redis health
redis-cli ping
```

## 🤝 Contributing

1. **Fork** the repository
2. **Create feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit changes**: `git commit -m 'feat: add amazing feature'`
4. **Push to branch**: `git push origin feature/amazing-feature`
5. **Open Pull Request**

### Development Guidelines
- Write TypeScript with strict type checking
- Add tests for new functionality
- Update API documentation in README
- Follow existing code style and patterns

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Drizzle ORM** for excellent TypeScript support
- **BullMQ** for robust queue management
- **Express.js** for the web framework
- **PostgreSQL & Redis** for data persistence

## 📞 Support

For issues and questions:
1. Check this README and code comments
2. Examine logs in `logs/` directory
3. Create GitHub issue with:
   - Error messages
   - Steps to reproduce
   - Environment details
   - Log excerpts (sanitized)

---

**Note**: This is a production-ready template. For actual production deployment:
- Use proper secret management (AWS Secrets Manager, HashiCorp Vault)
- Implement monitoring (Prometheus, Grafana)
- Set up alerts for critical errors
- Regular security audits
- Database backups and disaster recovery plan

**Happy Coding!** 🚀