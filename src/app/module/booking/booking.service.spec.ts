import axios from 'axios';
import { BookingService } from './booking.service';

jest.mock('axios');
jest.mock('../../../prisma/prisma.service', () => ({
  PrismaService: class {},
}));
jest.mock('../../../../prisma/generated/prisma/client', () => ({
  PaymentStatus: {
    PAY_ON_SERVICE_DAY: 'PAY_ON_SERVICE_DAY',
    PAYMENT_PENDING: 'PAYMENT_PENDING',
    QUOTE_REQUESTED: 'QUOTE_REQUESTED',
    PAID: 'PAID',
    PENDING: 'PENDING',
    CANCELLED: 'CANCELLED',
  },
  Prisma: {
    Decimal: class {
      constructor(readonly value: number) {}
    },
    PrismaClientKnownRequestError: class extends Error {},
  },
}));

const mockedAxios = jest.mocked(axios);

describe('BookingService', () => {
  const originalTimezone = process.env.BOOKING_TIMEZONE;
  const originalTimeslotsApi = process.env.READDY_TIMESLOTS_API;

  afterEach(() => {
    if (originalTimezone === undefined) {
      delete process.env.BOOKING_TIMEZONE;
    } else {
      process.env.BOOKING_TIMEZONE = originalTimezone;
    }
    if (originalTimeslotsApi === undefined) {
      delete process.env.READDY_TIMESLOTS_API;
    } else {
      process.env.READDY_TIMESLOTS_API = originalTimeslotsApi;
    }
    jest.resetAllMocks();
  });

  it('filters booked slots using the calendar timezone', async () => {
    process.env.BOOKING_TIMEZONE = 'America/Los_Angeles';
    process.env.READDY_TIMESLOTS_API = 'https://example.test/timeslots ';
    mockedAxios.get.mockResolvedValue({
      data: [
        {
          start_time: '2026-07-12 09:00:00',
          end_time: '2026-07-12 10:00:00',
        },
      ],
    });
    const prisma = {
      booking: {
        findMany: jest.fn().mockResolvedValue([
          {
            startTime: new Date('2026-07-12T03:00:00Z'),
            endTime: new Date('2026-07-12T06:00:00Z'),
          },
        ]),
      },
    };
    const service = new BookingService(prisma as never);

    const slots = await service.findAvailableTimeslots();

    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/example\.test\/timeslots\?_=\d+$/),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        }),
      }),
    );
    expect(slots).toEqual([
      {
        start_time: '2026-07-12 08:00:00',
        end_time: '2026-07-12 10:00:00',
      },
      {
        start_time: '2026-07-12 09:00:00',
        end_time: '2026-07-12 12:00:00',
      },
      {
        start_time: '2026-07-12 11:00:00',
        end_time: '2026-07-12 14:00:00',
      },
      {
        start_time: '2026-07-12 14:00:00',
        end_time: '2026-07-12 17:00:00',
      },
    ]);
  });

  it('removes blocks that overlap an existing booking', async () => {
    process.env.BOOKING_TIMEZONE = 'America/Los_Angeles';
    mockedAxios.get.mockResolvedValue({
      data: [
        {
          start_time: '2026-07-12 09:00:00',
          end_time: '2026-07-12 10:00:00',
        },
      ],
    });
    const prisma = {
      booking: {
        findMany: jest.fn().mockResolvedValue([
          {
            startTime: new Date('2026-07-12T16:00:00Z'),
            endTime: new Date('2026-07-12T19:00:00Z'),
          },
        ]),
      },
    };
    const service = new BookingService(prisma as never);

    await expect(service.findAvailableTimeslots()).resolves.toEqual([
      {
        start_time: '2026-07-12 14:00:00',
        end_time: '2026-07-12 17:00:00',
      },
    ]);
  });
});
