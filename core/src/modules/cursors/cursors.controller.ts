import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CursorsService } from './cursors.service';

@ApiTags('Cursors')
@Controller('cursors')
export class CursorsController {
  constructor(private readonly cursorsService: CursorsService) {}

  @Get()
  @ApiOperation({ summary: 'Get list of cursor-based operations and metadata' })
  getCatalog() {
    return this.cursorsService.getCatalog();
  }

  @Post('audit-invoices')
  @ApiOperation({ summary: 'Execute dbo.sp_audit_invoices (cur_invoices cursor)' })
  async auditInvoices(@Body() body: { auto_fix?: boolean }) {
    return this.cursorsService.executeAuditInvoices(body);
  }

  @Post('delayed-tickets')
  @ApiOperation({ summary: 'Execute dbo.sp_alert_delayed_tickets (cur_delayed_tickets cursor)' })
  async alertDelayedTickets(@Body() body: { delay_days?: number }) {
    return this.cursorsService.executeAlertDelayedTickets(body);
  }
}

