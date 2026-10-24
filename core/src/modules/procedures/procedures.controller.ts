import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { ProceduresService } from './procedures.service';

@ApiTags('Stored Procedures')
@Public()
@Controller('procedures')
export class ProceduresController {
  constructor(private readonly proceduresService: ProceduresService) {}

  @Get()
  @ApiOperation({ summary: 'Get list of available business stored procedures and parameter schema' })
  getCatalog() {
    return this.proceduresService.getCatalog();
  }

  @Get('sample-data')
  @ApiOperation({ summary: 'Get live sample data for testing stored procedures' })
  getSampleData() {
    return this.proceduresService.getSampleData();
  }

  @Post('receive-device')
  @ApiOperation({ summary: 'Execute dbo.sp_receive_device' })
  async receiveDevice(
    @Body()
    body: {
      device_id: number;
      receptionist_id: number;
      issue_description: string;
      initial_condition?: string;
      accessories?: string;
      ticket_type?: string;
    },
  ) {
    return this.proceduresService.executeReceiveDevice(body);
  }

  @Post('process-ticket')
  @ApiOperation({ summary: 'Execute dbo.sp_process_ticket' })
  async processTicket(
    @Body()
    body: {
      ticket_id: number;
      status: string;
      technician_id?: number;
      fault_cause?: string;
      repair_solution?: string;
      estimated_cost?: number;
    },
  ) {
    return this.proceduresService.executeProcessTicket(body);
  }

  @Post('create-invoice')
  @ApiOperation({ summary: 'Execute dbo.sp_create_invoice' })
  async createInvoice(
    @Body()
    body: {
      ticket_id: number;
      labor_fee?: number;
    },
  ) {
    return this.proceduresService.executeCreateInvoice(body);
  }

  @Post('add-invoice-part')
  @ApiOperation({ summary: 'Execute dbo.sp_add_invoice_part' })
  async addInvoicePart(
    @Body()
    body: {
      invoice_id: number;
      part_id: number;
      quantity: number;
    },
  ) {
    return this.proceduresService.executeAddInvoicePart(body);
  }

  @Post('checkout-invoice')
  @ApiOperation({ summary: 'Execute dbo.sp_checkout_invoice' })
  async checkoutInvoice(
    @Body()
    body: {
      invoice_id: number;
      payment_method?: string;
    },
  ) {
    return this.proceduresService.executeCheckoutInvoice(body);
  }
}

