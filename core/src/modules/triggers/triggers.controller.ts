import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TriggersService } from './triggers.service';

@ApiTags('Triggers')
@Controller('triggers')
export class TriggersController {
  constructor(private readonly triggersService: TriggersService) {}

  @Get()
  @ApiOperation({ summary: 'Get list of triggers and their test scenarios' })
  getCatalog() {
    return this.triggersService.getCatalog();
  }

  @Get('sample-data')
  @ApiOperation({ summary: 'Get sample database rows suitable for trigger tests' })
  getSampleData() {
    return this.triggersService.getSampleData();
  }

  @Get('preview')
  @ApiOperation({ summary: 'Get preview tables and exact SQL statement before running trigger' })
  async getPreview(
    @Query('trigger_id') trigger_id: string,
    @Query('scenario_id') scenario_id: string,
  ) {
    return this.triggersService.getTriggerPreview(trigger_id, scenario_id);
  }

  @Post('test')
  @ApiOperation({ summary: 'Execute an isolated trigger test scenario' })
  async executeTest(
    @Body()
    body: {
      trigger_id: string;
      scenario_id: string;
      params?: Record<string, any>;
    },
  ) {
    return this.triggersService.executeTriggerScenario(body);
  }
}

