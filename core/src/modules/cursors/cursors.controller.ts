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

  @Post('preview')
  @ApiOperation({ summary: 'Get preview tables and exact SQL before running cursor' })
  async getPreview(
    @Body()
    body: {
      cursor_id: string;
      params?: Record<string, any>;
    },
  ) {
    return this.cursorsService.getCursorPreview(body.cursor_id, body.params || {});
  }

  @Post('simulate-discrepancy')
  @ApiOperation({ summary: 'Simulate data discrepancy on an unpaid invoice for cursor testing' })
  async simulateDiscrepancy() {
    return this.cursorsService.simulateDiscrepancy();
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

