# 🏕️ CampBook — Campsite Booking SaaS

Multi-tenant campsite booking platform. Campsites embed a booking widget on their own website. Guests book and pay without leaving the site. Payments go directly to the campsite via Stripe Connect. Platform takes a 3% fee.

## Stack
- Node/Express + Prisma + Postgres
- Stripe Connect Express
- Resend (emails)
- Vanilla JS embeddable widget
- Single-page admin dashboard

## Local Dev

### Prerequisites
- Node 18+
- Postgres running locally

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run seed        # creates demo tenant + data
npm run dev         # starts on port 3000
```

### Environment Variables (backend/.env)
```
DATABASE_URL=postgresql://user:password@localhost:5432/campbook
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PLATFORM_FEE_PERCENT=3
RESEND_API_KEY=re_...
JWT_SECRET=your_random_secret
ADMIN_BASE_URL=http://localhost:3000
PORT=3000
```

## Deploy to Railway

1. Create a new Railway project
2. Add a Postgres database service
3. Connect this repo, set root directory to `backend/`
4. Add all env vars above (Railway will auto-set `DATABASE_URL` from the DB service)
5. Deploy — `railway.toml` handles migrations automatically

## Demo Credentials
After seeding:
- **Admin:** https://your-domain/admin
- **Email:** admin@demo-campsite.com
- **Password:** demo1234

## Embed Widget
```html
<div data-campbook-tenant="your-slug"></div>
<script src="https://your-railway-domain.up.railway.app/widget.js"></script>
```

## API Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/tenants/:slug | Public | Tenant config |
| GET | /api/availability | Public | Available pitch types |
| POST | /api/bookings | Public | Create booking |
| GET | /api/bookings/:ref | Public | Lookup by ref |
| POST | /api/stripe/webhook | Stripe | Payment webhooks |
| POST | /api/admin/login | — | Get JWT |
| GET | /api/admin/dashboard | JWT | Stats |
| GET/PATCH | /api/admin/bookings | JWT | Bookings |
| GET/POST/PATCH | /api/admin/pitch-types | JWT | Pitch types |
| GET/POST/PATCH | /api/admin/pitches | JWT | Individual pitches |
| GET/POST/DELETE | /api/admin/blocked-dates | JWT | Blocked dates |
| GET/POST/PATCH | /api/admin/extras | JWT | Add-ons |
| POST/PATCH | /api/admin/seasonal-rates | JWT | Seasonal pricing |
| GET/PATCH | /api/admin/settings | JWT | Campsite settings |
| GET | /api/admin/stripe/connect | JWT | Stripe onboarding |
