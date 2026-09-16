# SmartCard L.D.K - Deployment Guide

## Prerequisites
- Node.js 18+
- SQLite3
- ESP32 with MFRC522 RFID reader (for hardware)

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your MTN MoMo credentials
```

### 3. Start Backend
```bash
npm start
```

### 4. Open in Browser
- Parent Portal: `http://localhost:3000/dashboard.html`
- Admin Panel: `http://localhost:3000/admin.html`
- Payment: `http://localhost:3000/payment.html`
- Activities: `http://localhost:3000/activities.html`

## Production Deployment

### Using PM2
```bash
npm install -g pm2
pm2 start backend/server.js --name "smartcard-ldk"
```

### Environment Variables for Production
- `NODE_ENV=production`
- `MOMO_ENVIRONMENT=production`
- `ADMIN_PASSWORD` (strong production password)
- `PORT` (if not 3000)

## Database
- SQLite database is stored at `./smartcard.db`
- All tables are auto-created on startup
- Use `smartcard-backup.db` for backups

## Security Notes
- Admin passwords are hashed using PBKDF2 (SHA-512)
- Rate limiting is enabled (100 req/min general, 10 req/min auth)
- Input sanitization on all endpoints
- Admin token required for protected endpoints

## API Endpoints
- `GET /api/health` - Health check
- `GET /api/activities` - School activities
- `POST /api/activities` - Create activity (admin auth)
- `PUT /api/activities/:id` - Update activity (admin auth)
- `DELETE /api/activities/:id` - Deactivate activity (admin auth)
- `POST /api/admin/login` - Admin login
- `POST /api/admin/change-password` - Change admin password
- `GET /api/library/books` - List books
- `POST /api/library/books` - Add book
- `PUT /api/library/books/:id` - Update book
- `DELETE /api/library/books/:id` - Delete book
- `POST /api/library/borrow` - Borrow book
- `POST /api/library/return` - Return book
- `GET /api/library/overdue` - Overdue loans
- `POST /api/library/loans/:id/fine` - Apply fine
- `POST /api/webhook/momo` - MTN MoMo webhook
- `GET /api/students/:id` - Student info
- `PUT /api/students/:id` - Update student (admin auth)
- `DELETE /api/students/:id` - Delete student (admin auth)