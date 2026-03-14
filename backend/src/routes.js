import { Router } from 'express';
import express from 'express';
import authMiddleware from './middleware.js';
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
router.post('/admin/login', adminLogin);

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
