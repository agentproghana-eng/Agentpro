const {
  query,
  withTransaction,
} = require('../config/database');

const {
  logger,
} = require('../utils/logger');

const {
  normalizeApproximateLocation,
  buildProximityBoundingBox,
  isWithinMutualRadius,
  assertTransition,
} = require(
  '../services/communityServiceRequestService'
);

const COMMUNITY_SERVICE_REPORT_REASONS =
  new Set([
    'spam',
    'fraud',
    'harassment',
    'misinformation',
    'inappropriate',
    'privacy',
    'other',
  ]);

const COMMUNITY_SERVICE_REPORT_RESOLUTIONS =
  new Set([
    'reviewed',
    'dismissed',
    'actioned',
  ]);

const COMMUNITY_SERVICE_CONTENT_STATUSES =
  new Set([
    'active',
    'pending_review',
    'removed',
  ]);

function failure(
  res,
  status,
  code,
  message
) {
  return res.status(status).json({
    success: false,
    code,
    message,
  });
}

async function appendEvent(
  client,
  {
    requestId,
    actorUserId,
    fromStatus,
    toStatus,
    eventType,
    metadata = null,
  }
) {
  await client.query(
    `INSERT INTO community_service_request_events (
       request_id,
       actor_user_id,
       from_status,
       to_status,
       event_type,
       metadata
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6::jsonb
     )`,
    [
      requestId,
      actorUserId,
      fromStatus,
      toStatus,
      eventType,
      metadata === null
        ? null
        : JSON.stringify(metadata),
    ]
  );
}

function handleError(
  res,
  error,
  context
) {
  if (
    error?.code ===
    'INVALID_SERVICE_REQUEST_TRANSITION'
  ) {
    return failure(
      res,
      409,
      error.code,
      'This service request can no longer perform that action.'
    );
  }

  logger.error(
    `${context}:`,
    error
  );

  return failure(
    res,
    500,
    'COMMUNITY_SERVICE_ERROR',
    'The Community service request could not be processed.'
  );
}

exports.listCategories =
async (req, res) => {
  try {
    const result = await query(
      `SELECT
         id,
         slug,
         name,
         description
       FROM community_service_categories
       WHERE active = TRUE
       ORDER BY name ASC`
    );

    return res.json({
      success: true,
      data: {
        categories: result.rows,
      },
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'List Community service categories failed'
    );
  }
};

exports.getProviderProfile =
async (req, res) => {
  try {
    const result = await query(
      `SELECT
         p.user_id,
         TRIM(
           CONCAT_WS(
             ' ',
             profile_user.first_name,
             profile_user.last_name
           )
         ) AS display_name,
         CASE
           WHEN profile_company.status = 'active'
             THEN profile_company.name
           ELSE NULL
         END AS business_name,
         p.bio,
         p.area_label,
         p.service_radius_km::float,
         p.active,
         COALESCE(
           json_agg(
             json_build_object(
               'id', c.id,
               'slug', c.slug,
               'name', c.name
             )
             ORDER BY c.name
           ) FILTER (
             WHERE c.id IS NOT NULL
           ),
           '[]'::json
         ) AS categories
       FROM community_service_provider_profiles p
       INNER JOIN users profile_user
         ON profile_user.id = p.user_id
       LEFT JOIN companies profile_company
         ON profile_company.id = profile_user.company_id
       LEFT JOIN community_service_provider_categories pc
         ON pc.provider_user_id = p.user_id
       LEFT JOIN community_service_categories c
         ON c.id = pc.category_id
       WHERE p.user_id = $1
       GROUP BY
         p.user_id,
         profile_user.first_name,
         profile_user.last_name,
         profile_company.status,
         profile_company.name`,
      [
        req.user.id,
      ]
    );

    return res.json({
      success: true,
      data: {
        profile:
          result.rows[0] ?? null,
      },
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'Get Community provider profile failed'
    );
  }
};

exports.upsertProviderProfile =
async (req, res) => {
  try {
    const {
      approxLatitude,
      approxLongitude,
    } = normalizeApproximateLocation(
      req.body.latitude,
      req.body.longitude
    );

    const categoryIds =
      Array.from(
        new Set(
          req.body.category_ids
        )
      );

    const profile =
      await withTransaction(
        async (client) => {
          const identity =
            await client.query(
              `SELECT
                 TRIM(
                   CONCAT_WS(
                     ' ',
                     u.first_name,
                     u.last_name
                   )
                 ) AS display_name,
                 CASE
                   WHEN c.status = 'active'
                     THEN c.name
                   ELSE NULL
                 END AS business_name
               FROM users u
               LEFT JOIN companies c
                 ON c.id = u.company_id
               WHERE u.id = $1
                 AND u.status = 'active'
               LIMIT 1`,
              [
                req.user.id,
              ]
            );

          if (
            identity.rows.length === 0
          ) {
            const error =
              new Error(
                'Provider identity is unavailable.'
              );

            error.code =
              'PROVIDER_IDENTITY_UNAVAILABLE';

            throw error;
          }

          const providerIdentity =
            identity.rows[0];

          const categories =
            await client.query(
              `SELECT id
               FROM community_service_categories
               WHERE id = ANY($1::uuid[])
                 AND active = TRUE`,
              [
                categoryIds,
              ]
            );

          if (
            categories.rows.length !==
            categoryIds.length
          ) {
            const error =
              new Error(
                'One or more service categories are invalid.'
              );

            error.code =
              'INVALID_SERVICE_CATEGORY';

            throw error;
          }

          const upsert =
            await client.query(
              `INSERT INTO community_service_provider_profiles (
                 user_id,
                 display_name,
                 business_name,
                 bio,
                 area_label,
                 approx_latitude,
                 approx_longitude,
                 service_radius_km,
                 active
               )
               VALUES (
                 $1,
                 $2,
                 $3,
                 $4,
                 $5,
                 $6,
                 $7,
                 $8,
                 TRUE
               )
               ON CONFLICT (user_id)
               DO UPDATE SET
                 display_name =
                   EXCLUDED.display_name,
                 business_name =
                   EXCLUDED.business_name,
                 bio =
                   EXCLUDED.bio,
                 area_label =
                   EXCLUDED.area_label,
                 approx_latitude =
                   EXCLUDED.approx_latitude,
                 approx_longitude =
                   EXCLUDED.approx_longitude,
                 service_radius_km =
                   EXCLUDED.service_radius_km,
                 active = TRUE,
                 updated_at = NOW()
               RETURNING
                 user_id,
                 display_name,
                 business_name,
                 bio,
                 area_label,
                 service_radius_km::float,
                 active`,
              [
                req.user.id,
                providerIdentity.display_name,
                providerIdentity.business_name,
                req.body.bio
                  ? req.body.bio.trim()
                  : null,
                req.body.area_label.trim(),
                approxLatitude,
                approxLongitude,
                req.body.service_radius_km,
              ]
            );

          await client.query(
            `DELETE FROM community_service_provider_categories
             WHERE provider_user_id = $1`,
            [
              req.user.id,
            ]
          );

          await client.query(
            `INSERT INTO community_service_provider_categories (
               provider_user_id,
               category_id
             )
             SELECT
               $1,
               value
             FROM unnest($2::uuid[]) AS value`,
            [
              req.user.id,
              categoryIds,
            ]
          );

          return upsert.rows[0];
        }
      );

    return res.json({
      success: true,
      message:
        'Service provider profile saved.',
      data: {
        profile: {
          ...profile,
          category_ids: categoryIds,
        },
      },
    });
  } catch (error) {

    if (
      error?.code ===
      'PROVIDER_IDENTITY_UNAVAILABLE'
    ) {
      return failure(
        res,
        409,
        error.code,
        error.message
      );
    }

    if (
      error?.code ===
      'INVALID_SERVICE_CATEGORY'
    ) {
      return failure(
        res,
        422,
        error.code,
        error.message
      );
    }

    if (
      error?.message?.includes(
        'Latitude'
      ) ||
      error?.message?.includes(
        'Longitude'
      ) ||
      error?.message?.includes(
        'coordinate'
      )
    ) {
      return failure(
        res,
        422,
        'INVALID_APPROXIMATE_LOCATION',
        error.message
      );
    }

    return handleError(
      res,
      error,
      'Save Community provider profile failed'
    );
  }
};

exports.createRequest =
async (req, res) => {
  try {
    const {
      approxLatitude,
      approxLongitude,
    } = normalizeApproximateLocation(
      req.body.latitude,
      req.body.longitude
    );

    const created =
      await withTransaction(
        async (client) => {
          const category =
            await client.query(
              `SELECT id
               FROM community_service_categories
               WHERE id = $1
                 AND active = TRUE
               LIMIT 1`,
              [
                req.body.category_id,
              ]
            );

          if (
            category.rows.length === 0
          ) {
            const error =
              new Error(
                'Service category not found.'
              );

            error.code =
              'INVALID_SERVICE_CATEGORY';

            throw error;
          }

          const result =
            await client.query(
              `INSERT INTO community_service_requests (
                 requester_user_id,
                 category_id,
                 title,
                 description,
                 area_label,
                 approx_latitude,
                 approx_longitude,
                 search_radius_km
               )
               VALUES (
                 $1,
                 $2,
                 $3,
                 $4,
                 $5,
                 $6,
                 $7,
                 $8
               )
               RETURNING
                 id,
                 category_id,
                 title,
                 description,
                 area_label,
                 search_radius_km::float,
                 status,
                 created_at`,
              [
                req.user.id,
                req.body.category_id,
                req.body.title.trim(),
                req.body.description.trim(),
                req.body.area_label.trim(),
                approxLatitude,
                approxLongitude,
                req.body.search_radius_km,
              ]
            );

          const request =
            result.rows[0];

          await appendEvent(
            client,
            {
              requestId:
                request.id,
              actorUserId:
                req.user.id,
              fromStatus:
                null,
              toStatus:
                'requested',
              eventType:
                'request_created',
            }
          );

          return request;
        }
      );

    return res.status(201).json({
      success: true,
      message:
        'Service request created.',
      data: {
        request: created,
      },
    });
  } catch (error) {
    if (
      error?.code ===
      'INVALID_SERVICE_CATEGORY'
    ) {
      return failure(
        res,
        422,
        error.code,
        error.message
      );
    }

    if (
      error?.message?.includes(
        'Latitude'
      ) ||
      error?.message?.includes(
        'Longitude'
      ) ||
      error?.message?.includes(
        'coordinate'
      )
    ) {
      return failure(
        res,
        422,
        'INVALID_APPROXIMATE_LOCATION',
        error.message
      );
    }

    return handleError(
      res,
      error,
      'Create Community service request failed'
    );
  }
};

exports.listOwnRequests =
async (req, res) => {
  try {
    const result = await query(
      `SELECT
         r.id,
         r.title,
         r.description,
         r.area_label,
         r.search_radius_km::float,
         r.status,
         r.content_status,
         r.selected_provider_user_id,
         r.created_at,
         r.updated_at,
         c.id AS category_id,
         c.slug AS category_slug,
         c.name AS category_name,
         COUNT(o.id)::int AS offer_count
       FROM community_service_requests r
       INNER JOIN community_service_categories c
         ON c.id = r.category_id
       LEFT JOIN community_service_offers o
         ON o.request_id = r.id
       WHERE r.requester_user_id = $1
       GROUP BY
         r.id,
         c.id
       ORDER BY r.created_at DESC`,
      [
        req.user.id,
      ]
    );

    return res.json({
      success: true,
      data: {
        requests: result.rows,
      },
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'List own Community service requests failed'
    );
  }
};

exports.discoverProviders =
async (req, res) => {
  try {
    const data =
      await withTransaction(
        async (client) => {
          const requestResult =
            await client.query(
              `SELECT
                 id,
                 requester_user_id,
                 category_id,
                 approx_latitude::float,
                 approx_longitude::float,
                 search_radius_km::float,
                 status
               FROM community_service_requests
               WHERE id = $1
                 AND requester_user_id = $2
                   AND content_status = 'active'
               FOR UPDATE`,
              [
                req.params.request_id,
                req.user.id,
              ]
            );

          if (
            requestResult.rows.length === 0
          ) {
            return {
              notFound: true,
            };
          }

          const serviceRequest =
            requestResult.rows[0];

          if (
            ![
              'requested',
              'providers_found',
              'offers_received',
            ].includes(
              serviceRequest.status
            )
          ) {
            return {
              conflict: true,
            };
          }

          const bounds =
            buildProximityBoundingBox(
              serviceRequest.approx_latitude,
              serviceRequest.approx_longitude,
              serviceRequest.search_radius_km
            );

          const providers =
            await client.query(
              `WITH candidates AS (
                 SELECT
                   p.user_id AS provider_user_id,
                   TRIM(
                     CONCAT_WS(
                       ' ',
                       u.first_name,
                       u.last_name
                     )
                   ) AS display_name,
                   CASE
                     WHEN company.status = 'active'
                       THEN company.name
                     ELSE NULL
                   END AS business_name,
                   p.area_label,
                   p.service_radius_km::float,
                   (
                     6371 * acos(
                       LEAST(
                         1.0,
                         GREATEST(
                           -1.0,
                           sin(
                             radians($3::double precision)
                           ) *
                           sin(
                             radians(
                               p.approx_latitude::double precision
                             )
                           ) +
                           cos(
                             radians($3::double precision)
                           ) *
                           cos(
                             radians(
                               p.approx_latitude::double precision
                             )
                           ) *
                           cos(
                             radians(
                               p.approx_longitude::double precision -
                               $4::double precision
                             )
                           )
                         )
                       )
                     )
                   ) AS distance_km
                 FROM community_service_provider_profiles p
                 INNER JOIN community_service_provider_categories pc
                   ON pc.provider_user_id = p.user_id
                 INNER JOIN users u
                   ON u.id = p.user_id
                 LEFT JOIN companies company
                   ON company.id = u.company_id
                 WHERE pc.category_id = $1
                   AND p.active = TRUE
                   AND u.status = 'active'
                   AND p.user_id <> $2
                   AND p.approx_latitude BETWEEN $6 AND $7
                   AND (
                     (
                       $10::boolean = FALSE
                       AND p.approx_longitude BETWEEN $8 AND $9
                     )
                     OR
                     (
                       $10::boolean = TRUE
                       AND (
                         p.approx_longitude >= $8
                         OR p.approx_longitude <= $9
                       )
                     )
                   )
               )
               SELECT
                 provider_user_id,
                 display_name,
                 business_name,
                 area_label,
                 ROUND(
                   distance_km::numeric,
                   1
                 )::float AS distance_km
               FROM candidates
               WHERE distance_km <= LEAST(
                 service_radius_km,
                 $5::double precision
               )
               ORDER BY
                 distance_km ASC,
                 display_name ASC
               LIMIT 50`,
              [
                serviceRequest.category_id,
                serviceRequest.requester_user_id,
                serviceRequest.approx_latitude,
                serviceRequest.approx_longitude,
                serviceRequest.search_radius_km,
                bounds.minLatitude,
                bounds.maxLatitude,
                bounds.minLongitude,
                bounds.maxLongitude,
                bounds.crossesAntimeridian,
              ]
            );

          if (
            providers.rows.length > 0 &&
            serviceRequest.status ===
              'requested'
          ) {
            assertTransition(
              'requested',
              'providers_found'
            );

            await client.query(
              `UPDATE community_service_requests
               SET
                 status = 'providers_found',
                 updated_at = NOW()
               WHERE id = $1`,
              [
                serviceRequest.id,
              ]
            );

            await appendEvent(
              client,
              {
                requestId:
                  serviceRequest.id,
                actorUserId:
                  req.user.id,
                fromStatus:
                  'requested',
                toStatus:
                  'providers_found',
                eventType:
                  'provider_discovery_completed',
                metadata: {
                  provider_count:
                    providers.rows.length,
                },
              }
            );
          }

          return {
            providers:
              providers.rows,
          };
        }
      );

    if (data.notFound) {
      return failure(
        res,
        404,
        'SERVICE_REQUEST_NOT_FOUND',
        'Service request not found.'
      );
    }

    if (data.conflict) {
      return failure(
        res,
        409,
        'SERVICE_REQUEST_DISCOVERY_CLOSED',
        'Provider discovery is closed for this request.'
      );
    }

    return res.json({
      success: true,
      data: {
        providers:
          data.providers,
        provider_count:
          data.providers.length,
      },
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'Discover Community service providers failed'
    );
  }
};

exports.listProviderRequests =
async (req, res) => {
  try {
    const profile =
      await query(
        `SELECT
           approx_latitude::float,
           approx_longitude::float,
           service_radius_km::float
         FROM community_service_provider_profiles
         WHERE user_id = $1
           AND active = TRUE
         LIMIT 1`,
        [
          req.user.id,
        ]
      );

    if (
      profile.rows.length === 0
    ) {
      return failure(
        res,
        409,
        'PROVIDER_PROFILE_REQUIRED',
        'Create a service provider profile first.'
      );
    }

    const provider =
      profile.rows[0];

    const bounds =
      buildProximityBoundingBox(
        provider.approx_latitude,
        provider.approx_longitude,
        provider.service_radius_km
      );

    const result = await query(
      `WITH matches AS (
         SELECT
           r.id,
           r.title,
           r.description,
           r.area_label,
           r.status,
           r.created_at,
           r.search_radius_km::float,
           c.id AS category_id,
           c.slug AS category_slug,
           c.name AS category_name,
           (
             6371 * acos(
               LEAST(
                 1.0,
                 GREATEST(
                   -1.0,
                   sin(
                     radians($2::double precision)
                   ) *
                   sin(
                     radians(
                       r.approx_latitude::double precision
                     )
                   ) +
                   cos(
                     radians($2::double precision)
                   ) *
                   cos(
                     radians(
                       r.approx_latitude::double precision
                     )
                   ) *
                   cos(
                     radians(
                       r.approx_longitude::double precision -
                       $3::double precision
                     )
                   )
                 )
               )
             )
           ) AS distance_km
         FROM community_service_requests r
         INNER JOIN community_service_categories c
           ON c.id = r.category_id
         INNER JOIN community_service_provider_categories pc
           ON pc.category_id = r.category_id
          AND pc.provider_user_id = $1
         WHERE r.requester_user_id <> $1
           AND r.content_status = 'active'
           AND r.status IN (
             'requested',
             'providers_found',
             'offers_received'
           )
           AND r.approx_latitude BETWEEN $5 AND $6
           AND (
             (
               $9::boolean = FALSE
               AND r.approx_longitude BETWEEN $7 AND $8
             )
             OR
             (
               $9::boolean = TRUE
               AND (
                 r.approx_longitude >= $7
                 OR r.approx_longitude <= $8
               )
             )
           )
       )
       SELECT
         id,
         title,
         description,
         area_label,
         status,
         created_at,
         category_id,
         category_slug,
         category_name,
         ROUND(
           distance_km::numeric,
           1
         )::float AS distance_km
       FROM matches
       WHERE distance_km <= LEAST(
         $4::double precision,
         search_radius_km::double precision
       )
       ORDER BY
         distance_km ASC,
         created_at DESC
       LIMIT 100`,
      [
        req.user.id,
        provider.approx_latitude,
        provider.approx_longitude,
        provider.service_radius_km,
        bounds.minLatitude,
        bounds.maxLatitude,
        bounds.minLongitude,
        bounds.maxLongitude,
        bounds.crossesAntimeridian,
      ]
    );

    return res.json({
      success: true,
      data: {
        requests: result.rows,
      },
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'List nearby Community service requests failed'
    );
  }
};

exports.submitOffer =
async (req, res) => {
  try {
    const result =
      await withTransaction(
        async (client) => {
          const requestResult =
            await client.query(
              `SELECT
                 id,
                 requester_user_id,
                 category_id,
                 approx_latitude::float,
                 approx_longitude::float,
                 search_radius_km::float,
                 status
               FROM community_service_requests
               WHERE id = $1
               AND content_status = 'active'
                 FOR UPDATE`,
              [
                req.params.request_id,
              ]
            );

          if (
            requestResult.rows.length === 0
          ) {
            return {
              notFound: true,
            };
          }

          const serviceRequest =
            requestResult.rows[0];

          if (
            serviceRequest.requester_user_id ===
            req.user.id
          ) {
            return {
              ownRequest: true,
            };
          }

          if (
            ![
              'requested',
              'providers_found',
              'offers_received',
            ].includes(
              serviceRequest.status
            )
          ) {
            return {
              closed: true,
            };
          }

          const eligibility =
            await client.query(
              `SELECT
                 p.service_radius_km::float
                   AS service_radius_km,
                 (
                   6371 * acos(
                     LEAST(
                       1.0,
                       GREATEST(
                         -1.0,
                         sin(
                           radians($3::double precision)
                         ) *
                         sin(
                           radians(
                             p.approx_latitude::double precision
                           )
                         ) +
                         cos(
                           radians($3::double precision)
                         ) *
                         cos(
                           radians(
                             p.approx_latitude::double precision
                           )
                         ) *
                         cos(
                           radians(
                             p.approx_longitude::double precision -
                             $4::double precision
                           )
                         )
                       )
                     )
                   )
                 ) AS distance_km
               FROM community_service_provider_profiles p
               INNER JOIN community_service_provider_categories pc
                 ON pc.provider_user_id = p.user_id
               INNER JOIN users u
                 ON u.id = p.user_id
               WHERE p.user_id = $1
                 AND p.active = TRUE
                 AND u.status = 'active'
                 AND pc.category_id = $2
               LIMIT 1`,
              [
                req.user.id,
                serviceRequest.category_id,
                serviceRequest.approx_latitude,
                serviceRequest.approx_longitude,
              ]
            );

          if (
            eligibility.rows.length === 0
          ) {
            return {
              notEligible: true,
            };
          }

          const provider =
            eligibility.rows[0];

          if (
            !isWithinMutualRadius(
              provider.distance_km,
              provider.service_radius_km,
              serviceRequest.search_radius_km
            )
          ) {
            return {
              outOfRange: true,
            };
          }

          const offer =
            await client.query(
              `INSERT INTO community_service_offers (
                 request_id,
                 provider_user_id,
                 message,
                 price_amount,
                 availability_note
               )
               VALUES (
                 $1,
                 $2,
                 $3,
                 $4,
                 $5
               )
               ON CONFLICT (
                 request_id,
                 provider_user_id
               )
               DO UPDATE SET
                 message =
                   EXCLUDED.message,
                 price_amount =
                   EXCLUDED.price_amount,
                 availability_note =
                   EXCLUDED.availability_note,
                 status = 'submitted',
                 updated_at = NOW()
               RETURNING
                 id,
                 request_id,
                 message,
                 price_amount::float,
                 currency,
                 availability_note,
                 status,
                 created_at,
                 updated_at`,
              [
                serviceRequest.id,
                req.user.id,
                req.body.message.trim(),
                req.body.price_amount ??
                  null,
                req.body.availability_note
                  ? req.body.availability_note.trim()
                  : null,
              ]
            );

          if (
            serviceRequest.status !==
            'offers_received'
          ) {
            assertTransition(
              serviceRequest.status,
              'offers_received'
            );

            await client.query(
              `UPDATE community_service_requests
               SET
                 status = 'offers_received',
                 updated_at = NOW()
               WHERE id = $1`,
              [
                serviceRequest.id,
              ]
            );

            await appendEvent(
              client,
              {
                requestId:
                  serviceRequest.id,
                actorUserId:
                  req.user.id,
                fromStatus:
                  serviceRequest.status,
                toStatus:
                  'offers_received',
                eventType:
                  'offer_received',
              }
            );
          }

          return {
            offer:
              offer.rows[0],
          };
        }
      );

    if (result.notFound) {
      return failure(
        res,
        404,
        'SERVICE_REQUEST_NOT_FOUND',
        'Service request not found.'
      );
    }

    if (result.ownRequest) {
      return failure(
        res,
        409,
        'OWN_REQUEST_OFFER_FORBIDDEN',
        'You cannot submit an offer to your own request.'
      );
    }

    if (result.closed) {
      return failure(
        res,
        409,
        'SERVICE_REQUEST_CLOSED',
        'This request is no longer accepting offers.'
      );
    }

    if (result.notEligible) {
      return failure(
        res,
        403,
        'PROVIDER_CATEGORY_REQUIRED',
        'Your provider profile does not offer this service category.'
      );
    }

    if (result.outOfRange) {
      return failure(
        res,
        403,
        'PROVIDER_OUT_OF_RANGE',
        'This service request is outside your permitted service area.'
      );
    }

    return res.status(201).json({
      success: true,
      message:
        'Offer submitted.',
      data: {
        offer: result.offer,
      },
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'Submit Community service offer failed'
    );
  }
};

exports.listOffers =
async (req, res) => {
  try {
    const owner =
      await query(
        `SELECT id
         FROM community_service_requests
         WHERE id = $1
           AND requester_user_id = $2
         LIMIT 1`,
        [
          req.params.request_id,
          req.user.id,
        ]
      );

    if (
      owner.rows.length === 0
    ) {
      return failure(
        res,
        404,
        'SERVICE_REQUEST_NOT_FOUND',
        'Service request not found.'
      );
    }

    const offers =
      await query(
        `SELECT
           o.id,
           o.request_id,
           o.provider_user_id,
           TRIM(
             CONCAT_WS(
               ' ',
               provider_user.first_name,
               provider_user.last_name
             )
           ) AS display_name,
           CASE
             WHEN provider_company.status = 'active'
               THEN provider_company.name
             ELSE NULL
           END AS business_name,
           p.area_label,
           o.message,
           o.price_amount::float,
           o.currency,
           o.availability_note,
           o.status,
           o.created_at,
           o.updated_at
         FROM community_service_offers o
         INNER JOIN community_service_provider_profiles p
           ON p.user_id = o.provider_user_id
         INNER JOIN users provider_user
           ON provider_user.id = o.provider_user_id
         LEFT JOIN companies provider_company
           ON provider_company.id = provider_user.company_id
         WHERE o.request_id = $1
         ORDER BY
           CASE
             WHEN o.status = 'selected' THEN 0
             WHEN o.status = 'submitted' THEN 1
             ELSE 2
           END,
           o.created_at ASC`,
        [
          req.params.request_id,
        ]
      );

    return res.json({
      success: true,
      data: {
        offers: offers.rows,
      },
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'List Community service offers failed'
    );
  }
};

exports.selectOffer =
async (req, res) => {
  try {
    const result =
      await withTransaction(
        async (client) => {
          const requestResult =
            await client.query(
              `SELECT
                 id,
                 status
               FROM community_service_requests
               WHERE id = $1
                 AND requester_user_id = $2
               FOR UPDATE`,
              [
                req.params.request_id,
                req.user.id,
              ]
            );

          if (
            requestResult.rows.length === 0
          ) {
            return {
              notFound: true,
            };
          }

          const serviceRequest =
            requestResult.rows[0];

          if (
            serviceRequest.status !==
            'offers_received'
          ) {
            return {
              conflict: true,
            };
          }

          const offerResult =
            await client.query(
              `SELECT
                 id,
                 provider_user_id
               FROM community_service_offers
               WHERE id = $1
                 AND request_id = $2
                 AND status = 'submitted'
               FOR UPDATE`,
              [
                req.params.offer_id,
                serviceRequest.id,
              ]
            );

          if (
            offerResult.rows.length === 0
          ) {
            return {
              offerNotFound: true,
            };
          }

          const offer =
            offerResult.rows[0];

          assertTransition(
            'offers_received',
            'provider_selected'
          );

          await client.query(
            `UPDATE community_service_offers
             SET
               status =
                 CASE
                   WHEN id = $1
                     THEN 'selected'::community_service_offer_status
                   ELSE 'rejected'::community_service_offer_status
                 END,
               updated_at = NOW()
             WHERE request_id = $2
               AND status = 'submitted'`,
            [
              offer.id,
              serviceRequest.id,
            ]
          );

          await client.query(
            `UPDATE community_service_requests
             SET
               status = 'provider_selected',
               selected_provider_user_id = $2,
               selected_offer_id = $3,
               updated_at = NOW()
             WHERE id = $1`,
            [
              serviceRequest.id,
              offer.provider_user_id,
              offer.id,
            ]
          );

          await appendEvent(
            client,
            {
              requestId:
                serviceRequest.id,
              actorUserId:
                req.user.id,
              fromStatus:
                'offers_received',
              toStatus:
                'provider_selected',
              eventType:
                'provider_selected',
              metadata: {
                offer_id:
                  offer.id,
                provider_user_id:
                  offer.provider_user_id,
              },
            }
          );

          return {
            selected: true,
          };
        }
      );

    if (result.notFound) {
      return failure(
        res,
        404,
        'SERVICE_REQUEST_NOT_FOUND',
        'Service request not found.'
      );
    }

    if (result.conflict) {
      return failure(
        res,
        409,
        'SERVICE_REQUEST_NOT_SELECTABLE',
        'A provider cannot be selected at this stage.'
      );
    }

    if (result.offerNotFound) {
      return failure(
        res,
        404,
        'SERVICE_OFFER_NOT_FOUND',
        'Service offer not found.'
      );
    }

    return res.json({
      success: true,
      message:
        'Provider selected.',
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'Select Community service offer failed'
    );
  }
};

async function providerTransition(
  req,
  res,
  {
    expectedStatus,
    nextStatus,
    eventType,
    successMessage,
  }
) {
  try {
    const result =
      await withTransaction(
        async (client) => {
          const requestResult =
            await client.query(
              `SELECT
                 id,
                 status,
                 selected_provider_user_id
               FROM community_service_requests
               WHERE id = $1
               FOR UPDATE`,
              [
                req.params.request_id,
              ]
            );

          if (
            requestResult.rows.length === 0
          ) {
            return {
              notFound: true,
            };
          }

          const serviceRequest =
            requestResult.rows[0];

          if (
            serviceRequest.selected_provider_user_id !==
            req.user.id
          ) {
            return {
              forbidden: true,
            };
          }

          if (
            serviceRequest.status !==
            expectedStatus
          ) {
            return {
              conflict: true,
            };
          }

          assertTransition(
            expectedStatus,
            nextStatus
          );

          await client.query(
            `UPDATE community_service_requests
             SET
               status = $2::community_service_request_status,
               updated_at = NOW()
             WHERE id = $1`,
            [
              serviceRequest.id,
              nextStatus,
            ]
          );

          await appendEvent(
            client,
            {
              requestId:
                serviceRequest.id,
              actorUserId:
                req.user.id,
              fromStatus:
                expectedStatus,
              toStatus:
                nextStatus,
              eventType,
            }
          );

          return {
            updated: true,
          };
        }
      );

    if (result.notFound) {
      return failure(
        res,
        404,
        'SERVICE_REQUEST_NOT_FOUND',
        'Service request not found.'
      );
    }

    if (result.forbidden) {
      return failure(
        res,
        403,
        'SELECTED_PROVIDER_REQUIRED',
        'Only the selected provider can perform this action.'
      );
    }

    if (result.conflict) {
      return failure(
        res,
        409,
        'SERVICE_REQUEST_INVALID_STATE',
        'This action is not available at the current request stage.'
      );
    }

    return res.json({
      success: true,
      message: successMessage,
    });
  } catch (error) {
    return handleError(
      res,
      error,
      `Community service transition to ${nextStatus} failed`
    );
  }
}

exports.startRequest =
async (req, res) =>
  providerTransition(
    req,
    res,
    {
      expectedStatus:
        'provider_selected',
      nextStatus:
        'in_progress',
      eventType:
        'work_started',
      successMessage:
        'Service work started.',
    }
  );

exports.completeRequest =
async (req, res) =>
  providerTransition(
    req,
    res,
    {
      expectedStatus:
        'in_progress',
      nextStatus:
        'completed',
      eventType:
        'work_completed',
      successMessage:
        'Service work marked complete.',
    }
  );

exports.reviewRequest =
async (req, res) => {
  try {
    const result =
      await withTransaction(
        async (client) => {
          const requestResult =
            await client.query(
              `SELECT
                 id,
                 status,
                 selected_provider_user_id
               FROM community_service_requests
               WHERE id = $1
                 AND requester_user_id = $2
               FOR UPDATE`,
              [
                req.params.request_id,
                req.user.id,
              ]
            );

          if (
            requestResult.rows.length === 0
          ) {
            return {
              notFound: true,
            };
          }

          const serviceRequest =
            requestResult.rows[0];

          if (
            serviceRequest.status !==
              'completed' ||
            !serviceRequest.selected_provider_user_id
          ) {
            return {
              conflict: true,
            };
          }

          assertTransition(
            'completed',
            'reviewed'
          );

          await client.query(
            `INSERT INTO community_service_reviews (
               request_id,
               requester_user_id,
               provider_user_id,
               rating,
               comment
             )
             VALUES (
               $1,
               $2,
               $3,
               $4,
               $5
             )`,
            [
              serviceRequest.id,
              req.user.id,
              serviceRequest.selected_provider_user_id,
              req.body.rating,
              req.body.comment
                ? req.body.comment.trim()
                : null,
            ]
          );

          await client.query(
            `UPDATE community_service_requests
             SET
               status = 'reviewed',
               updated_at = NOW()
             WHERE id = $1`,
            [
              serviceRequest.id,
            ]
          );

          await appendEvent(
            client,
            {
              requestId:
                serviceRequest.id,
              actorUserId:
                req.user.id,
              fromStatus:
                'completed',
              toStatus:
                'reviewed',
              eventType:
                'provider_reviewed',
              metadata: {
                rating:
                  req.body.rating,
              },
            }
          );

          return {
            reviewed: true,
          };
        }
      );

    if (result.notFound) {
      return failure(
        res,
        404,
        'SERVICE_REQUEST_NOT_FOUND',
        'Service request not found.'
      );
    }

    if (result.conflict) {
      return failure(
        res,
        409,
        'SERVICE_REQUEST_NOT_REVIEWABLE',
        'This request is not ready for a review.'
      );
    }

    return res.status(201).json({
      success: true,
      message:
        'Provider review submitted.',
    });
  } catch (error) {
    if (
      error?.code === '23505'
    ) {
      return failure(
        res,
        409,
        'SERVICE_REQUEST_ALREADY_REVIEWED',
        'This service request has already been reviewed.'
      );
    }

    return handleError(
      res,
      error,
      'Review Community service request failed'
    );
  }
};

exports.reportRequest =
async (req, res) => {
  const reason =
    String(
      req.body.reason || ''
    ).trim();

  const details =
    req.body.details == null
      ? null
      : String(
          req.body.details
        ).trim() || null;

  if (
    !COMMUNITY_SERVICE_REPORT_REASONS.has(
      reason
    )
  ) {
    return failure(
      res,
      422,
      'INVALID_REPORT_REASON',
      'Invalid report reason.'
    );
  }

  if (
    details != null &&
    details.length > 2000
  ) {
    return failure(
      res,
      422,
      'REPORT_DETAILS_TOO_LONG',
      'Report details cannot exceed 2000 characters.'
    );
  }

  try {
    const serviceRequest =
      await query(
        `SELECT
           id,
           requester_user_id
         FROM community_service_requests
         WHERE id = $1
           AND content_status <> 'removed'
         LIMIT 1`,
        [
          req.params.request_id,
        ]
      );

    if (
      serviceRequest.rows.length === 0
    ) {
      return failure(
        res,
        404,
        'SERVICE_REQUEST_NOT_FOUND',
        'Service request not found.'
      );
    }

    if (
      serviceRequest.rows[0]
        .requester_user_id ===
      req.user.id
    ) {
      return failure(
        res,
        422,
        'SELF_REPORT_NOT_ALLOWED',
        'You cannot report your own service request.'
      );
    }

    await query(
      `INSERT INTO community_service_request_reports (
         request_id,
         reported_by,
         reason,
         details
       )
       VALUES (
         $1,
         $2,
         $3,
         $4
       )
       ON CONFLICT (
         request_id,
         reported_by
       )
       DO UPDATE SET
         reason = EXCLUDED.reason,
         details = EXCLUDED.details,
         status = 'pending',
         reviewed_by = NULL,
         reviewed_at = NULL,
         resolution_note = NULL,
         updated_at = NOW()`,
      [
        req.params.request_id,
        req.user.id,
        reason,
        details,
      ]
    );

    return res.status(201).json({
      success: true,
      message:
        'Service request reported for review.',
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'Report Community service request failed'
    );
  }
};

exports.listModerationReports =
async (req, res) => {
  const status =
    String(
      req.query.status ||
      'pending'
    ).trim();

  if (
    status !== 'pending' &&
    !COMMUNITY_SERVICE_REPORT_RESOLUTIONS.has(
      status
    )
  ) {
    return failure(
      res,
      422,
      'INVALID_REPORT_STATUS',
      'Invalid report status.'
    );
  }

  try {
    const result =
      await query(
        `SELECT
           report.id,
           report.request_id,
           report.reason,
           report.details,
           report.status,
           report.reviewed_at,
           report.resolution_note,
           report.created_at,
           r.title,
           r.area_label,
           r.status AS service_status,
           r.content_status,
           TRIM(
             CONCAT_WS(
               ' ',
               reporter.first_name,
               reporter.last_name
             )
           ) AS reported_by_name
         FROM community_service_request_reports report
         INNER JOIN community_service_requests r
           ON r.id = report.request_id
         INNER JOIN users reporter
           ON reporter.id = report.reported_by
         WHERE report.status = $1
         ORDER BY report.created_at ASC
         LIMIT 100`,
        [
          status,
        ]
      );

    return res.json({
      success: true,
      data: {
        reports: result.rows,
      },
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'List Community service moderation reports failed'
    );
  }
};

exports.resolveModerationReport =
async (req, res) => {
  const status =
    String(
      req.body.status || ''
    ).trim();

  const resolutionNote =
    req.body.resolution_note == null
      ? null
      : String(
          req.body.resolution_note
        ).trim() || null;

  if (
    !COMMUNITY_SERVICE_REPORT_RESOLUTIONS.has(
      status
    )
  ) {
    return failure(
      res,
      422,
      'INVALID_REPORT_STATUS',
      'Invalid report status.'
    );
  }

  if (
    resolutionNote != null &&
    resolutionNote.length > 2000
  ) {
    return failure(
      res,
      422,
      'RESOLUTION_NOTE_TOO_LONG',
      'Resolution note cannot exceed 2000 characters.'
    );
  }

  try {
    const result =
      await withTransaction(
        async (client) => {
          const current =
            await client.query(
              `SELECT
                 id,
                 status
               FROM community_service_request_reports
               WHERE id = $1
               FOR UPDATE`,
              [
                req.params.report_id,
              ]
            );

          if (
            current.rows.length === 0
          ) {
            return {
              notFound: true,
            };
          }

          if (
            current.rows[0].status !==
            'pending'
          ) {
            return {
              alreadyResolved: true,
            };
          }

          const updated =
            await client.query(
              `UPDATE community_service_request_reports
               SET
                 status = $1,
                 reviewed_by = $2,
                 reviewed_at = NOW(),
                 resolution_note = $3,
                 updated_at = NOW()
               WHERE id = $4
               RETURNING
                 id,
                 request_id,
                 status,
                 reviewed_at,
                 resolution_note`,
              [
                status,
                req.user.id,
                resolutionNote,
                req.params.report_id,
              ]
            );

          return {
            report:
              updated.rows[0],
          };
        }
      );

    if (result.notFound) {
      return failure(
        res,
        404,
        'REPORT_NOT_FOUND',
        'Report not found.'
      );
    }

    if (result.alreadyResolved) {
      return failure(
        res,
        409,
        'REPORT_ALREADY_RESOLVED',
        'This report has already been resolved.'
      );
    }

    return res.json({
      success: true,
      data: {
        report: result.report,
      },
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'Resolve Community service moderation report failed'
    );
  }
};

exports.moderateRequest =
async (req, res) => {
  const contentStatus =
    String(
      req.body.content_status || ''
    ).trim();

  const reason =
    req.body.reason == null
      ? null
      : String(
          req.body.reason
        ).trim() || null;

  if (
    !COMMUNITY_SERVICE_CONTENT_STATUSES.has(
      contentStatus
    )
  ) {
    return failure(
      res,
      422,
      'INVALID_CONTENT_STATUS',
      'Invalid moderation content status.'
    );
  }

  if (
    reason != null &&
    reason.length > 2000
  ) {
    return failure(
      res,
      422,
      'MODERATION_REASON_TOO_LONG',
      'Moderation reason cannot exceed 2000 characters.'
    );
  }

  try {
    const result =
      await withTransaction(
        async (client) => {
          const current =
            await client.query(
              `SELECT
                 id,
                 status,
                 content_status
               FROM community_service_requests
               WHERE id = $1
               FOR UPDATE`,
              [
                req.params.request_id,
              ]
            );

          if (
            current.rows.length === 0
          ) {
            return {
              notFound: true,
            };
          }

          const serviceRequest =
            current.rows[0];

          if (
            serviceRequest.content_status ===
            contentStatus
          ) {
            return {
              unchanged: true,
              request: serviceRequest,
            };
          }

          const updated =
            await client.query(
              `UPDATE community_service_requests
               SET
                 content_status = $1,
                 moderated_by = $2,
                 moderated_at = NOW(),
                 moderation_reason = $3,
                 updated_at = NOW()
               WHERE id = $4
               RETURNING
                 id,
                 status,
                 content_status,
                 moderated_at,
                 moderation_reason`,
              [
                contentStatus,
                req.user.id,
                reason,
                req.params.request_id,
              ]
            );

          const action =
            contentStatus ===
            'pending_review'
              ? 'mark_pending_review'
              : contentStatus ===
                  'removed'
                ? 'remove'
                : 'restore';

          await client.query(
            `INSERT INTO community_service_request_moderation_history (
               request_id,
               moderator_id,
               action,
               previous_values,
               new_values,
               reason
             )
             VALUES (
               $1,
               $2,
               $3,
               $4::jsonb,
               $5::jsonb,
               $6
             )`,
            [
              req.params.request_id,
              req.user.id,
              action,
              JSON.stringify({
                content_status:
                  serviceRequest
                    .content_status,
                service_status:
                  serviceRequest.status,
              }),
              JSON.stringify({
                content_status:
                  contentStatus,
                service_status:
                  serviceRequest.status,
              }),
              reason,
            ]
          );

          return {
            request:
              updated.rows[0],
          };
        }
      );

    if (result.notFound) {
      return failure(
        res,
        404,
        'SERVICE_REQUEST_NOT_FOUND',
        'Service request not found.'
      );
    }

    return res.json({
      success: true,
      data: {
        request: result.request,
        unchanged:
          Boolean(
            result.unchanged
          ),
      },
    });
  } catch (error) {
    return handleError(
      res,
      error,
      'Moderate Community service request failed'
    );
  }
};
