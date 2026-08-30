const REQUEST_STATUSES = Object.freeze([
  'requested',
  'providers_found',
  'offers_received',
  'provider_selected',
  'in_progress',
  'completed',
  'reviewed',
]);

const TRANSITIONS = Object.freeze({
  requested: new Set([
    'providers_found',
    'offers_received',
  ]),
  providers_found: new Set([
    'offers_received',
  ]),
  offers_received: new Set([
    'provider_selected',
  ]),
  provider_selected: new Set([
    'in_progress',
  ]),
  in_progress: new Set([
    'completed',
  ]),
  completed: new Set([
    'reviewed',
  ]),
  reviewed: new Set(),
});

function roundCoordinate(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      'Invalid location coordinate.'
    );
  }

  return (
    Math.round(
      (parsed + Number.EPSILON) * 100
    ) / 100
  );
}

function normalizeApproximateLocation(
  latitude,
  longitude
) {
  const approxLatitude =
    roundCoordinate(latitude);

  const approxLongitude =
    roundCoordinate(longitude);

  if (
    approxLatitude < -90 ||
    approxLatitude > 90
  ) {
    throw new Error(
      'Latitude must be between -90 and 90.'
    );
  }

  if (
    approxLongitude < -180 ||
    approxLongitude > 180
  ) {
    throw new Error(
      'Longitude must be between -180 and 180.'
    );
  }

  return {
    approxLatitude,
    approxLongitude,
  };
}

function normalizeLongitude(
  longitude
) {
  const normalized =
    (
      (
        longitude + 180
      ) % 360 +
      360
    ) % 360 - 180;

  return normalized;
}

function buildProximityBoundingBox(
  latitude,
  longitude,
  radiusKm
) {
  const centerLatitude =
    Number(latitude);

  const centerLongitude =
    Number(longitude);

  const searchRadiusKm =
    Number(radiusKm);

  if (
    !Number.isFinite(
      centerLatitude
    ) ||
    !Number.isFinite(
      centerLongitude
    ) ||
    !Number.isFinite(
      searchRadiusKm
    )
  ) {
    throw new TypeError(
      'Proximity values must be finite numbers.'
    );
  }

  if (
    centerLatitude < -90 ||
    centerLatitude > 90
  ) {
    throw new RangeError(
      'Latitude must be between -90 and 90.'
    );
  }

  if (
    centerLongitude < -180 ||
    centerLongitude > 180
  ) {
    throw new RangeError(
      'Longitude must be between -180 and 180.'
    );
  }

  if (searchRadiusKm <= 0) {
    throw new RangeError(
      'Radius must be greater than zero.'
    );
  }

  // Haversine remains the final distance authority.
  // Widen the preliminary spherical box by 1% so
  // legitimate edge candidates are never discarded
  // because of Earth-model or floating-point variance.
  const earthRadiusKm = 6371;

  const boundingRadiusKm =
    searchRadiusKm *
    1.01;

  const degreesToRadians =
    Math.PI / 180;

  const radiansToDegrees =
    180 / Math.PI;

  const angularRadius =
    boundingRadiusKm /
    earthRadiusKm;

  const latitudeRadians =
    centerLatitude *
    degreesToRadians;

  const latitudeDelta =
    angularRadius *
    radiansToDegrees;

  const minLatitude =
    Math.max(
      -90,
      centerLatitude -
        latitudeDelta
    );

  const maxLatitude =
    Math.min(
      90,
      centerLatitude +
        latitudeDelta
    );

  let minLongitude = -180;
  let maxLongitude = 180;
  let crossesAntimeridian =
    false;

  const reachesPole =
    minLatitude <= -90 ||
    maxLatitude >= 90;

  if (!reachesPole) {
    const longitudeRatio =
      Math.sin(
        angularRadius
      ) /
      Math.cos(
        latitudeRadians
      );

    const longitudeDelta =
      Math.asin(
        Math.min(
          1,
          Math.max(
            -1,
            longitudeRatio
          )
        )
      ) *
      radiansToDegrees;

    minLongitude =
      normalizeLongitude(
        centerLongitude -
          longitudeDelta
      );

    maxLongitude =
      normalizeLongitude(
        centerLongitude +
          longitudeDelta
      );

    crossesAntimeridian =
      minLongitude >
      maxLongitude;
  }

  return {
    minLatitude,
    maxLatitude,
    minLongitude,
    maxLongitude,
    crossesAntimeridian,
  };
}

function isWithinMutualRadius(
  distanceKm,
  providerRadiusKm,
  requestRadiusKm
) {
  const distance =
    Number(distanceKm);

  const providerRadius =
    Number(providerRadiusKm);

  const requestRadius =
    Number(requestRadiusKm);

  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(providerRadius) ||
    !Number.isFinite(requestRadius)
  ) {
    return false;
  }

  if (
    distance < 0 ||
    providerRadius <= 0 ||
    requestRadius <= 0
  ) {
    return false;
  }

  return distance <= Math.min(
    providerRadius,
    requestRadius
  );
}

function canTransition(
  fromStatus,
  toStatus
) {
  const allowed =
    TRANSITIONS[fromStatus];

  return Boolean(
    allowed &&
    allowed.has(toStatus)
  );
}

function assertTransition(
  fromStatus,
  toStatus
) {
  if (
    !canTransition(
      fromStatus,
      toStatus
    )
  ) {
    const error = new Error(
      `Invalid service request transition: ${fromStatus} -> ${toStatus}`
    );

    error.code =
      'INVALID_SERVICE_REQUEST_TRANSITION';

    throw error;
  }
}

module.exports = {
  REQUEST_STATUSES,
  TRANSITIONS,
  normalizeApproximateLocation,
  buildProximityBoundingBox,
  isWithinMutualRadius,
  canTransition,
  assertTransition,
};
