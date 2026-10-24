import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { TriggersService } from './triggers.service';

@ApiTags('Triggers')
@Public()
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

