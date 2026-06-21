import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios from 'axios';
import { randomUUID } from 'node:crypto';
import nodemailer, { Transporter } from 'nodemailer';
import {
  BookingPaymentStatus,
  CreateBookingDto,
} from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  PaymentStatus,
  Prisma,
} from '../../../../prisma/generated/prisma/client';

export interface ExternalTimeslot {
  start_time: string;
  end_time: string;
}

interface EmailBooking extends CreateBookingDto {}

@Injectable()
export class BookingService {
  constructor(private readonly prisma: PrismaService) {}

  async findAvailableTimeslots() {
    const timeslotsApi =
      process.env.READDY_TIMESLOTS_API ||
      'https://readdy.ai/api/public/calendar/timeslots/32d14abe-426b-4b1c-b8ab-9b069b8a5627.54c62550c35f1b35b5a7f93adfb9a9c1dbfbc20abc737bd9a6d49c897df8989d';

    try {
      const response = await axios.get<ExternalTimeslot[] | {
        timeslots?: ExternalTimeslot[];
      }>(timeslotsApi);
      const raw = response.data;
      const slots = Array.isArray(raw) ? raw : raw.timeslots || [];
      const bookedStarts = await this.prisma.booking.findMany({
        select: { startTime: true },
      });
      const reserved = new Set(
        bookedStarts.map((booking) => booking.startTime.getTime()),
      );

      return slots.filter((slot) => {
        try {
          return !reserved.has(this.parseDateTime(slot.start_time).getTime());
        } catch {
          return false;
        }
      });
    } catch (error) {
      throw new BadGatewayException(
        error instanceof Error
          ? `Availability request failed: ${error.message}`
          : 'Availability request failed.',
      );
    }
  }

  async create(createBookingDto: CreateBookingDto) {
    const startTime = this.parseDateTime(createBookingDto.startTime);
    const endTime = this.parseDateTime(createBookingDto.endTime);
    if (endTime <= startTime) {
      throw new BadRequestException('endTime must be after startTime.');
    }

    const transporter = this.createTransporter();
    try {
      await transporter.verify();
    } catch {
      throw new ServiceUnavailableException(
        'Email SMTP settings are invalid or unavailable.',
      );
    }

    let bookingId: string | undefined;
    try {
      const booking = await this.prisma.booking.create({
        data: {
          customerName: createBookingDto.customerName.trim(),
          customerEmail: createBookingDto.customerEmail.trim(),
          customerPhone: createBookingDto.customerPhone.trim(),
          address: createBookingDto.address.trim(),
          city: createBookingDto.city.trim(),
          zipCode: createBookingDto.zipCode.trim(),
          services: createBookingDto.services.trim(),
          price: new Prisma.Decimal(createBookingDto.price),
          startTime,
          endTime,
          paymentStatus: this.toPaymentStatus(
            createBookingDto.paymentStatus,
          ),
        },
      });
      bookingId = booking.id;

      await this.sendBookingEmails(createBookingDto, transporter);
      return { ok: true, bookingId };
    } catch (error) {
      if (bookingId) {
        await this.prisma.booking
          .delete({ where: { id: bookingId } })
          .catch(() => undefined);
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'That appointment time was just booked. Please choose another time.',
        );
      }
      throw error;
    }
  }

  findAll() {
    return this.prisma.booking.findMany({
      orderBy: { startTime: 'asc' },
    });
  }

  async findOne(id: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found.');
    return booking;
  }

  async update(id: string, updateBookingDto: UpdateBookingDto) {
    await this.findOne(id);
    const data: Prisma.BookingUpdateInput = {
      ...updateBookingDto,
      price:
        updateBookingDto.price === undefined
          ? undefined
          : new Prisma.Decimal(updateBookingDto.price),
      startTime: updateBookingDto.startTime
        ? this.parseDateTime(updateBookingDto.startTime)
        : undefined,
      endTime: updateBookingDto.endTime
        ? this.parseDateTime(updateBookingDto.endTime)
        : undefined,
      paymentStatus: updateBookingDto.paymentStatus
        ? this.toPaymentStatus(updateBookingDto.paymentStatus)
        : undefined,
    };
    return this.prisma.booking.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.booking.delete({ where: { id } });
  }

  private parseDateTime(value: string) {
    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid calendar date/time: ${value}`);
    }
    return date;
  }

  private toPaymentStatus(status: BookingPaymentStatus): PaymentStatus {
    const statuses: Record<BookingPaymentStatus, PaymentStatus> = {
      'pay-on-service-day': PaymentStatus.PAY_ON_SERVICE_DAY,
      'payment-pending': PaymentStatus.PAYMENT_PENDING,
      'quote-requested': PaymentStatus.QUOTE_REQUESTED,
      paid: PaymentStatus.PAID,
      pending: PaymentStatus.PENDING,
      cancelled: PaymentStatus.CANCELLED,
    };
    return statuses[status];
  }

  private createTransporter() {
    const host = process.env.EMAIL_HOST;
    const user = process.env.EMAIL_ADDRESS;
    const pass = process.env.EMAIL_PASS;
    if (!host || !user || !pass) {
      throw new ServiceUnavailableException(
        'Email SMTP settings are not configured.',
      );
    }

    return nodemailer.createTransport({
      host,
      port: Number(process.env.EMAIL_PORT || 587),
      secure: String(process.env.EMAIL_SECURE).toLowerCase() === 'true',
      auth: { user, pass },
    });
  }

  private async sendBookingEmails(
    booking: EmailBooking,
    transporter: Transporter,
  ) {
    const companyName = process.env.COMPANY_NAME || 'Supreme Steam';
    const organizerEmail =
      process.env.ORGANIZER_EMAIL ||
      process.env.EMAIL_ADDRESS ||
      'sauravsarkar.developer@gmail.com';
    const calendarContent = this.buildCalendarInvite(booking);
    const from = `"${companyName}" <${
      process.env.EMAIL_FROM || process.env.EMAIL_ADDRESS
    }>`;
    const subject = `${companyName} booking - ${this.money(booking.price)}`;

    await Promise.all([
      transporter.sendMail({
        from,
        to: booking.customerEmail,
        subject,
        html: this.bookingHtml(booking, 'customer'),
        icalEvent: { method: 'REQUEST', content: calendarContent },
      }),
      transporter.sendMail({
        from,
        to: organizerEmail,
        cc: process.env.ADMIN_EMAIL || undefined,
        subject: `New ${subject}`,
        html: this.bookingHtml(booking, 'organizer'),
        icalEvent: { method: 'REQUEST', content: calendarContent },
      }),
    ]);
  }

  private buildCalendarInvite(booking: EmailBooking) {
    const companyName = process.env.COMPANY_NAME || 'Supreme Steam';
    const organizerEmail =
      process.env.ORGANIZER_EMAIL || process.env.EMAIL_ADDRESS || '';
    const timezone = process.env.BOOKING_TIMEZONE || 'America/Los_Angeles';
    const location = [booking.address, booking.city, booking.zipCode]
      .filter(Boolean)
      .join(', ');
    const description = [
      `Customer: ${booking.customerName}`,
      `Email: ${booking.customerEmail}`,
      `Phone: ${booking.customerPhone}`,
      `Services: ${booking.services}`,
      `Estimated price: ${this.money(booking.price)}`,
      `Payment status: ${booking.paymentStatus}`,
    ].join('\n');

    return [
      'BEGIN:VCALENDAR',
      'PRODID:-//Supreme Steam//Booking//EN',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${randomUUID()}@supremesteam.com`,
      `DTSTAMP:${new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z')}`,
      `DTSTART;TZID=${timezone}:${this.calendarDate(booking.startTime)}`,
      `DTEND;TZID=${timezone}:${this.calendarDate(booking.endTime)}`,
      `SUMMARY:${this.escapeIcs(
        `${companyName} Booking - ${this.money(booking.price)}`,
      )}`,
      `DESCRIPTION:${this.escapeIcs(description)}`,
      `LOCATION:${this.escapeIcs(location)}`,
      `ORGANIZER;CN=${this.escapeIcs(
        companyName,
      )}:mailto:${organizerEmail}`,
      `ATTENDEE;CN=${this.escapeIcs(
        booking.customerName,
      )};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${booking.customerEmail}`,
      `ATTENDEE;CN=${this.escapeIcs(
        companyName,
      )};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${organizerEmail}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'BEGIN:VALARM',
      'TRIGGER:-PT30M',
      'ACTION:DISPLAY',
      'DESCRIPTION:Appointment reminder',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  private bookingHtml(
    booking: EmailBooking,
    recipient: 'customer' | 'organizer',
  ) {
    const companyName = process.env.COMPANY_NAME || 'Supreme Steam';
    const organizerEmail =
      process.env.ORGANIZER_EMAIL || process.env.EMAIL_ADDRESS || '';
    const location = [booking.address, booking.city, booking.zipCode]
      .filter(Boolean)
      .join(', ');
    const intro =
      recipient === 'customer'
        ? `Hi ${this.escapeHtml(
            booking.customerName,
          )}, your booking request is confirmed.`
        : `A new booking was created by ${this.escapeHtml(
            booking.customerName,
          )}.`;

    return `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#111827">
        <h2 style="color:#0066CC">${this.escapeHtml(companyName)} Booking Confirmation</h2>
        <p>${intro}</p>
        <table style="width:100%;border-collapse:collapse">
          <tr><td><strong>Date/time</strong></td><td>${this.escapeHtml(booking.startTime)} – ${this.escapeHtml(booking.endTime)}</td></tr>
          <tr><td><strong>Services</strong></td><td>${this.escapeHtml(booking.services)}</td></tr>
          <tr><td><strong>Estimated price</strong></td><td>${this.money(booking.price)}</td></tr>
          <tr><td><strong>Address</strong></td><td>${this.escapeHtml(location)}</td></tr>
          <tr><td><strong>Phone</strong></td><td>${this.escapeHtml(booking.customerPhone)}</td></tr>
          <tr><td><strong>Client email</strong></td><td>${this.escapeHtml(booking.customerEmail)}</td></tr>
          <tr><td><strong>Organizer email</strong></td><td>${this.escapeHtml(organizerEmail)}</td></tr>
          <tr><td><strong>Status</strong></td><td>${this.escapeHtml(booking.paymentStatus)}</td></tr>
        </table>
        <div style="margin:24px 0;text-align:center">
          <a href="${this.escapeHtml(
            this.buildGoogleCalendarUrl(booking, recipient),
          )}" target="_blank" rel="noopener noreferrer"
            style="display:inline-block;background:#0066CC;color:#fff;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:700">
            Add to Google Calendar
          </a>
        </div>
      </div>
    `;
  }

  private buildGoogleCalendarUrl(
    booking: EmailBooking,
    recipient: 'customer' | 'organizer',
  ) {
    const companyName = process.env.COMPANY_NAME || 'Supreme Steam';
    const organizerEmail =
      process.env.ORGANIZER_EMAIL || process.env.EMAIL_ADDRESS || '';
    const timezone = process.env.BOOKING_TIMEZONE || 'America/Los_Angeles';
    const location = [booking.address, booking.city, booking.zipCode]
      .filter(Boolean)
      .join(', ');
    const guestEmail =
      recipient === 'customer' ? organizerEmail : booking.customerEmail;
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: `${companyName} Booking - ${this.money(booking.price)}`,
      dates: `${this.calendarDate(booking.startTime)}/${this.calendarDate(
        booking.endTime,
      )}`,
      ctz: timezone,
      details: [
        `Customer: ${booking.customerName}`,
        `Client email: ${booking.customerEmail}`,
        `Phone: ${booking.customerPhone}`,
        `Services: ${booking.services}`,
        `Estimated price: ${this.money(booking.price)}`,
        `Payment status: ${booking.paymentStatus}`,
      ].join('\n'),
      location,
      add: guestEmail,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  private calendarDate(value: string) {
    const match = value.match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/,
    );
    if (!match) {
      throw new BadRequestException(`Invalid calendar date/time: ${value}`);
    }
    const [, year, month, day, hour, minute, second = '00'] = match;
    return `${year}${month}${day}T${hour}${minute}${second}`;
  }

  private money(value: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  }

  private escapeIcs(value = '') {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  private escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
