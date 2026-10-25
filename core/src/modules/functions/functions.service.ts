import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface FunctionCatalogItem {
  id: string;
  name: string;
  sqlName: string;
  type: 'scalar' | 'table_valued';
  returnType: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
    defaultValue?: any;
  }>;
}

export interface FunctionTableComparison {
  tableName: string;
  tableTitle: string;
  description?: string;
  highlightColumns?: string[];
  beforeRows: Record<string, any>[];
  afterRows?: Record<string, any>[];
  statusNote?: string;
}

export interface FunctionPreviewResult {
  exactSql: string;
  targetDesc: string;
  tables: FunctionTableComparison[];
}

@Injectable()
export class FunctionsService {
  private readonly logger = new Logger(FunctionsService.name);

  constructor(private readonly dataSource: DataSource) {}

  getCatalog(): FunctionCatalogItem[] {
    return [
      {
        id: 'fn_calculate_parts_total',
        name: 'Tính Tổng Tiền Linh Kiện Hóa Đơn',
        sqlName: 'dbo.fn_calculate_parts_total',
        type: 'scalar',
        returnType: 'DECIMAL(18,2)',
        description:
          'Hàm vô hướng (scalar function) tính tổng giá trị toàn bộ phụ tùng/linh kiện đã sử dụng trong một hóa đơn cụ thể bằng công thức SUM(quantity * unit_price). Trả về 0 nếu chưa dùng linh kiện nào.',
        parameters: [
          { name: 'invoice_id', type: 'number', required: true, description: 'ID hóa đơn cần tính tiền phụ tùng' },
        ],
      },
      {
        id: 'fn_is_device_under_warranty',
        name: 'Kiểm Tra Tình Trạng Hạn Bảo Hành Thiết Bị',
        sqlName: 'dbo.fn_is_device_under_warranty',
        type: 'scalar',
        returnType: 'BIT (1 = Còn hạn, 0 = Hết hạn)',
        description:
          'Hàm vô hướng kiểm tra thiết bị có còn trong thời hạn bảo hành hợp lệ tại thời điểm chỉ định hay không dựa vào cờ is_under_warranty và ngày hết hạn warranty_expiry_date.',
        parameters: [
          { name: 'device_id', type: 'number', required: true, description: 'ID thiết bị cần tra cứu bảo hành' },
          { name: 'check_date', type: 'date', required: false, description: 'Ngày đối soát kiểm tra (mặc định hôm nay)' },
        ],
      },
      {
        id: 'fn_get_device_repair_history',
        name: 'Tra Cứu Toàn Bộ Lịch Sử Sửa Chữa Thiết Bị',
        sqlName: 'dbo.fn_get_device_repair_history',
        type: 'table_valued',
        returnType: 'TABLE (Bảng dữ liệu)',
        description:
          'Hàm trả về bảng (inline table-valued) chứa đầy đủ lịch sử tất cả các lần tiếp nhận, chẩn đoán, kỹ thuật viên phụ trách, hóa đơn và trạng thái thanh toán của thiết bị.',
        parameters: [
          { name: 'device_id', type: 'number', required: true, description: 'ID thiết bị cần tra cứu lịch sử' },
        ],
      },
    ];
  }

  async getSampleData() {
    const invoicesWithParts = await this.dataSource.query(`
      SELECT DISTINCT TOP 5 i.id, i.ticket_id, i.labor_fee, i.discount_amount, i.total_amount,
        (SELECT COUNT(1) FROM invoice_items WHERE invoice_id = i.id) AS item_count
      FROM invoices i
      JOIN invoice_items ii ON ii.invoice_id = i.id
      ORDER BY i.id DESC
    `);

    const devices = await this.dataSource.query(`
      SELECT TOP 5 id, device_name, serial_number, is_under_warranty, 
             FORMAT(warranty_expiry_date, 'yyyy-MM-dd') AS warranty_expiry_date
      FROM devices 
      ORDER BY id ASC
    `);

    return {
      invoicesWithParts,
      devices,
    };
  }

  /**
   * Preview trạng thái bảng trước khi thực thi hàm
   */
  async getFunctionPreview(functionId: string, params: Record<string, any>): Promise<FunctionPreviewResult> {
    switch (functionId) {
      case 'fn_calculate_parts_total': {
        let invoiceId = Number(params.invoice_id);
        if (!invoiceId) {
          const inv = await this.dataSource.query(`SELECT TOP 1 invoice_id FROM invoice_items ORDER BY invoice_id DESC`);
          invoiceId = inv?.[0]?.invoice_id || 18;
        }

        const items = await this.dataSource.query(`
          SELECT ii.id, ii.invoice_id, ii.part_id, p.part_name, ii.quantity, ii.unit_price, ii.total_price
          FROM invoice_items ii
          JOIN parts p ON p.id = ii.part_id
          WHERE ii.invoice_id = @0
        `, [invoiceId]);

        const exactSql = `-- Gọi hàm vô hướng tính tổng tiền phụ tùng của Hóa đơn #${invoiceId}
SELECT dbo.fn_calculate_parts_total(${invoiceId}) AS parts_total;`;

        return {
          exactSql,
          targetDesc: `Hàm: fn_calculate_parts_total | Hóa đơn: #${invoiceId} (${items.length} linh kiện)`,
          tables: [
            {
              tableName: 'invoice_items',
              tableTitle: `Bảng nguồn dữ liệu: invoice_items (Hóa đơn #${invoiceId})`,
              description: 'Danh sách linh kiện trong hóa đơn mà hàm sẽ đọc từng dòng để tính SUM(total_price)',
              highlightColumns: ['quantity', 'unit_price', 'total_price'],
              beforeRows: items,
            },
          ],
        };
      }

      case 'fn_is_device_under_warranty': {
        let deviceId = Number(params.device_id);
        if (!deviceId) {
          const dev = await this.dataSource.query(`SELECT TOP 1 id FROM devices ORDER BY id ASC`);
          deviceId = dev?.[0]?.id || 1;
        }

        const checkDate = params.check_date || new Date().toISOString().split('T')[0];

        const deviceRows = await this.dataSource.query(`
          SELECT id, device_name, serial_number, is_under_warranty, 
                 FORMAT(warranty_expiry_date, 'yyyy-MM-dd') AS warranty_expiry_date
          FROM devices WHERE id = @0
        `, [deviceId]);

        const exactSql = `-- Gọi hàm kiểm tra hạn bảo hành thiết bị #${deviceId} tại thời điểm ${checkDate}
SELECT dbo.fn_is_device_under_warranty(${deviceId}, '${checkDate}') AS is_under_warranty;`;

        return {
          exactSql,
          targetDesc: `Hàm: fn_is_device_under_warranty | Thiết bị: #${deviceId} (${deviceRows?.[0]?.device_name || 'Device'}) | Ngày kiểm tra: ${checkDate}`,
          tables: [
            {
              tableName: 'devices',
              tableTitle: `Bảng nguồn dữ liệu: devices (Thiết bị #${deviceId})`,
              description: 'Thông tin bảo hành lưu trong database của thiết bị',
              highlightColumns: ['is_under_warranty', 'warranty_expiry_date'],
              beforeRows: deviceRows,
            },
          ],
        };
      }

      case 'fn_get_device_repair_history': {
        let deviceId = Number(params.device_id);
        if (!deviceId) {
          const dev = await this.dataSource.query(`SELECT TOP 1 id FROM devices ORDER BY id ASC`);
          deviceId = dev?.[0]?.id || 1;
        }

        const deviceRows = await this.dataSource.query(`
          SELECT id, customer_id, device_name, brand, model, serial_number, is_under_warranty
          FROM devices WHERE id = @0
        `, [deviceId]);

        const exactSql = `-- Gọi hàm trả về bảng tra cứu toàn bộ lịch sử sửa chữa thiết bị #${deviceId}
SELECT * FROM dbo.fn_get_device_repair_history(${deviceId});`;

        return {
          exactSql,
          targetDesc: `Hàm: fn_get_device_repair_history | Thiết bị: #${deviceId} (${deviceRows?.[0]?.device_name || 'Device'})`,
          tables: [
            {
              tableName: 'devices',
              tableTitle: `Bảng nguồn dữ liệu: devices (Thiết bị #${deviceId})`,
              description: 'Thông tin thiết bị cần tra cứu lịch sử sửa chữa',
              highlightColumns: ['device_name', 'serial_number'],
              beforeRows: deviceRows,
            },
          ],
        };
      }

      default:
        throw new BadRequestException(`Không tìm thấy function: ${functionId}`);
    }
  }

  /**
   * 1. fn_calculate_parts_total
   */
  async executeCalculatePartsTotal(dto: { invoice_id: number }) {
    const beforeItems = await this.dataSource.query(
      `SELECT ii.id, ii.invoice_id, ii.part_id, p.part_name, ii.quantity, ii.unit_price, ii.total_price
       FROM invoice_items ii
       JOIN parts p ON p.id = ii.part_id
       WHERE ii.invoice_id = @0`,
      [dto.invoice_id],
    );

    const query = `SELECT dbo.fn_calculate_parts_total(@0) AS parts_total;`;
    const res = await this.dataSource.query(query, [dto.invoice_id]);
    const partsTotal = Number(res?.[0]?.parts_total ?? 0);

    const exactSql = `SELECT dbo.fn_calculate_parts_total(${dto.invoice_id}) AS parts_total;`;

    const afterRows = [
      {
        invoice_id: dto.invoice_id,
        item_count: beforeItems.length,
        calculated_parts_total: partsTotal,
        formula: 'SUM(quantity * unit_price)',
        evaluated_at: new Date().toISOString(),
      },
    ];

    return {
      functionName: 'dbo.fn_calculate_parts_total',
      invoiceId: dto.invoice_id,
      exactSql,
      result: {
        parts_total: partsTotal,
      },
      tables: [
        {
          tableName: 'invoice_items',
          tableTitle: `Bảng nguồn dữ liệu tham chiếu: invoice_items (Hóa đơn #${dto.invoice_id})`,
          description: 'Các bản ghi linh kiện gốc trong database mà hàm đọc để tính tổng',
          highlightColumns: ['quantity', 'unit_price', 'total_price'],
          beforeRows: beforeItems,
          afterRows: beforeItems,
          statusNote: `ℹ Dữ liệu nguồn trong bảng invoice_items của Hóa đơn #${dto.invoice_id}.`,
        },
        {
          tableName: 'scalar_function_output',
          tableTitle: 'Kết quả tính toán trả về từ hàm Scalar: fn_calculate_parts_total',
          description: 'Giá trị vô hướng (DECIMAL) được hàm trả về',
          highlightColumns: ['calculated_parts_total'],
          beforeRows: [],
          afterRows: afterRows,
          statusNote: `✓ Hàm trả về tổng tiền linh kiện: $${partsTotal.toFixed(2)}.`,
        },
      ],
      before: {
        items: beforeItems,
      },
      after: afterRows,
      message: `Hàm fn_calculate_parts_total đã tính tổng tiền phụ tùng của Hóa đơn #${dto.invoice_id}: $${partsTotal.toFixed(2)}.`,
    };
  }

  /**
   * 2. fn_is_device_under_warranty
   */
  async executeIsDeviceUnderWarranty(dto: { device_id: number; check_date?: string }) {
    const checkDate = dto.check_date || new Date().toISOString().split('T')[0];

    const beforeDevice = await this.dataSource.query(
      `SELECT id, device_name, serial_number, is_under_warranty, 
              FORMAT(warranty_expiry_date, 'yyyy-MM-dd') AS warranty_expiry_date
       FROM devices WHERE id = @0`,
      [dto.device_id],
    );

    const query = `SELECT dbo.fn_is_device_under_warranty(@0, @1) AS is_under_warranty;`;
    const res = await this.dataSource.query(query, [dto.device_id, checkDate]);
    const isUnderWarranty = Boolean(res?.[0]?.is_under_warranty);

    const exactSql = `SELECT dbo.fn_is_device_under_warranty(${dto.device_id}, '${checkDate}') AS is_under_warranty;`;

    const afterRows = [
      {
        device_id: dto.device_id,
        check_date: checkDate,
        warranty_expiry_date: beforeDevice?.[0]?.warranty_expiry_date || 'N/A',
        is_under_warranty_result: isUnderWarranty ? 1 : 0,
        verdict: isUnderWarranty ? 'CÒN HẠN BẢO HÀNH (Active Warranty)' : 'HẾT HẠN / KHÔNG BẢO HÀNH (Expired)',
      },
    ];

    return {
      functionName: 'dbo.fn_is_device_under_warranty',
      deviceId: dto.device_id,
      checkDate,
      exactSql,
      result: {
        is_under_warranty: isUnderWarranty,
      },
      tables: [
        {
          tableName: 'devices',
          tableTitle: `Bảng nguồn dữ liệu tham chiếu: devices (Thiết bị #${dto.device_id})`,
          description: 'Thông tin bảo hành của thiết bị được lưu trữ trong database',
          highlightColumns: ['is_under_warranty', 'warranty_expiry_date'],
          beforeRows: beforeDevice,
          afterRows: beforeDevice,
          statusNote: `ℹ Thông tin thiết bị trong cơ sở dữ liệu.`,
        },
        {
          tableName: 'scalar_function_output',
          tableTitle: 'Kết quả thẩm định trả về từ hàm Scalar: fn_is_device_under_warranty',
          description: 'Giá trị vô hướng BIT (1/0) trả về',
          highlightColumns: ['is_under_warranty_result', 'verdict'],
          beforeRows: [],
          afterRows: afterRows,
          statusNote: isUnderWarranty
            ? '✓ Thiết bị đang trong thời hạn bảo hành hợp lệ (Trả về: 1).'
            : '✓ Thiết bị đã hết hạn bảo hành hoặc không có gói bảo hành (Trả về: 0).',
        },
      ],
      before: {
        device: beforeDevice,
      },
      after: afterRows,
      message: `Hàm fn_is_device_under_warranty trả về: ${isUnderWarranty ? '1 (Còn bảo hành)' : '0 (Hết hạn)'}.`,
    };
  }

  /**
   * 3. fn_get_device_repair_history
   */
  async executeGetDeviceRepairHistory(dto: { device_id: number }) {
    const beforeDevice = await this.dataSource.query(
      `SELECT id, customer_id, device_name, brand, model, serial_number, is_under_warranty
       FROM devices WHERE id = @0`,
      [dto.device_id],
    );

    const query = `SELECT * FROM dbo.fn_get_device_repair_history(@0);`;
    const historyRows = await this.dataSource.query(query, [dto.device_id]);

    const exactSql = `SELECT * FROM dbo.fn_get_device_repair_history(${dto.device_id});`;

    return {
      functionName: 'dbo.fn_get_device_repair_history',
      deviceId: dto.device_id,
      exactSql,
      totalTicketsFound: historyRows.length,
      tables: [
        {
          tableName: 'devices',
          tableTitle: `Bảng nguồn dữ liệu tham chiếu: devices (Thiết bị #${dto.device_id})`,
          description: 'Thông tin cơ bản của thiết bị cần tra cứu lịch sử sửa chữa',
          highlightColumns: ['device_name', 'serial_number'],
          beforeRows: beforeDevice,
          afterRows: beforeDevice,
          statusNote: `ℹ Thông tin thiết bị #${dto.device_id} trong database.`,
        },
        {
          tableName: 'table_valued_function_output',
          tableTitle: `Bảng kết quả trả về từ Table-Valued Function: fn_get_device_repair_history (Thiết bị #${dto.device_id})`,
          description: 'Bảng bản ghi lịch sử tất cả các lượt sửa chữa, kỹ thuật viên phụ trách, hóa đơn và trạng thái',
          highlightColumns: ['ticket_id', 'status', 'issue_description', 'technician_name', 'total_amount', 'invoice_status'],
          beforeRows: [],
          afterRows: historyRows,
          statusNote: `✓ Hàm dạng bảng đã trả về ${historyRows.length} lượt sửa chữa của thiết bị #${dto.device_id}.`,
        },
      ],
      before: {
        device: beforeDevice,
      },
      after: historyRows,
      message: `Hàm fn_get_device_repair_history đã trả về ${historyRows.length} lượt sửa chữa của thiết bị #${dto.device_id}.`,
    };
  }
}
