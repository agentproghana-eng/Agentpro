jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../src/config/cloudinary', () => ({
  uploadPDF: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const ExcelJS = require('exceljs');

const {
  generateTransactionReportPDF,
  generateTransactionReportExcel,
  generatePersonalTransactionReportPDF,
} = require('../../src/services/reportService');

function pdfPageCount(buffer) {
  const source = buffer.toString('latin1');
  return (source.match(/\/Type \/Page\b/g) || []).length;
}

describe('report PDF first-page layout', () => {
  test('Business transaction report starts on page one', async () => {
    const buffer = await generateTransactionReportPDF({
      transactions: [
        {
          created_at: '2026-08-27T00:00:00.000Z',
          reference: 'APG-TEST-001',
          transaction_type: 'balance_enquiry',
          provider: 'mtn',
          customer_phone: null,
          agent_name: 'Test Agent',
          amount: 0,
          fee: 0,
          status: 'failed',
          sim_slot: 0,
        },
      ],
      filters: {},
      summary: {
        count: 1,
        total_amount: 0,
        total_commission: 0,
        success_rate: 0,
      },
      title: 'Transaction Report',
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(pdfPageCount(buffer)).toBe(1);
  });

  test('Business report uses provider-aware transaction labels', async () => {
    const buffer =
      await generateTransactionReportExcel({
        transactions: [
          {
            created_at:
              '2026-08-27T00:00:00.000Z',
            reference:
              'APG-LABEL-001',
            transaction_type:
              'send_money',
            provider: 'mtn',
            amount: 100,
            fee: 1,
            status: 'success',
          },
          {
            created_at:
              '2026-08-27T00:01:00.000Z',
            reference:
              'APG-LABEL-002',
            transaction_type:
              'cash_in',
            provider: 'telecel',
            amount: 100,
            fee: 1,
            status: 'success',
          },
          {
            created_at:
              '2026-08-27T00:02:00.000Z',
            reference:
              'APG-LABEL-003',
            transaction_type:
              'cash_in',
            provider: 'at_money',
            amount: 100,
            fee: 1,
            status: 'success',
          },
        ],
        filters: {},
        summary: {
          count: 3,
          successful_transactions: 3,
          total_volume: 300,
          total_amount: 300,
          provider_commission: 0,
          agent_service_fees: 3,
          gross_earnings: 3,
          success_rate: 100,
        },
        title:
          'Monthly Business Transaction Report',
      });

    const workbook =
      new ExcelJS.Workbook();

    await workbook.xlsx.load(buffer);

    const sheet =
      workbook.getWorksheet(
        'Transactions'
      );

    expect(sheet).toBeDefined();

    let headerRowNumber;

    sheet.eachRow(
      (row, rowNumber) => {
        if (
          row.getCell(1).value ===
          'Date'
        ) {
          headerRowNumber =
            rowNumber;
        }
      }
    );

    expect(
      headerRowNumber
    ).toBeDefined();

    const mtn =
      sheet.getRow(
        headerRowNumber + 1
      );

    const telecel =
      sheet.getRow(
        headerRowNumber + 2
      );

    const atMoney =
      sheet.getRow(
        headerRowNumber + 3
      );

    expect(
      mtn.getCell(4).value
    ).toBe('Cash In');

    expect(
      mtn.getCell(5).value
    ).toBe('MTN');

    expect(
      telecel.getCell(4).value
    ).toBe('Deposit');

    expect(
      telecel.getCell(5).value
    ).toBe('Telecel');

    expect(
      atMoney.getCell(4).value
    ).toBe('Deposit');

    expect(
      atMoney.getCell(5).value
    ).toBe('AT Money');
  });

  test('Personal transaction report starts on page one', async () => {
    const buffer = await generatePersonalTransactionReportPDF({
      transactions: [
        {
          created_at: '2026-08-27T00:00:00.000Z',
          reference: 'APG-PERSONAL-001',
          transaction_type: 'buy_mashup',
          provider: 'mtn',
          recipient_phone: null,
          amount: 0,
          status: 'failed',
        },
      ],
      summary: {
        count: 1,
        success_count: 0,
        failed_count: 1,
        pending_count: 0,
      },
      title: 'My Transaction Report',
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(pdfPageCount(buffer)).toBe(1);
  });
});
