const { query } = require("../config/database");

const BUSINESS_SIM_ROLES = ["agent", "evd", "merchant"];

const CANONICAL_SIM_ROLES = [
  "agent",
  "subscriber",
  "evd",
  "merchant",
];

const SIM_ROLES_BY_PROVIDER = {
  mtn: new Set([
    "agent",
    "subscriber",
    "evd",
    "merchant",
  ]),
  telecel: new Set([
    "agent",
    "subscriber",
    "merchant",
  ]),
  at_money: new Set([
    "agent",
    "subscriber",
    "merchant",
  ]),
};

const normalizeText = (value) =>
  String(value ?? "").trim();

const normalizeLower = (value) =>
  normalizeText(value).toLowerCase();

const normalizePurpose = (value) => {
  const normalized = normalizeLower(value);

  return normalized === "personal"
    ? "subscriber"
    : normalized;
};

const normalizeInteger = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed)
    ? parsed
    : null;
};

const sameText = (left, right) =>
  left === right;

const failure = (
  code,
  message,
  status = 409,
) => ({
  ok: false,
  status,
  code,
  message,
});

async function resolveSimRoleAssignment({
  queryFn = query,
  userId,
  provider,
  simSlot,
  simIccid,
  installationId,
  simSubscriptionId,
}) {
  const normalizedProvider =
    normalizeLower(provider);

  const normalizedSlot =
    normalizeInteger(simSlot);

  const normalizedIccid =
    normalizeText(simIccid);

  const normalizedInstallationId =
    normalizeText(installationId);

  const normalizedSubscriptionId =
    normalizeInteger(simSubscriptionId);

  const providerRoles =
    SIM_ROLES_BY_PROVIDER[
      normalizedProvider
    ];

  if (providerRoles === undefined) {
    return failure(
      "INVALID_PROVIDER",
      "The selected SIM provider is not supported.",
      422,
    );
  }

  const hasSlot =
    Number.isInteger(normalizedSlot) &&
    normalizedSlot >= 0;

  const hasIdentifiedIdentity =
    hasSlot &&
    normalizedIccid.length > 0;

  const hasFallbackIdentity =
    hasSlot &&
    normalizedIccid.length === 0 &&
    normalizedInstallationId.length > 0 &&
    Number.isInteger(
      normalizedSubscriptionId,
    ) &&
    normalizedSubscriptionId >= 0;

  if (
    hasIdentifiedIdentity === false &&
    hasFallbackIdentity === false
  ) {
    return failure(
      "SIM_IDENTITY_REQUIRED",
      "A physical SIM ICCID with SIM slot, or complete unresolved SIM identity is required.",
      422,
    );
  }

  const assignmentResult =
    await queryFn(
      `SELECT
         sim_slot,
         sim_iccid,
         provider::text AS provider,
         purpose::text AS purpose,
         installation_id,
         sim_subscription_id
       FROM user_sim_purposes
       WHERE user_id = $1
         AND sim_slot = $2
       LIMIT 1`,
      [
        userId,
        normalizedSlot,
      ],
    );

  if (
    assignmentResult.rows.length === 0
  ) {
    return failure(
      "SIM_ROLE_ASSIGNMENT_REQUIRED",
      "This physical SIM has no verified SIM role assignment. Open Settings > SIM Purpose, confirm the SIM role, save it, then try again.",
    );
  }

  const assignment =
    assignmentResult.rows[0];

  const storedProvider =
    normalizeLower(
      assignment.provider,
    );

  if (
    sameText(
      storedProvider,
      normalizedProvider,
    ) === false
  ) {
    return failure(
      "SIM_ROLE_IDENTITY_MISMATCH",
      "The selected SIM does not match the saved provider identity. Confirm the physical SIM in Settings > SIM Purpose.",
    );
  }

  const storedRole =
    normalizePurpose(
      assignment.purpose,
    );

  if (
    CANONICAL_SIM_ROLES.includes(
      storedRole,
    ) === false ||
    providerRoles.has(
      storedRole,
    ) === false
  ) {
    return failure(
      "SIM_ROLE_ASSIGNMENT_INVALID",
      "The saved SIM role is not valid for this provider. Open Settings > SIM Purpose and save a valid role.",
    );
  }

  const storedIccid =
    normalizeText(
      assignment.sim_iccid,
    );

  const storedInstallationId =
    normalizeText(
      assignment.installation_id,
    );

  const storedSubscriptionId =
    normalizeInteger(
      assignment.sim_subscription_id,
    );

  const fallbackMatches =
    normalizedInstallationId.length > 0 &&
    storedInstallationId.length > 0 &&
    sameText(
      storedInstallationId,
      normalizedInstallationId,
    ) &&
    Number.isInteger(
      normalizedSubscriptionId,
    ) &&
    sameText(
      storedSubscriptionId,
      normalizedSubscriptionId,
    );

  if (
    normalizedIccid.length > 0 &&
    storedIccid.length > 0
  ) {
    if (
      sameText(
        storedIccid,
        normalizedIccid,
      ) === false
    ) {
      return failure(
        "SIM_ROLE_IDENTITY_MISMATCH",
        "The physical SIM does not match the SIM that owns the saved role assignment.",
      );
    }
  } else if (
    fallbackMatches === false
  ) {
    return failure(
      "SIM_ROLE_IDENTITY_UNVERIFIED",
      "AgentPro cannot verify this SIM role against the currently installed physical SIM. Open Settings > SIM Purpose and save the role again.",
    );
  }

  return {
    ok: true,
    role: storedRole,
    sim_slot: normalizedSlot,
  };
}

async function verifyBusinessSimRoleAssignment({
  queryFn = query,
  userId,
  provider,
  claimedRole,
  simSlot,
  simIccid,
  installationId,
  simSubscriptionId,
}) {
  const normalizedRole =
    normalizePurpose(
      claimedRole,
    );

  if (
    BUSINESS_SIM_ROLES.includes(
      normalizedRole,
    ) === false
  ) {
    return failure(
      "INVALID_BUSINESS_SIM_ROLE",
      "sim_role must be agent, evd, or merchant",
      422,
    );
  }

  const resolved =
    await resolveSimRoleAssignment({
      queryFn,
      userId,
      provider,
      simSlot,
      simIccid,
      installationId,
      simSubscriptionId,
    });

  if (resolved.ok === false) {
    return resolved;
  }

  if (
    sameText(
      resolved.role,
      normalizedRole,
    ) === false
  ) {
    return failure(
      "SIM_ROLE_MISMATCH",
      "The requested Business SIM role does not match the saved role for this physical SIM.",
    );
  }

  return resolved;
}

module.exports = {
  resolveSimRoleAssignment,
  verifyBusinessSimRoleAssignment,
  _test: {
    normalizePurpose,
    normalizeInteger,
  },
};
