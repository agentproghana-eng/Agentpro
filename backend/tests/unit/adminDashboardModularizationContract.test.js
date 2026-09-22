'use strict';

const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '../../..', relativePath),
    'utf8',
  );
}

describe('Admin Dashboard modularization contract', () => {
  const app = read('admin_portal/src/App.jsx');
  const dashboard = read(
    'admin_portal/src/features/dashboard/DashboardOperationalWidgets.jsx',
  );

  test('operational dashboard widgets are extracted from App.jsx', () => {
    for (const component of [
      'UssdFlowHealthToastWatcher',
      'UssdFlowHealthAlerts',
      'OperationalHealthWidget',
      'PendingRegistrationsWidget',
    ]) {
      expect(dashboard).toContain(`export function ${component}()`);
      expect(app).not.toContain(`function ${component}()`);
    }

    expect(app).toContain(
      "from './features/dashboard/DashboardOperationalWidgets.jsx'",
    );
    expect(app).toContain('function DashboardPage()');
  });

  test('dashboard operational module preserves live endpoints and shared client', () => {
    expect(dashboard).toContain("'/admin/ussd-flow-health'");
    expect(dashboard).toContain("'/admin/operational-status'");
    expect(dashboard).toContain("'/admin/pending-registrations'");
    expect(dashboard).toContain("from '../../lib/api.js'");
    expect(dashboard).not.toContain("from '../../App.jsx'");
    expect(dashboard).not.toContain("from 'axios'");
  });

  test('App.jsx is materially smaller after widget extraction', () => {
    expect(app.split('\n').length).toBeLessThan(6000);
  });
});
