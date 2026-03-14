import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcryptjs.hash('demo1234', 10);

  const demoTenant = await prisma.tenant.upsert({
    where: { slug: 'demo-campsite' },
    update: {},
    create: {
      name: 'Meadowbrook Caravan Park',
      slug: 'demo-campsite',
      email: 'admin@demo-campsite.com',
      phone: '01234 567890',
      address: 'Meadowbrook Lane, Countryside, AB12 3CD',
      region: 'North West',
      openingDate: new Date('2025-03-01'),
      closingDate: new Date('2025-10-31'),
      noGroupsPolicy: false,
      minBookerAge: 18,
      password: hashedPassword,
    },
  });
  console.log(`Tenant: ${demoTenant.name}`);

  const grassStandard = await prisma.pitchType.create({
    data: {
      tenantId: demoTenant.id, name: 'Grass Standard',
      description: 'Standard grass pitch for tents, caravans or motorhomes.',
      basePricePerNight: 2200, maxOccupancy: 4, maxVehicles: 1, ehuIncluded: false,
    },
  });
  const hardstanding = await prisma.pitchType.create({
    data: {
      tenantId: demoTenant.id, name: 'Hardstanding',
      description: 'All-weather hardstanding pitch with electric hook-up.',
      basePricePerNight: 2800, maxOccupancy: 4, maxVehicles: 1, ehuIncluded: true,
    },
  });
  const superPitch = await prisma.pitchType.create({
    data: {
      tenantId: demoTenant.id, name: 'Super Pitch',
      description: 'Spacious hardstanding with EHU, water point and waste disposal.',
      basePricePerNight: 3500, maxOccupancy: 6, maxVehicles: 2, ehuIncluded: true,
    },
  });

  for (let i = 1; i <= 5; i++) {
    await prisma.pitch.createMany({ data: [
      { tenantId: demoTenant.id, pitchTypeId: grassStandard.id, name: `Grass ${i}` },
      { tenantId: demoTenant.id, pitchTypeId: hardstanding.id, name: `Hardstanding ${i}` },
      { tenantId: demoTenant.id, pitchTypeId: superPitch.id, name: `Super Pitch ${i}` },
    ]});
  }
  console.log('Created 15 pitches');

  // Seasonal rates
  for (const pt of [grassStandard, hardstanding, superPitch]) {
    await prisma.seasonalRate.createMany({ data: [
      { pitchTypeId: pt.id, name: 'Peak', startDate: new Date('2025-07-15'), endDate: new Date('2025-08-31'), pricePerNight: pt.basePricePerNight + 800, minStayNights: 3 },
      { pitchTypeId: pt.id, name: 'Off-Peak', startDate: new Date('2025-10-01'), endDate: new Date('2026-02-28'), pricePerNight: Math.max(1000, pt.basePricePerNight - 500), minStayNights: 1 },
    ]});
  }
  console.log('Created seasonal rates');

  await prisma.extra.createMany({ data: [
    { tenantId: demoTenant.id, name: 'Extra Adult', pricePerNight: 500, perUnit: true, maxUnits: 2 },
    { tenantId: demoTenant.id, name: 'Child 5-15', pricePerNight: 300, perUnit: true, maxUnits: 3 },
    { tenantId: demoTenant.id, name: 'Dog', pricePerNight: 200, perUnit: true, maxUnits: 2 },
    { tenantId: demoTenant.id, name: 'Awning', pricePerNight: 300, perUnit: false, maxUnits: 1 },
    { tenantId: demoTenant.id, name: 'Extra Car', pricePerNight: 300, perUnit: true, maxUnits: 1 },
    { tenantId: demoTenant.id, name: 'EV Charge', priceFlat: 500, perUnit: false, maxUnits: 1 },
  ]});
  console.log('Created extras');
  console.log('\n✅ Seed complete. Admin login: admin@demo-campsite.com / demo1234');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
