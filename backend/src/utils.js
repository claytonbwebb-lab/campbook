// ── Booking Ref ──────────────────────────────────────────────────────────────
export function generateBookingRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'BK';
  for (let i = 0; i < 4; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

// ── Pricing ──────────────────────────────────────────────────────────────────

export function getNightlyRate(pitchType, date) {
  for (const rate of pitchType.seasonalRates || []) {
    const start = new Date(rate.startDate);
    const end = new Date(rate.endDate);
    if (date >= start && date <= end) return rate.pricePerNight;
  }
  return pitchType.basePricePerNight;
}

export function calculateBookingCost(pitchType, nights, selectedExtras, allExtras) {
  // Base: sum nightly rates
  let baseAmount = 0;
  const arrDate = new Date(); // placeholder — caller passes nights as int for simplicity
  for (let i = 0; i < nights; i++) {
    const d = new Date(arrDate.getTime() + i * 86400000);
    baseAmount += getNightlyRate(pitchType, d);
  }

  // Extras
  let extrasAmount = 0;
  for (const sel of selectedExtras) {
    const extra = allExtras.find(e => e.id === sel.id);
    if (!extra || !extra.active) continue;
    const qty = sel.quantity || 1;
    if (extra.pricePerNight) extrasAmount += extra.pricePerNight * nights * qty;
    else if (extra.priceFlat) extrasAmount += extra.priceFlat * qty;
  }

  return { baseAmount, extrasAmount, totalAmount: baseAmount + extrasAmount };
}

// ── Availability ─────────────────────────────────────────────────────────────

export async function getAvailablePitchTypes(tenant, arrDate, depDate, nights) {
  const { default: prisma } = await import('./prisma.js');

  const available = [];
  for (const pt of tenant.pitchTypes) {
    if (!pt.active) continue;
    const pitchIds = pt.pitches.map(p => p.id);
    if (!pitchIds.length) continue;

    const bookedPitchIds = await prisma.booking.findMany({
      where: {
        pitchId: { in: pitchIds },
        status: { in: ['pending', 'confirmed'] },
        arrivalDate: { lt: depDate },
        departureDate: { gt: arrDate },
      },
      select: { pitchId: true },
    });
    const blockedPitchIds = await prisma.blockedDate.findMany({
      where: { pitchId: { in: pitchIds }, date: { gte: arrDate, lt: depDate } },
      select: { pitchId: true },
    });

    const unavailable = new Set([
      ...bookedPitchIds.map(b => b.pitchId),
      ...blockedPitchIds.map(b => b.pitchId),
    ]);
    const freePitches = pt.pitches.filter(p => !unavailable.has(p.id));

    if (freePitches.length > 0) {
      // Check min stay from seasonal rates
      let minStay = 1;
      for (let i = 0; i < nights; i++) {
        const d = new Date(arrDate.getTime() + i * 86400000);
        for (const rate of pt.seasonalRates || []) {
          if (d >= new Date(rate.startDate) && d <= new Date(rate.endDate)) {
            minStay = Math.max(minStay, rate.minStayNights);
          }
        }
      }

      // Calculate price for the stay
      let totalPrice = 0;
      for (let i = 0; i < nights; i++) {
        const d = new Date(arrDate.getTime() + i * 86400000);
        totalPrice += getNightlyRate(pt, d);
      }

      available.push({
        id: pt.id,
        name: pt.name,
        description: pt.description,
        basePricePerNight: pt.basePricePerNight,
        totalPrice,
        avgPricePerNight: Math.round(totalPrice / nights),
        maxOccupancy: pt.maxOccupancy,
        maxVehicles: pt.maxVehicles,
        ehuIncluded: pt.ehuIncluded,
        availablePitches: freePitches.length,
        minStayNights: minStay,
      });
    }
  }
  return available;
}
