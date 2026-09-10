'use strict';

const { performance } = require('perf_hooks');

const {
  isApiRequestTelemetryStarted,
  recordApiRequest,
} = require(
  '../services/apiRequestTelemetryService'
);

function apiRequestTelemetry(req, res, next) {
  if (!isApiRequestTelemetryStarted()) {
    next();
    return;
  }

  const startedAt = performance.now();
  let recorded = false;

  function record({ aborted = false } = {}) {
    if (recorded) {
      return;
    }

    recorded = true;

    recordApiRequest({
      statusCode: res.statusCode,
      durationMs:
        performance.now() - startedAt,
      aborted,
    });
  }

  res.once('finish', () => {
    record();
  });

  res.once('close', () => {
    if (!res.writableEnded) {
      record({
        aborted: true,
      });
    }
  });

  next();
}

module.exports = apiRequestTelemetry;
