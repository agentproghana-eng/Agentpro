const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { query } = require('../config/database');
const { uploadPDF } = require('../config/cloudinary');
const { logger } = require('../utils/logger');
const path = require('path');
const LOGO_PATH = path.join(__dirname, '..', 'agentpro-logo-transparent.png');
const WATERMARK_PATH = path.join(__dirname, '..', 'agentpro-watermark.png');

const GHS = (n) => `GH₵ ${parseFloat(n || 0).toFixed(2)}`;
const dateStr = (d) => d ? new Date(d).toLocaleDateString('en-GH') : '—';
const dateTimeStr = (d) => d ? new Date(d).toLocaleString('en-GH') : '—';

// ── Brand Colors ──────────────────────────────────────────────
const COLORS = {
  primary: '#006B5E',
  secondary: '#FFB300',
  text: '#1A1A1A',
  muted: '#666666',
  light: '#F5F5F5',
  success: '#2E7D32',
  error: '#BA1A1A',
  warning: '#E65100', // matches AppTheme.warningColor in the Flutter app — keep in sync
};

// Maps a transaction status to its display color consistently across
// every report/receipt in this file, so a status never silently reads
// as a binary success/failure by accident (e.g. pending_confirmation
// must never render the same color as a definite failure — see
// migration 002_ussd_single_dial_redesign.sql for why that distinction
// matters).
function statusColor(status) {
  if (status === 'success') return COLORS.success;
  if (status === 'pending_confirmation' || status === 'processing' || status === 'initiated') return COLORS.warning;
  return COLORS.error; // failed, reversed, or any unrecognized status
}

// ── Watermark ───────────────────────────────────────────────────
// Draws the full logo (shield + wordmark) faintly behind page content,
// rotated diagonally. Only used on the full A4 reports (Transaction,
// Commission) — deliberately NOT on the small A6 receipt, which is
// meant to be a clean, minimal document handed to a customer.
// Must be called before any other content is drawn on the page, since
// pdfkit draws in z-order and the watermark needs to sit underneath
// the header/table, not on top of it.
function drawWatermark(doc) {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const wmWidth = 260;
  const wmHeight = wmWidth * (154 / 544); // matches the asset's actual aspect ratio
  const centerX = pageWidth / 2;
  const centerY = pageHeight / 2;

  doc.save();
  doc.opacity(0.12);
  doc.rotate(-30, { origin: [centerX, centerY] });
  try {
    doc.image(WATERMARK_PATH, centerX - wmWidth / 2, centerY - wmHeight / 2, { width: wmWidth });
  } catch (e) {
    logger.warn('Watermark image not found, skipping:', e.message);
  }
  doc.restore();
  doc.opacity(1);
}

// ── Transaction Receipt PDF ───────────────────────────────────

async function generateTransactionReceipt(transaction) {
  // Defense-in-depth: the current (and only) caller already gates this
  // to confirmed successes only, but a "receipt" is a formal document
  // that can outlive the app session and be shown to a customer or used
  // in a dispute. If some future caller (e.g. an admin "regenerate
  // receipt" action) ever invokes this directly without re-checking
  // status first, a pending_confirmation transaction must never be
  // rendered as a binary success/failure receipt — we genuinely don't
  // know the outcome, and a formal document saying "FAILED" could be
  // actively wrong if the transaction actually succeeded.
  if (transaction.status !== 'success') {
    logger.warn(`generateTransactionReceipt called for non-success transaction ${transaction.id} (status: ${transaction.status}) — refusing to generate a misleading receipt`);
    return null;
  }

  try {
    const doc = new PDFDocument({ size: 'A6', margin: 20 });
    const buffers = [];
    doc.on('data', b => buffers.push(b));

    await new Promise((resolve) => {
      doc.on('end', resolve);
      doc.rect(0, 0, doc.page.width, 60).fill(COLORS.primary);
      try { doc.image(LOGO_PATH, 20, 8, { height: 24 }); } catch (e) { logger.warn('Logo image not found, skipping:', e.message); }
      doc.fillColor('white').fontSize(14).font('Helvetica-Bold')
        .text('Agent Pro Ghana', 50, 15);
      doc.fontSize(8).font('Helvetica')
        .text('Transaction Receipt', 50, 33);
      doc.fillColor(COLORS.text);
      doc.moveDown(2);

      doc.fontSize(11).fillColor(COLORS.success).font('Helvetica-Bold')
        .text('✓ Transaction Successful', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(22).fillColor(COLORS.text).font('Helvetica-Bold')
        .text(GHS(transaction.amount), { align: 'center' });
      doc.fontSize(9).fillColor(COLORS.muted).font('Helvetica')
        .text((transaction.transaction_type || '').replace(/_/g, ' ').toUpperCase(), { align: 'center' });

      doc.moveDown(0.5);
      doc.moveTo(20, doc.y).lineTo(doc.page.width - 20, doc.y)
        .strokeColor(COLORS.light).stroke();
      doc.moveDown(0.5);

      const details = [
        ['Reference', transaction.reference],
        ['Network Ref', transaction.network_reference || '—'],
        ['Provider', (transaction.provider || '').toUpperCase()],
        ['Customer', transaction.customer_phone || '—'],
        ['Date', dateTimeStr(transaction.created_at)],
      ];
      details.forEach(([label, val]) => {
        doc.fontSize(8).fillColor(COLORS.muted).font('Helvetica')
          .text(label, 20, doc.y, { width: 100, continued: true });
        doc.fillColor(COLORS.text).font('Helvetica-Bold').text(String(val));
        doc.moveDown(0.3);
      });

      doc.moveTo(20, doc.page.height - 40).lineTo(doc.page.width - 20, doc.page.height - 40)
        .strokeColor(COLORS.light).stroke();
      doc.fontSize(7).fillColor(COLORS.muted).font('Helvetica')
        .text('Thank you for using Agent Pro Ghana',
          20, doc.page.height - 32, { align: 'center' });
      doc.text('support@agentproghana.com', { align: 'center' });

      doc.end();
    });

    return Buffer.concat(buffers);
  } catch (error) {
    logger.error('Receipt generation error:', error);
    return null;
  }
}

// ── Transaction Report PDF ─────────────────────────────────────

async function generateTransactionReportPDF({ transactions, filters, summary, title }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const buffers = [];
  doc.on('data', b => buffers.push(b));

  await new Promise((resolve) => {
    doc.on('end', resolve);

    drawWatermark(doc);

    // Header
    doc.rect(0, 0, doc.page.width, 70).fill(COLORS.primary);
    try { doc.image(LOGO_PATH, 15, 15, { height: 40 }); } catch (e) { logger.warn('Logo image not found, skipping:', e.message); }
    doc.fillColor(COLORS.secondary).fontSize(18).font('Helvetica-Bold')
      .text('Agent Pro Ghana', 40, 15);
    doc.fillColor('white').fontSize(11).font('Helvetica')
      .text(title || 'Transaction Report', 40, 35);
    doc.fontSize(9)
      .text(`Generated: ${dateTimeStr(new Date())}`, 40, 52);
    doc.fillColor(COLORS.text);
    doc.moveDown(2.5);

    // Summary Cards
    const summaries = [
      ['Total Transactions', summary.count || 0],
      ['Total Amount', GHS(summary.total_amount)],
      ['Net Commission', GHS(summary.total_commission)],
      ['Success Rate', `${summary.success_rate || 0}%`],
    ];

    const cardWidth = (doc.page.width - 80 - 30) / 4;
    summaries.forEach(([label, value], i) => {
      const x = 40 + i * (cardWidth + 10);
      const y = doc.y;
      doc.rect(x, y, cardWidth, 48).fill(COLORS.light);
      doc.fontSize(7).fillColor(COLORS.muted).font('Helvetica')
        .text(label, x + 6, y + 8, { width: cardWidth - 12 });
      doc.fontSize(12).fillColor(COLORS.primary).font('Helvetica-Bold')
        .text(String(value), x + 6, y + 20, { width: cardWidth - 12 });
    });

    doc.moveDown(3.5);

    // Table Header
    const cols = [
      { label: 'Date', width: 55 },
      { label: 'Reference', width: 75 },
      { label: 'Type', width: 55 },
      { label: 'Provider', width: 45 },
      { label: 'Customer', width: 65 },
      { label: 'Agent', width: 65 },
      { label: 'Amount', width: 60 },
      { label: 'Status', width: 95 },
    ];

    doc.rect(40, doc.y, doc.page.width - 80, 18).fill(COLORS.primary);
    let x = 40;
    cols.forEach(col => {
      doc.fontSize(7.5).fillColor('white').font('Helvetica-Bold')
        .text(col.label, x + 4, doc.y - 14, { width: col.width - 4 });
      x += col.width;
    });
    doc.moveDown(0.2);

    // Table rows
    transactions.forEach((tx, idx) => {
      if (doc.y > doc.page.height - 80) {
        doc.addPage();
        doc.moveDown(1);
      }

      const rowY = doc.y;
      if (idx % 2 === 0) {
        doc.rect(40, rowY, doc.page.width - 80, 16).fill('#FAFAFA');
      }

      const rowData = [
        dateStr(tx.created_at),
        tx.reference,
        (tx.transaction_type || '').replace('_', ' '),
        (tx.provider || '').toUpperCase(),
        tx.customer_phone || '—',
        tx.agent_name || '—',
        GHS(tx.amount),
        (tx.status || '').toUpperCase(),
      ];

      x = 40;
      rowData.forEach((val, i) => {
        const color = i === 7 ? statusColor(tx.status) : COLORS.text;
        doc.fontSize(7).fillColor(color).font('Helvetica')
          .text(val, x + 4, rowY + 4, { width: cols[i].width - 4 });
        x += cols[i].width;
      });

      doc.y = rowY + 18;
    });

    doc.end();
  });

  return Buffer.concat(buffers);
}

// ── Transaction Report Excel ──────────────────────────────────

async function generateTransactionReportExcel({ transactions, filters, summary, title }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Agent Pro Ghana';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Transactions', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  });

  // Title
  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').value = title || 'Agent Pro Ghana — Transaction Report';
  sheet.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FF006B5E' } };
  sheet.getCell('A1').alignment = { horizontal: 'center' };
  sheet.mergeCells('A2:H2');
  sheet.getCell('A2').value = `Generated: ${dateTimeStr(new Date())}`;
  sheet.getCell('A2').font = { size: 9, color: { argb: 'FF666666' } };
  sheet.getCell('A2').alignment = { horizontal: 'center' };

  // Summary row
  sheet.addRow([]);
  sheet.addRow(['Summary']);
  sheet.addRow(['Total Transactions', summary.count, '', 'Total Amount', `GH₵ ${parseFloat(summary.total_amount||0).toFixed(2)}`, '', 'Net Commission', `GH₵ ${parseFloat(summary.total_commission||0).toFixed(2)}`]);
  sheet.addRow([]);

  // Headers
  const headerRow = sheet.addRow([
    'Date', 'Reference', 'Network Ref', 'Transaction Type',
    'Provider', 'Customer Phone', 'Customer Name', 'Amount (GH₵)',
    'Commission (GH₵)', 'Status', 'Agent', 'Branch',
  ]);
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006B5E' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.border = { bottom: { style: 'thin' } };
  });

  // Data rows
  transactions.forEach((tx, i) => {
    const row = sheet.addRow([
      tx.created_at ? new Date(tx.created_at) : '',
      tx.reference,
      tx.network_reference || '',
      (tx.transaction_type || '').replace(/_/g, ' '),
      (tx.provider || '').toUpperCase(),
      tx.customer_phone || '',
      tx.customer_name || '',
      parseFloat(tx.amount || 0),
      parseFloat(tx.net_commission || 0),
      (tx.status || '').toUpperCase(),
      tx.agent_name || '',
      tx.branch_name || '',
    ]);

    if (i % 2 === 0) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      });
    }
  });

  sheet.columns.forEach(col => { col.width = 16; });

  return await workbook.xlsx.writeBuffer();
}

// ── Commission Report PDF ──────────────────────────────────────

async function generateCommissionReportPDF({ commissions, summary, title, groupBy }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const buffers = [];
  doc.on('data', b => buffers.push(b));

  await new Promise((resolve) => {
    doc.on('end', resolve);

    drawWatermark(doc);

    doc.rect(0, 0, doc.page.width, 70).fill(COLORS.primary);
    try { doc.image(LOGO_PATH, 15, 15, { height: 40 }); } catch (e) { logger.warn('Logo image not found, skipping:', e.message); }
    doc.fillColor(COLORS.secondary).fontSize(18).font('Helvetica-Bold')
      .text('Agent Pro Ghana', 40, 15);
    doc.fillColor('white').fontSize(11).font('Helvetica')
      .text(title || 'Commission Report', 40, 35);
    doc.fontSize(9).text(`Generated: ${dateTimeStr(new Date())}`, 40, 52);
    doc.fillColor(COLORS.text);
    doc.moveDown(3);

    // Summary
    doc.fontSize(9).font('Helvetica-Bold').text('Summary');
    doc.moveDown(0.3);
    [
      ['Gross Commission:', GHS(summary.total_gross)],
      ['Provider Share:', GHS(summary.total_provider_share)],
      ['Net Commission:', GHS(summary.total_net)],
      ['Transactions:', String(summary.transaction_count || 0)],
    ].forEach(([label, val]) => {
      doc.fontSize(8).fillColor(COLORS.muted).font('Helvetica')
        .text(label, 40, doc.y, { width: 140, continued: true });
      doc.fillColor(COLORS.text).font('Helvetica-Bold').text(val);
      doc.moveDown(0.2);
    });

    doc.moveDown(1);

    // Table
    const cols = [
      { label: groupBy === 'agent' ? 'Agent' : groupBy === 'branch' ? 'Branch' : 'Period', width: 140 },
      { label: 'Transactions', width: 80 },
      { label: 'Gross', width: 85 },
      { label: 'Provider Share', width: 90 },
      { label: 'Net Commission', width: 100 },
    ];

    doc.rect(40, doc.y, doc.page.width - 80, 18).fill(COLORS.primary);
    let x = 40;
    cols.forEach(col => {
      doc.fontSize(7.5).fillColor('white').font('Helvetica-Bold')
        .text(col.label, x + 4, doc.y - 14, { width: col.width - 4 });
      x += col.width;
    });
    doc.moveDown(0.2);

    commissions.forEach((row, idx) => {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const rowY = doc.y;
      if (idx % 2 === 0) doc.rect(40, rowY, doc.page.width - 80, 16).fill('#FAFAFA');

      const vals = [
        row.label || row.period || '—',
        String(row.transaction_count || 0),
        GHS(row.total_gross),
        GHS(row.total_provider_share),
        GHS(row.total_net),
      ];

      x = 40;
      vals.forEach((val, i) => {
        doc.fontSize(7.5).fillColor(COLORS.text).font('Helvetica')
          .text(val, x + 4, rowY + 4, { width: cols[i].width - 4 });
        x += cols[i].width;
      });
      doc.y = rowY + 18;
    });

    doc.end();
  });

  return Buffer.concat(buffers);
}

// ── CSV Generator ─────────────────────────────────────────────

function generateCSV(data, columns) {
  const header = columns.map(c => `"${c.label}"`).join(',');
  const rows = data.map(row => columns.map(c => {
    const val = c.getValue ? c.getValue(row) : row[c.key];
    return `"${String(val ?? '').replace(/"/g, '""')}"`;
  }).join(','));
  return [header, ...rows].join('\n');
}

module.exports = {
  generateTransactionReceipt,
  generateTransactionReportPDF,
  generateTransactionReportExcel,
  generateCommissionReportPDF,
  generateCSV,
};
