const fs = require('fs');
const path = require('path');

const reportServicePath = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'services',
  'reportService.js'
);

const source =
  fs.readFileSync(
    reportServicePath,
    'utf8'
  );

function section(startMarker, endMarker) {
  const start =
    source.indexOf(startMarker);

  const end =
    source.indexOf(
      endMarker,
      start
    );

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('report PDF branding contract', () => {
  test('uses repeated subtle watermarks across A4 report pages', () => {
    expect(source).toContain(
      'const watermarkColumns = 3;'
    );

    expect(source).toContain(
      'const watermarkRows = 5;'
    );

    expect(source).toContain(
      'doc.opacity(0.055);'
    );

    expect(source).toContain(
      'doc.rotate('
    );
  });

  test('uses the approved logo-wordmark lockup without a second AgentPro heading', () => {
    expect(source).toContain(
      'function drawReportBrandLockup('
    );

    const business = section(
      'async function generateTransactionReportPDF',
      '// ── Transaction Report Excel'
    );

    const commission = section(
      'async function generateCommissionReportPDF',
      '// ── Commission Report Excel'
    );

    const personal = section(
      'async function generatePersonalTransactionReportPDF',
      '// ── CSV Generator'
    );

    for (const report of [
      business,
      commission,
      personal,
    ]) {
      expect(report).toContain(
        'drawReportBrandLockup('
      );

      expect(report).not.toMatch(
        /\.text\(\s*['"]AgentPro['"]/
      );
    }
  });
});
