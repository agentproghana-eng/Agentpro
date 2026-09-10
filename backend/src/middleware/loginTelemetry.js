'use strict';

const {
  isAuthPaystackTelemetryStarted,
  recordLoginResponse,
} = require(
  '../services/authPaystackTelemetryService'
);

function loginTelemetry(req, res, next) {
  if (!isAuthPaystackTelemetryStarted()) {
    next();
    return;
  }

  let recorded = false;

  function record() {
    if (recorded) {
      return;
    }

    recorded = true;

    recordLoginResponse({
      statusCode: res.statusCode,
    });
  }

  res.once('finish', record);

  res.once('close', () => {
    if (!res.writableEnded) {
      record();
    }
  });

  next();
}

module.exports = loginTelemetry;
