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

  function recordCompleted() {
    if (recorded) {
      return;
    }

    recorded = true;

    recordLoginResponse({
      statusCode: res.statusCode,
      aborted: false,
    });
  }

  function recordAborted() {
    if (recorded) {
      return;
    }

    if (res.writableEnded) {
      return;
    }

    recorded = true;

    recordLoginResponse({
      aborted: true,
    });
  }

  res.once('finish', recordCompleted);
  res.once('close', recordAborted);

  next();
}

module.exports = loginTelemetry;
