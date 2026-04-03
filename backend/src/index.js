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
      if (!tenant) { await prisma.$disconnect(); return; }

      const pitchTypes = await prisma.pitchType.findMany({
        where: { tenantId: tenant.id, active: true },
        include: { pitches: { where: { active: true } } },
      });
      if (!pitchTypes.length) { await prisma.$disconnect(); return; }

      const grass = pitchTypes.find(p => p.name.includes('Grass')) || pitchTypes[0];
      const hard  = pitchTypes.find(p => p.name.includes('Hardstanding')) || pitchTypes[1] || pitchTypes[0];
      const super_ = pitchTypes.find(p => p.name.includes('Super')) || pitchTypes[2] || pitchTypes[0];

      // Find one actual pitch per type (for pitchId)
      const grassPitch  = grass.pitches[0]  || null;
      const hardPitch   = hard.pitches[0]   || null;
      const superPitch_ = super_.pitches[0] || null;

      let refCounter = 1;
      const ref = () => `CB${String(refCounter++).padStart(5, '0')}`;
      const d = (offsetDays) => {
        const dt = new Date('2026-04-03'); // Base date in current month
        dt.setDate(dt.getDate() + offsetDays);
        return dt;
      };

      // [guestName, email, phone, numAdults, numChildren, arrOffset, depOffset, status, pitchType, pitch, baseAmount, extrasAmount, notes]
      const bookings = [
        // Past bookings (confirmed/cancelled)
        ['James & Helen Carter',  'james.carter@email.com',   '07700900101', 2, 0, -42, -38, 'confirmed',  grass,  grassPitch,  8800,  0,    null],
        ['Olivia Patel',          'olivia.p@email.com',       '07700900102', 2, 2, -35, -30, 'confirmed',  hard,   hardPitch,   14000, 1500, 'Awning requested'],
        ['Mark Thompson',         'mark.t@email.com',         '07700900103', 2, 0, -28, -25, 'confirmed',  grass,  grassPitch,  6600,  600,  null],
        ['Sophie & Dan Williams', 'sophie.w@email.com',       '07700900104', 2, 1, -21, -18, 'confirmed',  super_, superPitch_, 10500, 1200, null],
        ['Robert Hughes',         'rob.hughes@email.com',     '07700900105', 1, 0, -14, -12, 'confirmed',  hard,   hardPitch,   5600,  300,  'Single traveller, motorbike'],
        ['Grace & Tom Nielsen',   'grace.n@email.com',        '07700900106', 2, 3, -10,  -7, 'confirmed',  super_, superPitch_, 10500, 2700, '3 children, dog'],
        ['Ahmed Malik',           'ahmed.m@email.com',        '07700900107', 2, 0,  -7,  -5, 'confirmed',  grass,  grassPitch,  4400,  0,    null],
        ['Cancelled — no show',   'noshow@email.com',         '07700900108', 2, 0, -20, -17, 'cancelled',  hard,   hardPitch,   8400,  0,    'No show — cancelled day before arrival'],
        // Current / arriving soon
        ['Laura & Chris Ford',    'laura.ford@email.com',     '07700900109', 2, 0,  -1,   3, 'confirmed',  hard,   hardPitch,   11200, 500,  'Arriving tonight'],
        ['Peter & Sue Marsh',     'peter.marsh@email.com',    '07700900110', 2, 2,   0,   4, 'confirmed',  super_, superPitch_, 14000, 2000, 'Arriving today'],
        // Upcoming bookings
        ['Nathan Brooks',         'n.brooks@email.com',       '07700900111', 2, 0,   5,   9, 'confirmed',  grass,  grassPitch,  8800,  600,  null],
        ['Claire & Sam Abbott',   'claire.a@email.com',       '07700900112', 2, 1,   7,  11, 'confirmed',  hard,   hardPitch,   11200, 900,  'Awning + dog'],
        ['Pending — unconfirmed', 'guest.pending@email.com',  '07700900113', 3, 0,  10,  14, 'pending',    grass,  grassPitch,  8800,  1000, null],
        ['James Whitfield',       'j.whitfield@email.com',    '07700900114', 2, 0,  14,  17, 'confirmed',  super_, superPitch_, 10500, 0,    null],
        ['Anita Shah',            'anita.shah@email.com',     '07700900115', 2, 2,  18,  25, 'confirmed',  hard,   hardPitch,   19600, 2100, 'Week stay, 2 kids'],
        ['The Robinson Family',   'robinson.fam@email.com',   '07700900116', 2, 3,  21,  28, 'confirmed',  super_, superPitch_, 24500, 3600, 'Family of 5'],
        ['Pending — card failed', 'card.fail@email.com',      '07700900117', 2, 0,  24,  27, 'pending',    grass,  grassPitch,  6600,  0,    'Payment retry needed'],
        ['Gary & Mel Dodd',       'gary.d@email.com',         '07700900118', 2, 0,  30,  33, 'confirmed',  hard,   hardPitch,   8400,  300,  null],
        ['Bank Holiday Weekend',  'bh.guest@email.com',       '07700900119', 2, 1,  35,  38, 'confirmed',  super_, superPitch_, 10500, 900,  'Bank holiday w/e'],
        ['Diane & Frank Oliver',  'diane.o@email.com',        '07700900120', 2, 0,  42,  49, 'confirmed',  grass,  grassPitch,  15400, 700,  'Week booking'],
      ];

      for (const [guestName, guestEmail, guestPhone, numAdults, numChildren, arrOff, depOff, status, pitchType, pitch, baseAmount, extrasAmount, notes] of bookings) {
        const arrivalDate   = d(arrOff);
        const departureDate = d(depOff);
        const totalAmount   = baseAmount + extrasAmount;
        const platformFee   = Math.round(totalAmount * 0.03);
        await prisma.booking.create({
          data: {
            tenantId: tenant.id,
            pitchId: pitch ? pitch.id : null,
            guestName, guestEmail, guestPhone,
            arrivalDate, departureDate,
            numAdults, numChildren,
            extras: [],
            baseAmount, extrasAmount, totalAmount, platformFee,
            bookingRef: ref(),
            status,
            notes: notes || null,
            stripePaymentIntentId: status === 'confirmed' ? `pi_demo_${ref().toLowerCase()}` : null,
          },
        });
      }
      console.log(`✓ Seeded ${bookings.length} demo bookings`);
    }
    await prisma.$disconnect();
  } catch (e) {
    console.log('Demo seed skipped:', e.message);
  }
});
