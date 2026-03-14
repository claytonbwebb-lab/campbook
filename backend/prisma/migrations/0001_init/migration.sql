-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "region" TEXT,
    "stripe_account_id" TEXT,
    "stripe_onboarded" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT NOT NULL,
    "opening_date" DATE NOT NULL,
    "closing_date" DATE NOT NULL,
    "no_groups_policy" BOOLEAN NOT NULL DEFAULT false,
    "min_booker_age" INTEGER NOT NULL DEFAULT 18,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pitch_types" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "base_price_per_night" INTEGER NOT NULL,
    "max_occupancy" INTEGER NOT NULL,
    "max_vehicles" INTEGER NOT NULL,
    "ehu_included" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pitch_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasonal_rates" (
    "id" TEXT NOT NULL,
    "pitch_type_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "price_per_night" INTEGER NOT NULL,
    "min_stay_nights" INTEGER NOT NULL,

    CONSTRAINT "seasonal_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extras" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_per_night" INTEGER,
    "price_flat" INTEGER,
    "per_unit" BOOLEAN NOT NULL DEFAULT false,
    "max_units" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pitches" (
    "id" TEXT NOT NULL,
    "pitch_type_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pitches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "pitch_id" TEXT,
    "guest_name" TEXT NOT NULL,
    "guest_email" TEXT NOT NULL,
    "guest_phone" TEXT,
    "arrival_date" DATE NOT NULL,
    "departure_date" DATE NOT NULL,
    "num_adults" INTEGER NOT NULL,
    "num_children" INTEGER NOT NULL DEFAULT 0,
    "extras" JSONB NOT NULL DEFAULT '[]',
    "base_amount" INTEGER NOT NULL,
    "extras_amount" INTEGER NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "platform_fee" INTEGER NOT NULL,
    "stripe_payment_intent_id" TEXT,
    "stripe_transfer_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "booking_ref" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_dates" (
    "id" TEXT NOT NULL,
    "pitch_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,

    CONSTRAINT "blocked_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_email_key" ON "tenants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_stripe_payment_intent_id_key" ON "bookings"("stripe_payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_stripe_transfer_id_key" ON "bookings"("stripe_transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_booking_ref_key" ON "bookings"("booking_ref");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_dates_pitch_id_date_key" ON "blocked_dates"("pitch_id", "date");

-- AddForeignKey
ALTER TABLE "pitch_types" ADD CONSTRAINT "pitch_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasonal_rates" ADD CONSTRAINT "seasonal_rates_pitch_type_id_fkey" FOREIGN KEY ("pitch_type_id") REFERENCES "pitch_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extras" ADD CONSTRAINT "extras_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pitches" ADD CONSTRAINT "pitches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pitches" ADD CONSTRAINT "pitches_pitch_type_id_fkey" FOREIGN KEY ("pitch_type_id") REFERENCES "pitch_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pitch_id_fkey" FOREIGN KEY ("pitch_id") REFERENCES "pitches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_pitch_id_fkey" FOREIGN KEY ("pitch_id") REFERENCES "pitches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
