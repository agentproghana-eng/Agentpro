const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockWithTransaction = jest.fn();

jest.mock(
  '../../src/config/database',
  () => ({
    query:
      (...args) =>
        mockQuery(...args),

    withTransaction:
      (...args) =>
        mockWithTransaction(
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

const controller =
  require(
    '../../src/controllers/communityServiceRequestController'
  );

function makeResponse() {
  return {
    status:
      jest.fn().mockReturnThis(),
    json:
      jest.fn().mockReturnThis(),
  };
}

function sqlText(call) {
  return String(
    call[0]
  );
}

beforeEach(() => {
  jest.clearAllMocks();

  mockQuery.mockReset();
  mockClientQuery.mockReset();
  mockWithTransaction.mockReset();

  mockWithTransaction
    .mockImplementation(
      async (callback) =>
        callback({
          query:
            mockClientQuery,
        })
    );
});

describe(
  'Community service request controller behavior',
  () => {
    test(
      'prevents users from reporting their own service request',
      async () => {
        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  '11111111-1111-4111-8111-111111111111',
                requester_user_id:
                  'reporter-1',
              },
            ],
          });

        const req = {
          user: {
            id: 'reporter-1',
          },
          params: {
            request_id:
              '11111111-1111-4111-8111-111111111111',
          },
          body: {
            reason: 'spam',
            details:
              'Self-report attempt',
          },
        };

        const res =
          makeResponse();

        await controller
          .reportRequest(
            req,
            res
          );

        expect(
          res.status
        ).toHaveBeenCalledWith(
          422
        );

        expect(
          res.json
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            code:
              'SELF_REPORT_NOT_ALLOWED',
          })
        );

        expect(
          mockQuery
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );

    test(
      'creates or refreshes one pending report per reporter',
      async () => {
        mockQuery
          .mockImplementation(
            async (sql) => {
              const text =
                String(sql);

              if (
                text.includes(
                  'FROM community_service_requests'
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        '11111111-1111-4111-8111-111111111111',
                      requester_user_id:
                        'requester-1',
                    },
                  ],
                };
              }

              if (
                text.includes(
                  'INSERT INTO community_service_request_reports'
                )
              ) {
                return {
                  rows: [],
                };
              }

              throw new Error(
                `Unexpected SQL: ${text}`
              );
            }
          );

        const req = {
          user: {
            id: 'reporter-1',
          },
          params: {
            request_id:
              '11111111-1111-4111-8111-111111111111',
          },
          body: {
            reason: 'privacy',
            details:
              'Potential privacy issue',
          },
        };

        const res =
          makeResponse();

        await controller
          .reportRequest(
            req,
            res
          );

        expect(
          res.status
        ).toHaveBeenCalledWith(
          201
        );

        expect(
          mockQuery
        ).toHaveBeenCalledTimes(
          2
        );

        const reportCall =
          mockQuery.mock.calls.find(
            ([sql]) =>
              String(sql).includes(
                'INSERT INTO community_service_request_reports'
              )
          );

        expect(
          reportCall
        ).toBeDefined();

        expect(
          sqlText(reportCall)
        ).toContain(
          'ON CONFLICT'
        );

        expect(
          sqlText(reportCall)
        ).toContain(
          "status = 'pending'"
        );

        expect(
          reportCall[1]
        ).toEqual([
          '11111111-1111-4111-8111-111111111111',
          'reporter-1',
          'privacy',
          'Potential privacy issue',
        ]);
      }
    );

    test(
      'resolves a pending moderation report atomically',
      async () => {
        mockClientQuery
          .mockImplementation(
            async (sql) => {
              const text =
                String(sql);

              if (
                text.includes(
                  'FROM community_service_request_reports'
                ) &&
                text.includes(
                  'FOR UPDATE'
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        '22222222-2222-4222-8222-222222222222',
                      status:
                        'pending',
                    },
                  ],
                };
              }

              if (
                text.includes(
                  'UPDATE community_service_request_reports'
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        '22222222-2222-4222-8222-222222222222',
                      request_id:
                        '11111111-1111-4111-8111-111111111111',
                      status:
                        'actioned',
                      reviewed_at:
                        '2026-08-30T21:00:00.000Z',
                      resolution_note:
                        'Confirmed and actioned',
                    },
                  ],
                };
              }

              throw new Error(
                `Unexpected SQL: ${text}`
              );
            }
          );

        const req = {
          user: {
            id: 'superuser-1',
          },
          params: {
            report_id:
              '22222222-2222-4222-8222-222222222222',
          },
          body: {
            status:
              'actioned',
            resolution_note:
              'Confirmed and actioned',
          },
        };

        const res =
          makeResponse();

        await controller
          .resolveModerationReport(
            req,
            res
          );

        expect(
          mockWithTransaction
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          mockClientQuery
        ).toHaveBeenCalledTimes(
          2
        );

        expect(
          res.json
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data:
              expect.objectContaining({
                report:
                  expect.objectContaining({
                    status:
                      'actioned',
                  }),
              }),
          })
        );

        const updateCall =
          mockClientQuery
            .mock.calls
            .find(
              ([sql]) =>
                String(sql).includes(
                  'UPDATE community_service_request_reports'
                )
            );

        expect(
          updateCall[1]
        ).toEqual([
          'actioned',
          'superuser-1',
          'Confirmed and actioned',
          '22222222-2222-4222-8222-222222222222',
        ]);
      }
    );

    test(
      'moderation changes content visibility without changing service lifecycle',
      async () => {
        mockClientQuery
          .mockImplementation(
            async (sql) => {
              const text =
                String(sql);

              if (
                text.includes(
                  'FROM community_service_requests'
                ) &&
                text.includes(
                  'FOR UPDATE'
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        '11111111-1111-4111-8111-111111111111',
                      status:
                        'offers_received',
                      content_status:
                        'active',
                    },
                  ],
                };
              }

              if (
                text.includes(
                  'UPDATE community_service_requests'
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        '11111111-1111-4111-8111-111111111111',
                      status:
                        'offers_received',
                      content_status:
                        'removed',
                      moderated_at:
                        '2026-08-30T21:00:00.000Z',
                      moderation_reason:
                        'Privacy violation',
                    },
                  ],
                };
              }

              if (
                text.includes(
                  'INSERT INTO community_service_request_moderation_history'
                )
              ) {
                return {
                  rows: [],
                };
              }

              throw new Error(
                `Unexpected SQL: ${text}`
              );
            }
          );

        const req = {
          user: {
            id: 'superuser-1',
          },
          params: {
            request_id:
              '11111111-1111-4111-8111-111111111111',
          },
          body: {
            content_status:
              'removed',
            reason:
              'Privacy violation',
          },
        };

        const res =
          makeResponse();

        await controller
          .moderateRequest(
            req,
            res
          );

        expect(
          mockClientQuery
        ).toHaveBeenCalledTimes(
          3
        );

        expect(
          res.json
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data:
              expect.objectContaining({
                request:
                  expect.objectContaining({
                    status:
                      'offers_received',
                    content_status:
                      'removed',
                  }),
              }),
          })
        );

        const updateCall =
          mockClientQuery
            .mock.calls
            .find(
              ([sql]) =>
                String(sql).includes(
                  'UPDATE community_service_requests'
                )
            );

        expect(
          updateCall
        ).toBeDefined();

        expect(
          sqlText(updateCall)
        ).toContain(
          'content_status = $1'
        );

        const historyCall =
          mockClientQuery
            .mock.calls
            .find(
              ([sql]) =>
                String(sql).includes(
                  'INSERT INTO community_service_request_moderation_history'
                )
            );

        expect(
          historyCall
        ).toBeDefined();

        expect(
          historyCall[1][2]
        ).toBe(
          'remove'
        );

        const previous =
          JSON.parse(
            historyCall[1][3]
          );

        const next =
          JSON.parse(
            historyCall[1][4]
          );

        expect(
          previous
        ).toEqual({
          content_status:
            'active',
          service_status:
            'offers_received',
        });

        expect(
          next
        ).toEqual({
          content_status:
            'removed',
          service_status:
            'offers_received',
        });
      }
    );

    test(
      'hidden request cannot enter new-offer processing',
      async () => {
        mockClientQuery
          .mockImplementation(
            async (sql) => {
              const text =
                String(sql);

              if (
                text.includes(
                  'FROM community_service_requests'
                ) &&
                text.includes(
                  'FOR UPDATE'
                )
              ) {
                return {
                  rows: [],
                };
              }

              throw new Error(
                `Unexpected SQL: ${text}`
              );
            }
          );

        const req = {
          user: {
            id: 'provider-1',
          },
          params: {
            request_id:
              '11111111-1111-4111-8111-111111111111',
          },
          body: {
            message:
              'I can help.',
            price: 100,
            availability_note:
              'Tomorrow',
          },
        };

        const res =
          makeResponse();

        await controller
          .submitOffer(
            req,
            res
          );

        expect(
          mockClientQuery
        ).toHaveBeenCalledTimes(
          1
        );

        const lockCall =
          mockClientQuery
            .mock.calls[0];

        expect(
          sqlText(lockCall)
        ).toContain(
          "content_status = 'active'"
        );

        expect(
          res.status
        ).toHaveBeenCalledWith(
          404
        );

        expect(
          res.json
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            code:
              'SERVICE_REQUEST_NOT_FOUND',
          })
        );
      }
    );

    test(
      'request owner cannot submit an offer to own request',
      async () => {
        mockClientQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id:
                  '11111111-1111-4111-8111-111111111111',
                requester_user_id:
                  'provider-1',
                category_id:
                  '33333333-3333-4333-8333-333333333333',
                approx_latitude:
                  5.6,
                approx_longitude:
                  -0.19,
                search_radius_km:
                  10,
                status:
                  'requested',
              },
            ],
          });

        const req = {
          user: {
            id: 'provider-1',
          },
          params: {
            request_id:
              '11111111-1111-4111-8111-111111111111',
          },
          body: {
            message:
              'Own offer',
          },
        };

        const res =
          makeResponse();

        await controller
          .submitOffer(
            req,
            res
          );

        expect(
          res.status
        ).toHaveBeenCalledWith(
          409
        );

        expect(
          res.json
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            code:
              'OWN_REQUEST_OFFER_FORBIDDEN',
          })
        );

        expect(
          mockClientQuery
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );

    test(
      'eligible provider offer advances providers_found to offers_received atomically',
      async () => {
        mockClientQuery
          .mockImplementation(
            async (sql) => {
              const text =
                String(sql);

              if (
                text.includes(
                  'FROM community_service_requests'
                ) &&
                text.includes(
                  'FOR UPDATE'
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        '11111111-1111-4111-8111-111111111111',
                      requester_user_id:
                        'requester-1',
                      category_id:
                        '33333333-3333-4333-8333-333333333333',
                      approx_latitude:
                        5.6,
                      approx_longitude:
                        -0.19,
                      search_radius_km:
                        10,
                      status:
                        'providers_found',
                    },
                  ],
                };
              }

              if (
                text.includes(
                  'FROM community_service_provider_profiles p'
                )
              ) {
                return {
                  rows: [
                    {
                      service_radius_km:
                        5,
                      distance_km:
                        4,
                    },
                  ],
                };
              }

              if (
                text.includes(
                  'INSERT INTO community_service_offers'
                )
              ) {
                return {
                  rows: [
                    {
                      id:
                        '44444444-4444-4444-8444-444444444444',
                      request_id:
                        '11111111-1111-4111-8111-111111111111',
                      provider_user_id:
                        'provider-1',
                      status:
                        'submitted',
                    },
                  ],
                };
              }

              if (
                text.includes(
                  'UPDATE community_service_requests'
                )
              ) {
                return {
                  rows: [],
                };
              }

              if (
                text.includes(
                  'INSERT INTO community_service_request_events'
                )
              ) {
                return {
                  rows: [],
                };
              }

              throw new Error(
                `Unexpected SQL: ${text}`
              );
            }
          );

        const req = {
          user: {
            id: 'provider-1',
          },
          params: {
            request_id:
              '11111111-1111-4111-8111-111111111111',
          },
          body: {
            message:
              'Available tomorrow.',
            price: 100,
            availability_note:
              'Tomorrow morning',
          },
        };

        const res =
          makeResponse();

        await controller
          .submitOffer(
            req,
            res
          );

        expect(
          mockWithTransaction
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          res.status
        ).toHaveBeenCalledWith(
          201
        );

        expect(
          res.json
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
          })
        );

        const transitionCall =
          mockClientQuery
            .mock.calls
            .find(
              ([sql]) =>
                String(sql).includes(
                  'UPDATE community_service_requests'
                )
            );

        expect(
          transitionCall
        ).toBeDefined();

        expect(
          String(
            transitionCall[0]
          )
        ).toContain(
          'status'
        );

        const eventCall =
          mockClientQuery
            .mock.calls
            .find(
              ([sql]) =>
                String(sql).includes(
                  'INSERT INTO community_service_request_events'
                )
            );

        expect(
          eventCall
        ).toBeDefined();
      }
    );

    test(
      'offer list is requester-owned',
      async () => {
        mockQuery
          .mockResolvedValueOnce({
            rows: [],
          });

        const req = {
          user: {
            id: 'not-owner',
          },
          params: {
            request_id:
              '11111111-1111-4111-8111-111111111111',
          },
        };

        const res =
          makeResponse();

        await controller
          .listOffers(
            req,
            res
          );

        expect(
          res.status
        ).toHaveBeenCalledWith(
          404
        );

        expect(
          mockQuery
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          sqlText(
            mockQuery.mock.calls[0]
          )
        ).toContain(
          'requester_user_id = $2'
        );
      }
    );
    test(
      'requester can select a submitted provider offer atomically',
      async () => {
        const responder =
          async (sql) => {
            const queryText =
              String(sql);

            if (
              queryText.includes(
                'FROM community_service_requests'
              )
            ) {
              return {
                rows: [
                  {
                    id:
                      '11111111-1111-4111-8111-111111111111',
                    requester_user_id:
                      'requester-1',
                    status:
                      'offers_received',
                    selected_offer_id:
                      null,
                    selected_provider_user_id:
                      null,
                  },
                ],
              };
            }

            if (
              queryText.includes(
                'FROM community_service_offers'
              )
            ) {
              return {
                rows: [
                  {
                    id:
                      '44444444-4444-4444-8444-444444444444',
                    request_id:
                      '11111111-1111-4111-8111-111111111111',
                    provider_user_id:
                      'provider-1',
                    status:
                      'submitted',
                  },
                ],
              };
            }

            if (
              queryText.includes(
                'UPDATE community_service_requests'
              )
            ) {
              return {
                rows: [
                  {
                    id:
                      '11111111-1111-4111-8111-111111111111',
                    status:
                      'provider_selected',
                    selected_offer_id:
                      '44444444-4444-4444-8444-444444444444',
                    selected_provider_user_id:
                      'provider-1',
                  },
                ],
              };
            }

            if (
              queryText.includes(
                'UPDATE community_service_offers'
              ) ||
              queryText.includes(
                'INSERT INTO community_service_request_events'
              )
            ) {
              return {
                rows: [],
              };
            }

            throw new Error(
              `Unexpected SQL: ${queryText}`
            );
          };

        mockClientQuery
          .mockImplementation(
            responder
          );

        mockQuery
          .mockImplementation(
            responder
          );

        const req = {
          user: {
            id: 'requester-1',
          },
          params: {
            request_id:
              '11111111-1111-4111-8111-111111111111',
            offer_id:
              '44444444-4444-4444-8444-444444444444',
          },
          body: {
            offer_id:
              '44444444-4444-4444-8444-444444444444',
          },
        };

        const res =
          makeResponse();

        await controller["selectOffer"](
          req,
          res
        );

        expect(
          mockWithTransaction
        ).toHaveBeenCalledTimes(1);

        expect(
          res.json
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
          })
        );

        const requestUpdate =
          mockClientQuery.mock.calls.find(
            ([sql]) =>
              String(sql).includes(
                'UPDATE community_service_requests'
              )
          );

        expect(
          requestUpdate
        ).toBeDefined();

        const eventInsert =
          mockClientQuery.mock.calls.find(
            ([sql]) =>
              String(sql).includes(
                'INSERT INTO community_service_request_events'
              )
          );

        expect(
          eventInsert
        ).toBeDefined();
      }
    );

    test(
      'non-owner cannot select an offer for another requester',
      async () => {
        const responder =
          async (sql) => {
            const queryText =
              String(sql);

            if (
              queryText.includes(
                'FROM community_service_requests'
              )
            ) {
              return {
                rows: [],
              };
            }

            throw new Error(
              `Unexpected SQL: ${queryText}`
            );
          };

        mockClientQuery
          .mockImplementation(
            responder
          );

        mockQuery
          .mockImplementation(
            responder
          );

        const req = {
          user: {
            id: 'not-owner',
          },
          params: {
            request_id:
              '11111111-1111-4111-8111-111111111111',
            offer_id:
              '44444444-4444-4444-8444-444444444444',
          },
          body: {
            offer_id:
              '44444444-4444-4444-8444-444444444444',
          },
        };

        const res =
          makeResponse();

        await controller["selectOffer"](
          req,
          res
        );

        expect(
          res.status
        ).toHaveBeenCalled();

        const status =
          res.status.mock.calls[0][0];

        expect(
          [403, 404]
        ).toContain(status);

        const update =
          mockClientQuery.mock.calls.find(
            ([sql]) =>
              String(sql).includes(
                'UPDATE community_service_requests'
              )
          );

        expect(update).toBeUndefined();
      }
    );

    test(
      'non-selected provider cannot start the service request',
      async () => {
        const responder =
          async (sql, params) => {
            const queryText =
              String(sql);

            if (
              queryText.includes(
                'FROM community_service_requests'
              )
            ) {
              if (
                queryText.includes(
                  'selected_provider_user_id'
                ) &&
                Array.isArray(params) &&
                params.includes(
                  'provider-1'
                )
              ) {
                return {
                  rows: [],
                };
              }

              return {
                rows: [
                  {
                    id:
                      '11111111-1111-4111-8111-111111111111',
                    status:
                      'provider_selected',
                    selected_provider_user_id:
                      'provider-2',
                  },
                ],
              };
            }

            throw new Error(
              `Unexpected SQL: ${queryText}`
            );
          };

        mockClientQuery
          .mockImplementation(
            responder
          );

        mockQuery
          .mockImplementation(
            responder
          );

        const req = {
          user: {
            id: 'provider-1',
          },
          params: {
            request_id:
              '11111111-1111-4111-8111-111111111111',
          },
          body: {},
        };

        const res =
          makeResponse();

        await controller["startRequest"](
          req,
          res
        );

        expect(
          res.status
        ).toHaveBeenCalled();

        const update =
          mockClientQuery.mock.calls.find(
            ([sql]) =>
              String(sql).includes(
                'UPDATE community_service_requests'
              )
          );

        expect(update).toBeUndefined();
      }
    );

    test(
      'selected provider alone can start and complete the service request',
      async () => {
        const runTransition =
          async ({
            action,
            initialStatus,
            targetStatus,
          }) => {
            jest.clearAllMocks();

            mockWithTransaction
              .mockImplementation(
                async (callback) =>
                  callback({
                    query:
                      mockClientQuery,
                  })
              );

            const responder =
              async (sql) => {
                const queryText =
                  String(sql);

                if (
                  queryText.includes(
                    'FROM community_service_requests'
                  )
                ) {
                  return {
                    rows: [
                      {
                        id:
                          '11111111-1111-4111-8111-111111111111',
                        status:
                          initialStatus,
                        selected_provider_user_id:
                          'provider-1',
                      },
                    ],
                  };
                }

                if (
                  queryText.includes(
                    'UPDATE community_service_requests'
                  )
                ) {
                  return {
                    rows: [
                      {
                        id:
                          '11111111-1111-4111-8111-111111111111',
                        status:
                          targetStatus,
                        selected_provider_user_id:
                          'provider-1',
                      },
                    ],
                  };
                }

                if (
                  queryText.includes(
                    'INSERT INTO community_service_request_events'
                  )
                ) {
                  return {
                    rows: [],
                  };
                }

                throw new Error(
                  `Unexpected SQL: ${queryText}`
                );
              };

            mockClientQuery
              .mockImplementation(
                responder
              );

            mockQuery
              .mockImplementation(
                responder
              );

            const req = {
              user: {
                id: 'provider-1',
              },
              params: {
                request_id:
                  '11111111-1111-4111-8111-111111111111',
              },
              body: {},
            };

            const res =
              makeResponse();

            await action(
              req,
              res
            );

            expect(
              mockWithTransaction
            ).toHaveBeenCalledTimes(1);

            expect(
              res.json
            ).toHaveBeenCalledWith(
              expect.objectContaining({
                success: true,
              })
            );

            const update =
              mockClientQuery.mock.calls.find(
                ([sql]) =>
                  String(sql).includes(
                    'UPDATE community_service_requests'
                  )
              );

            expect(
              update
            ).toBeDefined();

            const event =
              mockClientQuery.mock.calls.find(
                ([sql]) =>
                  String(sql).includes(
                    'INSERT INTO community_service_request_events'
                  )
              );

            expect(
              event
            ).toBeDefined();
          };

        await runTransition({
          action:
            controller["startRequest"],
          initialStatus:
            'provider_selected',
          targetStatus:
            'in_progress',
        });

        await runTransition({
          action:
            controller["completeRequest"],
          initialStatus:
            'in_progress',
          targetStatus:
            'completed',
        });
      }
    );

  }
);
