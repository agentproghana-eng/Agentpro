'use strict';

const EventEmitter = require('events');

jest.mock(
  '../../src/services/authPaystackTelemetryService',
  () => ({
    isAuthPaystackTelemetryStarted:
      jest.fn(),
    recordLoginResponse:
      jest.fn(),
  })
);

const {
  isAuthPaystackTelemetryStarted,
  recordLoginResponse,
} = require(
  '../../src/services/authPaystackTelemetryService'
);

const loginTelemetry = require(
  '../../src/middleware/loginTelemetry'
);

function createResponse() {
  const res = new EventEmitter();

  res.statusCode = 200;
  res.writableEnded = false;

  return res;
}

describe(
  'login telemetry middleware',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      isAuthPaystackTelemetryStarted
        .mockReturnValue(true);
    });

    test(
      'does nothing when telemetry is disabled',
      () => {
        isAuthPaystackTelemetryStarted
          .mockReturnValue(false);

        const res =
          createResponse();

        const next =
          jest.fn();

        loginTelemetry(
          {},
          res,
          next
        );

        expect(next)
          .toHaveBeenCalledTimes(1);

        expect(
          recordLoginResponse
        ).not.toHaveBeenCalled();

        expect(
          res.listenerCount('finish')
        ).toBe(0);

        expect(
          res.listenerCount('close')
        ).toBe(0);
      }
    );

    test(
      'records final response status on finish',
      () => {
        const res =
          createResponse();

        res.statusCode = 429;

        loginTelemetry(
          {},
          res,
          jest.fn()
        );

        res.writableEnded = true;
        res.emit('finish');

        expect(
          recordLoginResponse
        ).toHaveBeenCalledTimes(1);

        expect(
          recordLoginResponse
        ).toHaveBeenCalledWith({
          statusCode: 429,
          aborted: false,
        });
      }
    );

    test(
      'records premature close as aborted without status classification',
      () => {
        const res =
          createResponse();

        loginTelemetry(
          {},
          res,
          jest.fn()
        );

        res.emit('close');

        expect(
          recordLoginResponse
        ).toHaveBeenCalledTimes(1);

        expect(
          recordLoginResponse
        ).toHaveBeenCalledWith({
          aborted: true,
        });
      }
    );

    test(
      'does not record close after a completed response',
      () => {
        const res =
          createResponse();

        res.statusCode = 401;

        loginTelemetry(
          {},
          res,
          jest.fn()
        );

        res.writableEnded = true;

        res.emit('finish');
        res.emit('close');

        expect(
          recordLoginResponse
        ).toHaveBeenCalledTimes(1);

        expect(
          recordLoginResponse
        ).toHaveBeenCalledWith({
          statusCode: 401,
          aborted: false,
        });
      }
    );

    test(
      'does not double count close followed by finish',
      () => {
        const res =
          createResponse();

        loginTelemetry(
          {},
          res,
          jest.fn()
        );

        res.emit('close');

        res.statusCode = 200;
        res.writableEnded = true;
        res.emit('finish');

        expect(
          recordLoginResponse
        ).toHaveBeenCalledTimes(1);

        expect(
          recordLoginResponse
        ).toHaveBeenCalledWith({
          aborted: true,
        });
      }
    );
  }
);
