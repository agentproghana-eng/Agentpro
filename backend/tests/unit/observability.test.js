'use strict';

const fs = require('fs');
const path = require('path');

describe('privacy-safe local backend telemetry', () => {
  test('server keeps request correlation and minimal request logging', () => {
    const server = fs.readFileSync(
      path.join(__dirname, '../../server.js'),
      'utf8',
    );

    const dotenvAt = server.indexOf("require('dotenv').config();");
    const expressAt = server.indexOf("require('express')");
    const requestIdAt = server.indexOf('uuidValidate(suppliedRequestId)');
    const morganAt = server.search(/morgan\s*\(/);

    expect(dotenvAt).toBeGreaterThanOrEqual(0);
    expect(expressAt).toBeGreaterThan(dotenvAt);

    expect(requestIdAt).toBeGreaterThanOrEqual(0);
    expect(morganAt).toBeGreaterThan(requestIdAt);

    expect(server).not.toMatch(/morgan\s*\(\s*["']combined["']/);

    expect(server).toContain(
      ':method :safe-path :status :response-time ms request_id=:request-id',
    );
  });

  test('global error logging keeps request correlation without user identity', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/middleware/errorHandler.js'),
      'utf8',
    );

    expect(source).toContain('requestId: req.requestId');
    expect(source).not.toContain('userId: req.user');
    expect(source).not.toContain('captureException(');
  });
});
