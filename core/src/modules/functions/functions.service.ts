import { Injectable, Logger } from '@nestjs/common';
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
          'Hàm vô hướng tính tổng giá trị các linh kiện thay thế (SUM(quantity * unit_price)) của một hóa đơn cụ thể.',
        parameters: [
          { name: 'invoice_id', type: 'number', required: true, description: 'ID hóa đơn cần tính tiền linh kiện' },
        ],
      },
      {
        id: 'fn_is_device_under_warranty',
        name: 'Kiểm Tra Tình Trạng Bảo Hành Theo Ngày',
        sqlName: 'dbo.fn_is_device_under_warranty',
        type: 'scalar',
        returnType: 'BIT (1 hoặc 0)',
        description:
          'Hàm vô hướng xác định thiết bị có còn hạn bảo hành hợp lệ tại một ngày cụ thể hay không (dựa trên cờ is_under_warranty và ngày warranty_expiry_date).',
        parameters: [
          { name: 'device_id', type: 'number', required: true, description: 'ID thiết bị cần kiểm tra' },
          {
            name: 'check_date',
            type: 'date',
            required: true,
            defaultValue: new Date().toISOString().split('T')[0],
            description: 'Ngày cần kiểm tra hiệu lực bảo hành',
          },
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
   * 1. fn_calculate_parts_total
   */
  async executeCalculatePartsTotal(dto: { invoice_id: number }) {
    const beforeInvoice = await this.dataSource.query(
      `SELECT * FROM invoices WHERE id = @0`,
      [dto.invoice_id],
    );
    const beforeItems = await this.dataSource.query(
      `SELECT ii.id, ii.invoice_id, ii.part_id, p.part_name, ii.quantity, ii.unit_price, ii.total_price
       FROM invoice_items ii
       JOIN parts p ON p.id = ii.part_id
       WHERE ii.invoice_id = @0`,
      [dto.invoice_id],
    );

    const query = `SELECT dbo.fn_calculate_parts_total(@0) AS parts_total;`;
    const res = await this.dataSource.query(query, [dto.invoice_id]);
    const partsTotal = res?.[0]?.parts_total ?? 0;

    return {
      functionName: 'dbo.fn_calculate_parts_total',
      invoiceId: dto.invoice_id,
      result: {
        parts_total: Number(partsTotal),
      },
      before: {
        invoice: beforeInvoice,
        items: beforeItems,
      },
      after: [
        {
          invoice_id: dto.invoice_id,
          calculated_parts_total: Number(partsTotal),
          total_items: beforeItems.length,
          evaluation_time: new Date().toISOString(),
        },
      ],
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

    return {
      functionName: 'dbo.fn_is_device_under_warranty',
      deviceId: dto.device_id,
      checkDate,
      result: {
        is_under_warranty: isUnderWarranty,
      },
      before: {
        device: beforeDevice,
      },
      after: [
        {
          device_id: dto.device_id,
          check_date: checkDate,
          is_under_warranty: isUnderWarranty ? 1 : 0,
          status_text: isUnderWarranty ? 'Còn Hạn Bảo Hành (Active)' : 'Hết Hạn / Không Bảo Hành (Expired)',
        },
      ],
    };
  }

  /**
   * 3. fn_get_device_repair_history
   */
  async executeGetDeviceRepairHistory(dto: { device_id: number }) {
    const beforeDevice = await this.dataSource.query(
      `SELECT id, customer_id, device_name, serial_number, is_under_warranty
       FROM devices WHERE id = @0`,
      [dto.device_id],
    );

    const query = `SELECT * FROM dbo.fn_get_device_repair_history(@0) ORDER BY received_at DESC;`;
    const historyRows = await this.dataSource.query(query, [dto.device_id]);

    return {
      functionName: 'dbo.fn_get_device_repair_history',
      deviceId: dto.device_id,
      totalTickets: historyRows.length,
      before: {
        device: beforeDevice,
      },
      after: historyRows,
    };
  }
}
