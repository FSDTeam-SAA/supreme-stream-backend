ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'payment-pending';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'quote-requested';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'paid';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS "bookings_startTime_key"
ON "bookings"("startTime");
