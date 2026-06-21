import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Matches,
} from 'class-validator';

const bookingDateTimePattern =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/;

export const paymentStatuses = [
  'payment-pending',
  'pay-on-service-day',
  'quote-requested',
  'paid',
  'pending',
  'cancelled',
] as const;

export type BookingPaymentStatus = (typeof paymentStatuses)[number];

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @IsEmail()
  customerEmail!: string;

  @IsString()
  @IsNotEmpty()
  customerPhone!: string;

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  zipCode!: string;

  @IsString()
  @IsNotEmpty()
  services!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  price!: number;

  @IsString()
  @Matches(bookingDateTimePattern, {
    message: 'startTime must use YYYY-MM-DD HH:mm:ss format.',
  })
  startTime!: string;

  @IsString()
  @Matches(bookingDateTimePattern, {
    message: 'endTime must use YYYY-MM-DD HH:mm:ss format.',
  })
  endTime!: string;

  @IsIn(paymentStatuses)
  paymentStatus!: BookingPaymentStatus;
}
