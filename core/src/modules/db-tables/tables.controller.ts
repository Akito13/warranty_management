import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { TablesService } from './tables.service';

@ApiTags('Database Tables')
@Public()
@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  @ApiOperation({ summary: 'Get list of core tables and total row counts' })
  async getTablesOverview() {
    return this.tablesService.getTablesOverview();
  }

  @Get(':tableName')
  @ApiOperation({ summary: 'Get paginated rows and schema from a table' })
  async getTableData(
    @Param('tableName') tableName: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.tablesService.getTableData(tableName, Number(page) || 1, Number(limit) || 20, search);
  }
}

