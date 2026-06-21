import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

@Controller()
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  @Get('timeslots')
  findAvailableTimeslots() {
    return this.bookingService.findAvailableTimeslots();
  }

  @Post('bookings')
  create(@Body() createBookingDto: CreateBookingDto) {
    return this.bookingService.create(createBookingDto);
  }

  @Get('bookings')
  findAll() {
    return this.bookingService.findAll();
  }

  @Get('bookings/:id')
  findOne(@Param('id') id: string) {
    return this.bookingService.findOne(id);
  }

  @Patch('bookings/:id')
  update(@Param('id') id: string, @Body() updateBookingDto: UpdateBookingDto) {
    return this.bookingService.update(id, updateBookingDto);
  }

  @Delete('bookings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.bookingService.remove(id);
  }
}
