import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FunctionsService } from './functions.service';

@ApiTags('User Functions')
@Controller('functions')
export class FunctionsController {
  constructor(private readonly functionsService: FunctionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get list of available user-defined functions and signatures' })
  getCatalog() {
    return this.functionsService.getCatalog();
  }

  @Get('sample-data')
  @ApiOperation({ summary: 'Get sample parameters for testing functions' })
  getSampleData() {
    return this.functionsService.getSampleData();
  }

  @Post('preview')
  @ApiOperation({ summary: 'Get preview tables and exact SQL before running function' })
  async getPreview(
    @Body()
    body: {
      function_id: string;
      params?: Record<string, any>;
    },
  ) {
    return this.functionsService.getFunctionPreview(body.function_id, body.params || {});
  }

  @Post('calculate-parts-total')
  @ApiOperation({ summary: 'Execute dbo.fn_calculate_parts_total' })
  async calculatePartsTotal(@Body() body: { invoice_id: number }) {
    return this.functionsService.executeCalculatePartsTotal(body);
  }

  @Post('is-device-under-warranty')
  @ApiOperation({ summary: 'Execute dbo.fn_is_device_under_warranty' })
  async isDeviceUnderWarranty(@Body() body: { device_id: number; check_date?: string }) {
    return this.functionsService.executeIsDeviceUnderWarranty(body);
  }

  @Post('device-repair-history')
  @ApiOperation({ summary: 'Execute dbo.fn_get_device_repair_history' })
  async getDeviceRepairHistory(@Body() body: { device_id: number }) {
    return this.functionsService.executeGetDeviceRepairHistory(body);
  }
}

