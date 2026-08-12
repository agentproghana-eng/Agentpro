const {
  EventEmitter,
} = require('events');


const mockQuery =
  jest.fn();

const mockStreamQueryBatches =
  jest.fn();

const mockGeneratePersonalTransactionReportPDFStream =
  jest.fn();


jest.mock(
  '../../src/config/database',
  () => ({
    query:
      (...args) =>
        mockQuery(
          ...args
        ),

    streamQueryBatches:
      (...args) =>
        mockStreamQueryBatches(
          ...args
        ),
  })
);


jest.mock(
  '../../src/utils/logger',
  () => ({
    logger: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
  })
);


jest.mock(
  '../../src/services/reportService',
  () => ({
    generatePersonalTransactionReportPDF:
      jest.fn(),

    generatePersonalTransactionReportPDFStream:
      (...args) =>
        mockGeneratePersonalTransactionReportPDFStream(
          ...args
        ),

    generateCSV:
      jest.fn(),
  })
);


const personalReportController =
  require(
    '../../src/controllers/personalReportController'
  );


function makeRes() {
  const res =
    new EventEmitter();

  res.headersSent = false;
  res.writableEnded = false;

  res.setHeader =
    jest.fn(() => {
      res.headersSent = true;
    });

  res.write =
    jest.fn(() => true);

  res.end =
    jest.fn(() => {
      res.writableEnded = true;
    });

  res.send =
    jest.fn();

  res.destroy =
    jest.fn();

  res.status =
    jest.fn()
      .mockReturnThis();

  res.json =
    jest.fn();

  return res;
}


function makeRow(index) {
  return {
    id:
      `personal-${index}`,

    created_at:
      '2026-08-12T10:00:00.000Z',

    reference:
      `PERSONAL-${index}`,

    network_reference:
      `NETWORK-${index}`,

    transaction_type:
      'buy_airtime',

    provider:
      'mtn',

    recipient_phone:
      '0240000000',

    amount:
      '10.00',

    status:
      'success',

    sim_iccid:
      `iccid-${index}`,
  };
}


describe(
  'personalReportController activity reporting',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();

      mockStreamQueryBatches
        .mockResolvedValue();

      mockGeneratePersonalTransactionReportPDFStream
        .mockImplementation(
          async ({
            writeTransactions,
          }) => {
            await writeTransactions(
              async () => {}
            );
          }
        );

      mockQuery
        .mockResolvedValue({
          rows: [{
            count: '0',
            success_count: '0',
            failed_count: '0',
            pending_count: '0',
            success_rate: null,
          }],
        });
    });


    test(
      'streams more than 5000 CSV Personal transactions without the legacy cap',
      async () => {
        mockStreamQueryBatches
          .mockImplementation(
            async (
              sql,
              params,
              options
            ) => {
              expect(sql)
                .toContain(
                  'FROM personal_transactions'
                );

              expect(sql)
                .not.toMatch(
                  /LIMIT\s+5000/i
                );

              expect(sql)
                .toContain(
                  'ORDER BY created_at DESC, id DESC'
                );

              expect(params)
                .toEqual([
                  'personal-user-1',
                  '2026-08-01T00:00:00.000Z',
                  '2026-08-12T23:59:59.999Z',
                ]);

              expect(
                options.batchSize
              ).toBe(500);

              let nextIndex = 1;

              for (
                let batch = 0;
                batch < 10;
                batch++
              ) {
                const rows =
                  Array.from(
                    {
                      length: 500,
                    },
                    () =>
                      makeRow(
                        nextIndex++
                      )
                  );

                await options.onRows(
                  rows
                );
              }

              await options.onRows([
                makeRow(
                  nextIndex++
                ),
              ]);
            }
          );

        const req = {
          user: {
            id:
              'personal-user-1',
          },

          query: {
            format: 'csv',

            from_date:
              '2026-08-01T00:00:00.000Z',

            to_date:
              '2026-08-12T23:59:59.999Z',
          },
        };

        const res =
          makeRes();

        await personalReportController
          .transactionReport(
            req,
            res
          );

        expect(
          mockStreamQueryBatches
        ).toHaveBeenCalledTimes(1);

        expect(mockQuery)
          .not.toHaveBeenCalled();

        const output =
          res.write.mock.calls
            .map(
              ([chunk]) =>
                String(chunk)
            )
            .join('');

        expect(output)
          .toContain(
            '"PERSONAL-1"'
          );

        expect(output)
          .toContain(
            '"PERSONAL-5000"'
          );

        expect(output)
          .toContain(
            '"PERSONAL-5001"'
          );

        const dataLineCount =
          output
            .trim()
            .split('\n')
            .length - 1;

        expect(
          dataLineCount
        ).toBe(5001);

        expect(res.end)
          .toHaveBeenCalledTimes(1);

        expect(res.send)
          .not.toHaveBeenCalled();
      }
    );


    test(
      'waits for CSV response drain when backpressure is applied',
      async () => {
        mockStreamQueryBatches
          .mockImplementation(
            async (
              sql,
              params,
              options
            ) => {
              await options.onRows([
                makeRow(1),
              ]);
            }
          );

        const res =
          makeRes();

        res.write
          .mockImplementationOnce(
            () => true
          )
          .mockImplementationOnce(
            () => {
              setImmediate(
                () => {
                  res.emit(
                    'drain'
                  );
                }
              );

              return false;
            }
          );

        const req = {
          user: {
            id:
              'personal-user-1',
          },

          query: {
            format: 'csv',
            period: 'today',
          },
        };

        await personalReportController
          .transactionReport(
            req,
            res
          );

        expect(res.write)
          .toHaveBeenCalledTimes(2);

        expect(res.end)
          .toHaveBeenCalledTimes(1);

        expect(res.destroy)
          .not.toHaveBeenCalled();
      }
    );


    test(
      'keeps provider transaction type and status as Personal activity filters',
      async () => {
        const req = {
          user: {
            id:
              'personal-user-1',
          },

          query: {
            format: 'csv',
            provider: 'telecel',
            transaction_type:
              'withdraw_cash',
            status: 'success',
          },
        };

        const res =
          makeRes();

        await personalReportController
          .transactionReport(
            req,
            res
          );

        expect(
          mockStreamQueryBatches
        ).toHaveBeenCalledTimes(1);

        const [
          sql,
          params,
        ] =
          mockStreamQueryBatches
            .mock.calls[0];

        expect(sql)
          .toContain(
            'provider = $2'
          );

        expect(sql)
          .toContain(
            'transaction_type = $3'
          );

        expect(sql)
          .toContain(
            'status = $4'
          );

        expect(
          params.slice(
            0,
            4
          )
        ).toEqual([
          'personal-user-1',
          'telecel',
          'withdraw_cash',
          'success',
        ]);

        expect(
          Number.isNaN(
            Date.parse(
              params[4]
            )
          )
        ).toBe(false);
      }
    );


    test(
      'streams PDF rows and passes exact activity summary counts',
      async () => {
        const summary = {
          count: '5001',
          success_count:
            '4000',
          failed_count:
            '500',
          pending_count:
            '501',
          success_rate:
            '80.0',
        };

        mockQuery
          .mockResolvedValueOnce({
            rows: [
              summary,
            ],
          });

        mockStreamQueryBatches
          .mockImplementation(
            async (
              sql,
              params,
              options
            ) => {
              expect(sql)
                .not.toMatch(
                  /LIMIT\s+5000/i
                );

              await options.onRows([
                makeRow(1),
                makeRow(2),
              ]);
            }
          );

        const writtenRows = [];

        mockGeneratePersonalTransactionReportPDFStream
          .mockImplementation(
            async ({
              stream,
              summary:
                receivedSummary,
              title,
              writeTransactions,
            }) => {
              expect(stream)
                .toBeDefined();

              expect(
                receivedSummary
              ).toEqual(summary);

              expect(title)
                .toBe(
                  'My Transaction Report — month'
                );

              await writeTransactions(
                async (row) => {
                  writtenRows.push(
                    row
                  );
                }
              );
            }
          );

        const req = {
          user: {
            id:
              'personal-user-1',
          },

          query: {
            format: 'pdf',
            period: 'month',
          },
        };

        const res =
          makeRes();

        await personalReportController
          .transactionReport(
            req,
            res
          );

        expect(mockQuery)
          .toHaveBeenCalledTimes(1);

        const [
          summarySql,
          summaryParams,
        ] =
          mockQuery.mock.calls[0];

        expect(summarySql)
          .not.toContain(
            'SUM(amount)'
          );

        expect(summarySql)
          .toContain(
            "WHEN status = 'success'"
          );

        expect(summaryParams[0])
          .toBe(
            'personal-user-1'
          );

        expect(
          mockStreamQueryBatches
        ).toHaveBeenCalledTimes(1);

        expect(writtenRows)
          .toHaveLength(2);

        expect(
          writtenRows[0]
            .reference
        ).toBe(
          'PERSONAL-1'
        );

        expect(
          mockGeneratePersonalTransactionReportPDFStream
        ).toHaveBeenCalledTimes(1);

        expect(res.setHeader)
          .toHaveBeenCalledWith(
            'Content-Type',
            'application/pdf'
          );

        expect(res.end)
          .toHaveBeenCalledTimes(1);

        expect(res.send)
          .not.toHaveBeenCalled();
      }
    );


    test(
      'scopes every streamed report row to the authenticated Personal user',
      async () => {
        const req = {
          user: {
            id:
              'personal-user-authenticated',
          },

          query: {
            format: 'csv',
            provider: 'mtn',
          },
        };

        const res =
          makeRes();

        await personalReportController
          .transactionReport(
            req,
            res
          );

        const [
          sql,
          params,
        ] =
          mockStreamQueryBatches
            .mock.calls[0];

        expect(sql)
          .toContain(
            'user_id = $1'
          );

        expect(params[0])
          .toBe(
            'personal-user-authenticated'
          );
      }
    );
  }
);


describe(
  'personalReportController request validation',
  () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });


    test(
      'rejects unsupported report formats before querying the database',
      async () => {
        const req = {
          user: {
            id:
              'personal-user-1',
          },
          query: {
            format: 'xlsx',
            period: 'month',
          },
        };

        const res =
          makeRes();

        await personalReportController
          .transactionReport(
            req,
            res
          );

        expect(res.status)
          .toHaveBeenCalledWith(400);

        expect(res.json)
          .toHaveBeenCalledWith({
            success: false,
            message:
              'format must be either pdf or csv',
          });

        expect(mockQuery)
          .not.toHaveBeenCalled();

        expect(
          mockStreamQueryBatches
        ).not.toHaveBeenCalled();
      }
    );


    test(
      'rejects unsupported periods before querying the database',
      async () => {
        const req = {
          user: {
            id:
              'personal-user-1',
          },
          query: {
            format: 'csv',
            period: 'quarter',
          },
        };

        const res =
          makeRes();

        await personalReportController
          .transactionReport(
            req,
            res
          );

        expect(res.status)
          .toHaveBeenCalledWith(400);

        expect(res.json)
          .toHaveBeenCalledWith({
            success: false,
            message:
              'period must be one of today, week, month, year, or custom',
          });

        expect(
          mockStreamQueryBatches
        ).not.toHaveBeenCalled();
      }
    );


    test(
      'requires both custom range boundaries',
      async () => {
        const req = {
          user: {
            id:
              'personal-user-1',
          },
          query: {
            format: 'pdf',
            period: 'custom',
            from_date:
              '2026-08-01T00:00:00.000Z',
          },
        };

        const res =
          makeRes();

        await personalReportController
          .transactionReport(
            req,
            res
          );

        expect(res.status)
          .toHaveBeenCalledWith(400);

        expect(res.json)
          .toHaveBeenCalledWith({
            success: false,
            message:
              'custom period requires both from_date and to_date',
          });

        expect(mockQuery)
          .not.toHaveBeenCalled();

        expect(
          mockStreamQueryBatches
        ).not.toHaveBeenCalled();
      }
    );


    test(
      'rejects invalid ISO date values',
      async () => {
        const req = {
          user: {
            id:
              'personal-user-1',
          },
          query: {
            format: 'csv',
            from_date:
              'not-a-date',
            to_date:
              '2026-08-12T23:59:59.999Z',
          },
        };

        const res =
          makeRes();

        await personalReportController
          .transactionReport(
            req,
            res
          );

        expect(res.status)
          .toHaveBeenCalledWith(400);

        expect(res.json)
          .toHaveBeenCalledWith({
            success: false,
            message:
              'from_date must be a valid ISO 8601 date-time with timezone',
          });

        expect(
          mockStreamQueryBatches
        ).not.toHaveBeenCalled();
      }
    );


    test(
      'rejects reversed custom date ranges',
      async () => {
        const req = {
          user: {
            id:
              'personal-user-1',
          },
          query: {
            format: 'csv',
            from_date:
              '2026-08-12T23:59:59.999Z',
            to_date:
              '2026-08-01T00:00:00.000Z',
          },
        };

        const res =
          makeRes();

        await personalReportController
          .transactionReport(
            req,
            res
          );

        expect(res.status)
          .toHaveBeenCalledWith(400);

        expect(res.json)
          .toHaveBeenCalledWith({
            success: false,
            message:
              'from_date must be before or equal to to_date',
          });

        expect(
          mockStreamQueryBatches
        ).not.toHaveBeenCalled();
      }
    );


    test(
      'rejects explicit dates combined with a predefined period',
      async () => {
        const req = {
          user: {
            id:
              'personal-user-1',
          },
          query: {
            format: 'csv',
            period: 'month',
            from_date:
              '2026-08-01T00:00:00.000Z',
            to_date:
              '2026-08-12T23:59:59.999Z',
          },
        };

        const res =
          makeRes();

        await personalReportController
          .transactionReport(
            req,
            res
          );

        expect(res.status)
          .toHaveBeenCalledWith(400);

        expect(res.json)
          .toHaveBeenCalledWith({
            success: false,
            message:
              'from_date and to_date cannot be combined with a predefined period',
          });

        expect(
          mockStreamQueryBatches
        ).not.toHaveBeenCalled();
      }
    );


    test(
      'resolves This Week from Monday 00:00 UTC',
      () => {
        const {
          resolvedFrom,
          resolvedTo,
        } =
          personalReportController
            ._test
            .resolvePersonalReportPeriod({
              period: 'week',
              now: new Date(
                '2026-08-12T15:30:00.000Z'
              ),
            });

        expect(resolvedFrom)
          .toBe(
            '2026-08-10T00:00:00.000Z'
          );

        expect(resolvedTo)
          .toBe(
            '2026-08-12T15:30:00.000Z'
          );
      }
    );


    test(
      'resolves Today Month and Year at UTC calendar boundaries',
      () => {
        const now =
          new Date(
            '2026-08-12T15:30:00.000Z'
          );

        expect(
          personalReportController
            ._test
            .resolvePersonalReportPeriod({
              period: 'today',
              now,
            })
            .resolvedFrom
        ).toBe(
          '2026-08-12T00:00:00.000Z'
        );

        expect(
          personalReportController
            ._test
            .resolvePersonalReportPeriod({
              period: 'month',
              now,
            })
            .resolvedFrom
        ).toBe(
          '2026-08-01T00:00:00.000Z'
        );

        expect(
          personalReportController
            ._test
            .resolvePersonalReportPeriod({
              period: 'year',
              now,
            })
            .resolvedFrom
        ).toBe(
          '2026-01-01T00:00:00.000Z'
        );
      }
    );
  }
);
