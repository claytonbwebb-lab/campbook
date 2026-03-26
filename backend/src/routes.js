import { Router } from 'express';
import express from 'express';
import authMiddleware from './middleware.js';
import { signUp } from './controllers.js';
import {
  getTenantConfig, getAvailability, createBooking, getBookingByRef,
  handleStripeWebhook, initiateStripeConnect, handleStripeConnectReturn,
  adminLogin,
  getDashboardStats,
  getAdminBookings, getAdminBooking, cancelBooking,
  getPitchTypes, createPitchType, updatePitchType,
  getPitches, createPitch, updatePitch,
  getBlockedDates, createBlockedDate, deleteBlockedDate,
  getExtras, createExtra, updateExtra,
  createSeasonalRate, updateSeasonalRate,
  getSettings, updateSettings,
} from './controllers.js';

const router = Router();

// ── Public ───────────────────────────────────────────────────────────────────
router.get('/tenants/:slug', getTenantConfig);
router.get('/availability', getAvailability);
router.post('/bookings', createBooking);
router.get('/bookings/:ref', getBookingByRef);

// ── Stripe Webhooks (raw body) ───────────────────────────────────────────────
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// ── Admin Auth ───────────────────────────────────────────────────────────────
router.post('/signup', signUp);
router.post('/admin/login', adminLogin);

// ── Demo Seed (secret) ──────────────────────────────────────────────────────
router.post('/admin/seed-demo', async (req, res) => {
  if (req.body.secret !== 'BrightStack2026!') return res.status(401).json({ error: 'Unauthorized' });
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
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
    res.json({ success: true, count: bookings.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    prisma.$disconnect();
  }
});

// ── Admin (JWT protected) ────────────────────────────────────────────────────
router.use('/admin', authMiddleware);

router.get('/admin/dashboard', getDashboardStats);

router.get('/admin/bookings', getAdminBookings);
router.get('/admin/bookings/:id', getAdminBooking);
router.patch('/admin/bookings/:id', cancelBooking);

router.get('/admin/pitch-types', getPitchTypes);
router.post('/admin/pitch-types', createPitchType);
router.patch('/admin/pitch-types/:id', updatePitchType);

router.get('/admin/pitches', getPitches);
router.post('/admin/pitches', createPitch);
router.patch('/admin/pitches/:id', updatePitch);

router.get('/admin/blocked-dates', getBlockedDates);
router.post('/admin/blocked-dates', createBlockedDate);
router.delete('/admin/blocked-dates/:id', deleteBlockedDate);

router.get('/admin/extras', getExtras);
router.post('/admin/extras', createExtra);
router.patch('/admin/extras/:id', updateExtra);

router.post('/admin/seasonal-rates', createSeasonalRate);
router.patch('/admin/seasonal-rates/:id', updateSeasonalRate);

router.get('/admin/settings', getSettings);
router.patch('/admin/settings', updateSettings);

router.get('/admin/stripe/connect', initiateStripeConnect);
router.get('/admin/stripe/connect/return', handleStripeConnectReturn);

export default router;
