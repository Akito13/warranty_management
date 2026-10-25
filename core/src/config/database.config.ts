import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Extracts command-line flags in the form of --flag=value or --flag value
 */
function getCliArg(names: string[]): string | undefined {
  if (typeof process === 'undefined' || !process.argv) return undefined;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    for (const name of names) {
      if (arg.startsWith(`--${name}=`)) {
        return arg.substring(name.length + 3);
      }
      if (arg === `--${name}` && i + 1 < args.length && !args[i + 1].startsWith('--')) {
        return args[i + 1];
      }
    }
  }
  return undefined;
}

export const databaseConfig = registerAs('database', (): TypeOrmModuleOptions => {
  let rawHost = getCliArg(['db-host', 'db_host', 'db-server', 'db_server', 'server']) || process.env.DB_HOST || 'localhost';
  let instanceName = getCliArg(['db-instance', 'db_instance', 'instance']) || process.env.DB_INSTANCE;

  // Auto-detect named instances like "localhost\SQLEXPRESS" or ".\SQLEXPRESS"
  if (rawHost.includes('\\')) {
    const parts = rawHost.split('\\');
    rawHost = parts[0] === '.' ? 'localhost' : parts[0];
    if (!instanceName && parts[1]) {
      instanceName = parts[1];
    }
  } else if (rawHost === '.') {
    rawHost = 'localhost';
  }

  const portStr = getCliArg(['db-port', 'db_port', 'port']) || process.env.DB_PORT || '1433';
  const username = getCliArg(['db-user', 'db_user', 'db-username', 'db_username', 'user']) || process.env.DB_USERNAME || 'sa';
  const password = getCliArg(['db-pass', 'db_pass', 'db-password', 'db_password', 'password']) || process.env.DB_PASSWORD || 'Warranty@Pass123';
  const database = getCliArg(['db-name', 'db_name', 'db-database', 'db_database', 'database']) || process.env.DB_DATABASE || 'warranty_management';

  return {
    type: 'mssql',
    host: rawHost,
    port: instanceName ? undefined : parseInt(portStr, 10),
    username,
    password,
    database,
    entities: [__dirname + '/../database/entities/*.entity{.ts,.js}'],
    synchronize: false,
    logging: process.env.NODE_ENV === 'development',
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: true,
      ...(instanceName ? { instanceName } : {}),
    },
    extra: {
      connectionTimeout: 30000,
      requestTimeout: 30000,
    },
  };
});
