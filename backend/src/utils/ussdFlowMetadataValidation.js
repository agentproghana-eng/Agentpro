'use strict';

const MAX_DIAL_CODE_LENGTH = 30;
const MAX_MARKERS_PER_OUTCOME = 50;
const MAX_MARKER_LENGTH = 200;

function validateFlowMetadata({
  dial_code,
  success_markers,
  failure_markers,
}) {
  const dialCode = typeof dial_code === 'string'
    ? dial_code.trim()
    : '';

  if (!dialCode) {
    return 'Dial code is required.';
  }

  if (dialCode.length > MAX_DIAL_CODE_LENGTH) {
    return (
      `Dial code cannot exceed ${MAX_DIAL_CODE_LENGTH} characters.`
    );
  }

  // Custom Flow Builder dial codes are MMI/USSD codes, not arbitrary
  // telephone URIs or dialer control strings. Permit only digits,
  // asterisks and hashes, require a USSD/MMI prefix, at least one digit,
  // and the normal terminating hash.
  if (
    !/^[*#][0-9*#]*#$/.test(dialCode) ||
    !/[0-9]/.test(dialCode)
  ) {
    return (
      'Dial code must be a USSD/MMI code such as *170# or *123*1#.'
    );
  }

  const successError = validateMarkerList(
    success_markers,
    'Success markers'
  );

  if (successError) {
    return successError;
  }

  const failureError = validateMarkerList(
    failure_markers,
    'Failure markers'
  );

  if (failureError) {
    return failureError;
  }

  const success = normalizeMarkers(success_markers);
  const failure = normalizeMarkers(failure_markers);

  const failureSet = new Set(failure);

  const overlap = success.find(
    (marker) => failureSet.has(marker)
  );

  if (overlap) {
    return (
      `Marker "${overlap}" cannot be both a success and failure marker.`
    );
  }

  return null;
}

function validateMarkerList(rawMarkers, label) {
  if (rawMarkers === undefined || rawMarkers === null) {
    return null;
  }

  if (!Array.isArray(rawMarkers)) {
    return `${label} must be a list.`;
  }

  if (rawMarkers.length > MAX_MARKERS_PER_OUTCOME) {
    return (
      `${label} cannot contain more than ` +
      `${MAX_MARKERS_PER_OUTCOME} entries.`
    );
  }

  const seen = new Set();

  for (let i = 0; i < rawMarkers.length; i++) {
    const marker = rawMarkers[i];

    if (typeof marker !== 'string' || marker.trim().length === 0) {
      return `${label} entry ${i + 1} cannot be blank.`;
    }

    const normalized = marker.trim().toLowerCase();

    if (normalized.length > MAX_MARKER_LENGTH) {
      return (
        `${label} entry ${i + 1} cannot exceed ` +
        `${MAX_MARKER_LENGTH} characters.`
      );
    }

    if (seen.has(normalized)) {
      return `${label} contains duplicate marker "${normalized}".`;
    }

    seen.add(normalized);
  }

  return null;
}

function normalizeMarkers(rawMarkers) {
  if (!Array.isArray(rawMarkers)) {
    return [];
  }

  return rawMarkers.map(
    (marker) => marker.trim().toLowerCase()
  );
}

module.exports = {
  MAX_DIAL_CODE_LENGTH,
  MAX_MARKERS_PER_OUTCOME,
  MAX_MARKER_LENGTH,
  validateFlowMetadata,
};
