import prisma from './prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import { Resend } from 'resend';
import { generateBookingRef, calculateBookingCost, getAvailablePitchTypes } from './utils.js';

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const getResend = () => new Resend(process.env.RESEND_API_KEY || '');
const PLATFORM_FEE_PERCENT = parseFloat(process.env.STRIPE_PLATFORM_FEE_PERCENT || '3');

function getPlatformFeePercent(plan) {
  if (plan === 'campbook_only') return 5;
  if (plan === 'bundle') return 3;
  return 0; // website_only
}

// ── Public: Tenant config ────────────────────────────────────────────────────

export const getTenantConfig = async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: req.params.slug },
      include: {
        pitchTypes: { where: { active: true }, include: { seasonalRates: true } },
        extras: { where: { active: true } },
      },
    });
    if (!tenant) return res.status(404).json({ message: 'Campsite not found' });
    const { password, stripeAccountId, ...safe } = tenant;
    res.json(safe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Public: Availability ─────────────────────────────────────────────────────

export const getAvailability = async (req, res) => {
  const { tenant: slug, arrival, departure } = req.query;
  if (!slug || !arrival || !departure) {
    return res.status(400).json({ message: 'tenant, arrival and departure required' });
  }
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      include: {
        pitchTypes: {
          where: { active: true },
          include: { seasonalRates: true, pitches: { where: { active: true } } },
        },
        extras: { where: { active: true } },
      },
    });
    if (!tenant) return res.status(404).json({ message: 'Campsite not found' });

    const arrDate = new Date(arrival);
    const depDate = new Date(departure);
    const nights = Math.round((depDate - arrDate) / 86400000);
    if (nights < 1) return res.status(400).json({ message: 'Invalid dates' });

    const available = await getAvailablePitchTypes(tenant, arrDate, depDate, nights);
    res.json({ available, extras: tenant.extras, nights });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Public: Create Booking ───────────────────────────────────────────────────

export const createBooking = async (req, res) => {
  const {
    tenantSlug, pitchTypeId, arrivalDate, departureDate,
    numAdults, numChildren, selectedExtras,
    guestName, guestEmail, guestPhone, paymentMethodId,
  } = req.body;

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      include: {
        pitchTypes: {
          where: { id: pitchTypeId, active: true },
          include: { seasonalRates: true, pitches: { where: { active: true } } },
        },
        extras: { where: { active: true } },
      },
    });
    if (!tenant || !tenant.pitchTypes.length) {
      return res.status(404).json({ message: 'Pitch type not found' });
    }
    if (!tenant.stripeOnboarded) {
      return res.status(400).json({ message: 'Campsite not yet onboarded for payments' });
    }

    const arrDate = new Date(arrivalDate);
    const depDate = new Date(departureDate);
    const nights = Math.round((depDate - arrDate) / 86400000);

    const pitchType = tenant.pitchTypes[0];
    const available = await getAvailablePitchTypes(tenant, arrDate, depDate, nights);
    const availType = available.find(a => a.id === pitchTypeId);
    if (!availType) return res.status(409).json({ message: 'No pitches available for those dates' });

    const { baseAmount, extrasAmount, totalAmount } = calculateBookingCost(
      pitchType, nights, selectedExtras || [], tenant.extras
    );
    const platformFee = Math.round(totalAmount * getPlatformFeePercent(tenant.plan) / 100);

    // Atomic: lock an available pitch and create booking
    const result = await prisma.$transaction(async (tx) => {
      // Find a pitch not booked for these dates
      const bookedPitchIds = await tx.booking.findMany({
        where: {
          pitchId: { in: pitchType.pitches.map(p => p.id) },
          status: { in: ['pending', 'confirmed'] },
          arrivalDate: { lt: depDate },
          departureDate: { gt: arrDate },
        },
        select: { pitchId: true },
      });
      const blockedPitchIds = await tx.blockedDate.findMany({
        where: {
          pitchId: { in: pitchType.pitches.map(p => p.id) },
          date: { gte: arrDate, lt: depDate },
        },
        select: { pitchId: true },
      });
      const unavailable = new Set([
        ...bookedPitchIds.map(b => b.pitchId),
        ...blockedPitchIds.map(b => b.pitchId),
      ]);
      const freePitch = pitchType.pitches.find(p => !unavailable.has(p.id));
      if (!freePitch) throw new Error('UNAVAILABLE');

      const bookingRef = generateBookingRef();
      const booking = await tx.booking.create({
        data: {
          tenantId: tenant.id,
          pitchId: freePitch.id,
          guestName, guestEmail, guestPhone,
          arrivalDate: arrDate,
          departureDate: depDate,
          numAdults, numChildren: numChildren || 0,
          extras: selectedExtras || [],
          baseAmount, extrasAmount, totalAmount, platformFee,
          bookingRef,
          status: 'pending',
        },
      });
      return booking;
    });

    // Create Stripe Payment Intent
    const piParams = {
      amount: totalAmount,
      currency: 'gbp',
      payment_method: paymentMethodId,
      confirm: true,
      metadata: { bookingRef: result.bookingRef, bookingId: result.id },
      return_url: `${process.env.ADMIN_BASE_URL || 'https://campbook-production.up.railway.app'}/booking-confirmed`,
    };
    // Only use Connect split payments if campsite has a connected account
    if (tenant.stripeAccountId) {
      piParams.application_fee_amount = platformFee;
      piParams.transfer_data = { destination: tenant.stripeAccountId };
    }
    const paymentIntent = await getStripe().paymentIntents.create(piParams);

    // Update booking with payment intent
    await prisma.booking.update({
      where: { id: result.id },
      data: {
        stripePaymentIntentId: paymentIntent.id,
        status: paymentIntent.status === 'succeeded' ? 'confirmed' : 'pending',
      },
    });

    if (paymentIntent.status === 'succeeded') {
      await sendConfirmationEmails(result, tenant);
    }

    res.json({
      bookingRef: result.bookingRef,
      status: paymentIntent.status,
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    if (err.message === 'UNAVAILABLE') {
      return res.status(409).json({ message: 'No pitches available — please try different dates' });
    }
    console.error(err);
    res.status(500).json({ message: 'Booking failed', error: err.message });
  }
};

// ── Public: Get Booking by Ref ───────────────────────────────────────────────

export const getBookingByRef = async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { bookingRef: req.params.ref.toUpperCase() },
      include: { tenant: { select: { name: true, phone: true, email: true } }, pitch: true },
    });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Stripe: Webhook ──────────────────────────────────────────────────────────

export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const booking = await prisma.booking.findUnique({
      where: { stripePaymentIntentId: pi.id },
      include: { tenant: true },
    });
    if (booking && booking.status !== 'confirmed') {
      await prisma.booking.update({ where: { id: booking.id }, data: { status: 'confirmed' } });
      await sendConfirmationEmails(booking, booking.tenant);
    }
  } else if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object;
    await prisma.booking.updateMany({
      where: { stripePaymentIntentId: pi.id },
      data: { status: 'cancelled' },
    });
  }
  res.json({ received: true });
};

// ── Stripe: Connect Onboarding ───────────────────────────────────────────────

export const initiateStripeConnect = async (req, res) => {
  const { tenantId } = req.tenant;
  try {
    let tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    let accountId = tenant.stripeAccountId;

    if (!accountId) {
      const account = await getStripe().accounts.create({ type: 'express', country: 'GB', email: tenant.email });
      accountId = account.id;
      await prisma.tenant.update({ where: { id: tenantId }, data: { stripeAccountId: accountId } });
    }

    const accountLink = await getStripe().accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.ADMIN_BASE_URL}/admin/stripe`,
      return_url: `${process.env.ADMIN_BASE_URL}/api/stripe/connect/return`,
      type: 'account_onboarding',
    });
    res.json({ url: accountLink.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to initiate Stripe Connect' });
  }
};

export const handleStripeConnectReturn = async (req, res) => {
  const tenantId = req.tenant.id;
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (tenant.stripeAccountId) {
      const account = await getStripe().accounts.retrieve(tenant.stripeAccountId);
      if (account.details_submitted) {
        await prisma.tenant.update({ where: { id: tenantId }, data: { stripeOnboarded: true } });
      }
    }
    res.redirect('/admin/stripe');
  } catch (err) {
    res.redirect('/admin/stripe?error=1');
  }
};

// ── Public: Sign Up ───────────────────────────────────────────────────────────

export const signUp = async (req, res) => {
  const { campsiteName, email, password, plan } = req.body;
  if (!campsiteName || !email || !password) {
    return res.status(400).json({ message: 'Campsite name, email and password are required' });
  }
  try {
    const existing = await prisma.tenant.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ message: 'An account with this email already exists' });

    const slug = campsiteName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      + '-' + Math.random().toString(36).slice(2, 6);
    const hashed = await bcrypt.hash(password, 10);
    const now = new Date();
    const nextYear = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

    const tenant = await prisma.tenant.create({
      data: {
        name: campsiteName,
        slug,
        email,
        password: hashed,
        plan: plan || 'campbook_only',
        openingDate: now,
        closingDate: nextYear,
      }
    });

    const token = jwt.sign({ email: tenant.email, tenantId: tenant.id }, process.env.JWT_SECRET, { expiresIn: '8h' });

    // Send welcome email
    try {
      const resend = getResend();
      const widgetCode = `<div data-campbook-tenant="${slug}"></div>\n<script src="https://campbook.brightstacklabs.co.uk/widget.js"></script>`;
      await resend.emails.send({
        from: 'CampBook <info@brightstacklabs.co.uk>',
        to: email,
        subject: 'Welcome to CampBook — here\'s your booking widget',
        html: `<p>Hi there,</p>
<p>Welcome to CampBook! Your account for <strong>${campsiteName}</strong> is ready.</p>
<p><strong>Log in to your dashboard:</strong><br>
<a href="https://campbook.brightstacklabs.co.uk/admin">https://campbook.brightstacklabs.co.uk/admin</a></p>
<p><strong>Your widget embed code</strong> (paste into your website):<br>
<code style="background:#f3f4f6;padding:8px 12px;border-radius:6px;display:block;margin:8px 0">${widgetCode.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></p>
<p>Any questions, just reply to this email.</p>
<p>Steve<br>Bright Stack Labs</p>`,
      });
    } catch (e) { console.error('Welcome email failed:', e.message); }

    res.json({ token, tenantName: tenant.name, slug });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Admin: Login ─────────────────────────────────────────────────────────────

export const adminLogin = async (req, res) => {
  const { email, password } = req.body;
  try {
    const tenant = await prisma.tenant.findUnique({ where: { email } });
    if (!tenant) return res.status(400).json({ message: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, tenant.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ email: tenant.email, tenantId: tenant.id }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, tenantName: tenant.name });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Admin: Bookings ──────────────────────────────────────────────────────────

export const getAdminBookings = async (req, res) => {
  const { status, from, to } = req.query;
  try {
    const where = { tenantId: req.tenant.id };
    if (status) where.status = status;
    if (from || to) {
      where.arrivalDate = {};
      if (from) where.arrivalDate.gte = new Date(from);
      if (to) where.arrivalDate.lte = new Date(to);
    }
    const bookings = await prisma.booking.findMany({
      where, orderBy: { arrivalDate: 'asc' },
      include: { pitch: { include: { pitchType: true } } },
    });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAdminBooking = async (req, res) => {
  try {
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
      include: { pitch: { include: { pitchType: true } } },
    });
    if (!booking) return res.status(404).json({ message: 'Not found' });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const cancelBooking = async (req, res) => {
  try {
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
    });
    if (!booking) return res.status(404).json({ message: 'Not found' });
    if (booking.status === 'cancelled') return res.status(400).json({ message: 'Already cancelled' });

    if (booking.stripePaymentIntentId) {
      await getStripe().refunds.create({ payment_intent: booking.stripePaymentIntentId });
    }
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'cancelled' },
    });

    // Notify guest
    if (resend && booking.guestEmail) {
      await getResend().emails.send({
        from: 'CampBook <noreply@campbook.co.uk>',
        to: booking.guestEmail,
        subject: `Booking ${booking.bookingRef} Cancelled`,
        html: `<p>Hi ${booking.guestName},</p><p>Your booking <strong>${booking.bookingRef}</strong> has been cancelled. A refund has been issued if applicable.</p>`,
      });
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Admin: Pitch Types ───────────────────────────────────────────────────────

export const getPitchTypes = async (req, res) => {
  try {
    const types = await prisma.pitchType.findMany({
      where: { tenantId: req.tenant.id },
      include: { seasonalRates: true, _count: { select: { pitches: true } } },
    });
    res.json(types);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const createPitchType = async (req, res) => {
  try {
    const type = await prisma.pitchType.create({ data: { ...req.body, tenantId: req.tenant.id } });
    res.status(201).json(type);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updatePitchType = async (req, res) => {
  try {
    const type = await prisma.pitchType.updateMany({
      where: { id: req.params.id, tenantId: req.tenant.id },
      data: req.body,
    });
    res.json(type);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Admin: Pitches ───────────────────────────────────────────────────────────

export const getPitches = async (req, res) => {
  try {
    const pitches = await prisma.pitch.findMany({
      where: { tenantId: req.tenant.id },
      include: { pitchType: true },
    });
    res.json(pitches);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const createPitch = async (req, res) => {
  try {
    const pitch = await prisma.pitch.create({ data: { ...req.body, tenantId: req.tenant.id } });
    res.status(201).json(pitch);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updatePitch = async (req, res) => {
  try {
    const pitch = await prisma.pitch.updateMany({
      where: { id: req.params.id, tenantId: req.tenant.id },
      data: req.body,
    });
    res.json(pitch);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Admin: Blocked Dates ─────────────────────────────────────────────────────

export const getBlockedDates = async (req, res) => {
  try {
    const pitches = await prisma.pitch.findMany({ where: { tenantId: req.tenant.id }, select: { id: true } });
    const blocked = await prisma.blockedDate.findMany({
      where: { pitchId: { in: pitches.map(p => p.id) } },
      include: { pitch: true },
    });
    res.json(blocked);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const createBlockedDate = async (req, res) => {
  try {
    const pitch = await prisma.pitch.findFirst({ where: { id: req.body.pitchId, tenantId: req.tenant.id } });
    if (!pitch) return res.status(403).json({ message: 'Not your pitch' });
    const blocked = await prisma.blockedDate.create({ data: req.body });
    res.status(201).json(blocked);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteBlockedDate = async (req, res) => {
  try {
    await prisma.blockedDate.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Admin: Extras ────────────────────────────────────────────────────────────

export const getExtras = async (req, res) => {
  try {
    const extras = await prisma.extra.findMany({ where: { tenantId: req.tenant.id } });
    res.json(extras);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const createExtra = async (req, res) => {
  try {
    const extra = await prisma.extra.create({ data: { ...req.body, tenantId: req.tenant.id } });
    res.status(201).json(extra);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateExtra = async (req, res) => {
  try {
    const extra = await prisma.extra.updateMany({
      where: { id: req.params.id, tenantId: req.tenant.id },
      data: req.body,
    });
    res.json(extra);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Admin: Seasonal Rates ────────────────────────────────────────────────────

export const createSeasonalRate = async (req, res) => {
  try {
    const pitchType = await prisma.pitchType.findFirst({ where: { id: req.body.pitchTypeId, tenantId: req.tenant.id } });
    if (!pitchType) return res.status(403).json({ message: 'Not your pitch type' });
    const rate = await prisma.seasonalRate.create({ data: req.body });
    res.status(201).json(rate);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateSeasonalRate = async (req, res) => {
  try {
    const rate = await prisma.seasonalRate.update({ where: { id: req.params.id }, data: req.body });
    res.json(rate);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Admin: Settings ──────────────────────────────────────────────────────────

export const getSettings = async (req, res) => {
  const { password, stripeAccountId, ...safe } = req.tenant;
  res.json(safe);
};

export const updateSettings = async (req, res) => {
  const { password, stripeAccountId, stripeOnboarded, id, ...allowed } = req.body;
  try {
    const updated = await prisma.tenant.update({ where: { id: req.tenant.id }, data: allowed });
    const { password: p, stripeAccountId: s, ...safe } = updated;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Admin: Dashboard Stats ───────────────────────────────────────────────────

export const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [upcoming, monthlyBookings, totalRevenue] = await Promise.all([
      prisma.booking.findMany({
        where: { tenantId: req.tenant.id, status: 'confirmed', arrivalDate: { gte: now, lte: weekAhead } },
        include: { pitch: { include: { pitchType: true } } },
        orderBy: { arrivalDate: 'asc' }, take: 10,
      }),
      prisma.booking.count({ where: { tenantId: req.tenant.id, status: 'confirmed', createdAt: { gte: monthStart } } }),
      prisma.booking.aggregate({
        where: { tenantId: req.tenant.id, status: 'confirmed', createdAt: { gte: monthStart } },
        _sum: { totalAmount: true },
      }),
    ]);

    res.json({
      upcomingThisWeek: upcoming,
      bookingsThisMonth: monthlyBookings,
      revenueThisMonth: totalRevenue._sum.totalAmount || 0,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Email Helpers ────────────────────────────────────────────────────────────

async function sendConfirmationEmails(booking, tenant) {
  if (!process.env.RESEND_API_KEY) return;
  const fmt = (p) => `£${(p / 100).toFixed(2)}`;
  const html = `
    <h2>Booking Confirmed — ${booking.bookingRef}</h2>
    <p>Hi ${booking.guestName}, your booking at <strong>${tenant.name}</strong> is confirmed.</p>
    <ul>
      <li>Arrival: ${booking.arrivalDate.toDateString()}</li>
      <li>Departure: ${booking.departureDate.toDateString()}</li>
      <li>Total paid: ${fmt(booking.totalAmount)}</li>
    </ul>
    <p>Contact the site: ${tenant.phone} | ${tenant.email}</p>
  `;
  await Promise.allSettled([
    resend.emails.send({ from: 'CampBook <noreply@campbook.co.uk>', to: booking.guestEmail, subject: `Booking ${booking.bookingRef} Confirmed`, html }),
    resend.emails.send({ from: 'CampBook <noreply@campbook.co.uk>', to: tenant.email, subject: `New Booking — ${booking.bookingRef}`, html: `<p>New booking from ${booking.guestName}.</p>${html}` }),
  ]);
}
