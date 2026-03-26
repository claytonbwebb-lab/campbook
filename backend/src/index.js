import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import router from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(morgan('dev'));

// Stripe webhook needs raw body — must come BEFORE express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

// Serve static files (widget + admin)
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api', router);

// Admin SPA
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../public/admin/index.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, '../public/signup/index.html')));

// Guest booking page
app.get('/book/:slug', (req, res) => {
  const { slug } = req.params;
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Book Your Stay | CampBook</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f5f1;min-height:100vh}
  header{background:#1a3a2a;color:#fff;padding:1.2rem 2rem;display:flex;align-items:center;gap:12px}
  header h1{font-size:1.1rem;font-weight:700}
  header span{color:#a8d5b5}
  .demo-banner{background:#3a5a40;color:#fff;text-align:center;padding:.6rem;font-size:.82rem}
  #campbook-widget{max-width:800px;margin:2rem auto;padding:0 1rem}
</style>
</head>
<body>
<header><div style="font-size:1.4rem">&#127957;</div><h1><span>Camp</span>Book &mdash; Online Booking</h1></header>
<div class="demo-banner">&#9432; Sandbox demo &mdash; no real payments taken</div>
<div id="campbook-widget"></div>
<script src="/widget.js" data-tenant="${slug}" data-container="campbook-widget"></script>
</body>
</html>`);
});

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', service: 'CampBook API' }));

app.listen(PORT, async () => {
  console.log(`CampBook running on port ${PORT}`);
  
  // Seed demo bookings on startup if none exist
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const existing = await prisma.booking.count({ where: { tenant: { slug: 'demo-campsite' } } });
    if (existing === 0) {
      const tenant = await prisma.tenant.findUnique({ where: { slug: 'demo-campsite' } });
      const pitches = await prisma.pitchType.findMany({ where: { tenantId: tenant.id } });
      const bookings = [
        { guestName: 'John Smith', guestEmail: 'john.smith@email.com', guestPhone: '07700900001', arrivalDate: '2026-04-10', departureDate: '2026-04-14', status: 'CONFIRMED', totalPaid: 320, pitchTypeId: pitches[0].id, guests: 2, children: 0 },
        { guestName: 'Sarah Jones', guestEmail: 'sarah.j@email.com', guestPhone: '07700900002', arrivalDate: '2026-04-15', departureDate: '2026-04-18', status: 'CONFIRMED', totalPaid: 180, pitchTypeId: pitches[0].id, guests: 2, children: 1 },
        { guestName: 'Mike Brown', guestEmail: 'mike.brown@email.com', guestPhone: '07700900003', arrivalDate: '2026-04-20', departureDate: '2026-04-25', status: 'PENDING', totalPaid: 0, pitchTypeId: pitches[1].id, guests: 4, children: 2 },
        { guestName: 'Emma Wilson', guestEmail: 'emma.w@email.com', guestPhone: '07700900004', arrivalDate: '2026-05-01', departureDate: '2026-05-07', status: 'CONFIRMED', totalPaid: 420, pitchTypeId: pitches[0].id, guests: 2, children: 0 },
        { guestName: 'David Lee', guestEmail: 'david.lee@email.com', guestPhone: '07700900005', arrivalDate: '2026-05-10', departureDate: '2026-05-12', status: 'CONFIRMED', totalPaid: 150, pitchTypeId: pitches[1].id, guests: 2, children: 0 },
      ];
      for (const b of bookings) {
        await prisma.booking.create({ data: { ...b, tenantId: tenant.id } });
      }
      console.log('✓ Seeded 5 demo bookings');
    }
    await prisma.$disconnect();
  } catch (e) {
    console.log('Demo seed skipped:', e.message);
  }
});
