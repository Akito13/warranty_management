import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';
import { TransformResponseInterceptor } from '@/common/interceptors/transform-response.interceptor';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { appConfig } from '@/config/app.config';
import { corsConfig } from '@/config/cors.config';
import { databaseConfig } from '@/config/database.config';
import {
  CustomerEntity,
  DeviceEntity,
  EmployeeEntity,
  InvoiceEntity,
  InvoiceItemEntity,
  PartEntity,
  TicketEntity,
  TicketStatusHistoryEntity,
} from '@/database/entities';
import { TablesModule } from '@/modules/db-tables/tables.module';
import { ProceduresModule } from '@/modules/procedures/procedures.module';
import { FunctionsModule } from '@/modules/functions/functions.module';
import { CursorsModule } from '@/modules/cursors/cursors.module';
import { TriggersModule } from '@/modules/triggers/triggers.module';

/**
 * Root Application Module orchestrating MSSQL connection,
 * global interceptors/filters, and database workbench feature modules.
 */
@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, corsConfig],
    }),

    // TypeORM with MSSQL
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbConfig = config.get('database');
        return {
          ...dbConfig,
          entities: [
            CustomerEntity,
            EmployeeEntity,
            DeviceEntity,
            PartEntity,
            TicketEntity,
            InvoiceEntity,
            InvoiceItemEntity,
            TicketStatusHistoryEntity,
          ],
        };
      },
    }),

    // Rate Limiting (100 req/minute baseline for internal API safety)
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Active Feature Modules for Database Operations & Demo
    TablesModule,
    ProceduresModule,
    FunctionsModule,
    CursorsModule,
    TriggersModule,
  ],
  providers: [
    // Global Exception Filter
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    // Global Rate Limiting Guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global Response Serialization Interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformResponseInterceptor,
    },
    // Global HTTP Logging Interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
