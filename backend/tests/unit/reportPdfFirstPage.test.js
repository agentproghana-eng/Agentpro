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

const {
  generateTransactionReportPDF,
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
