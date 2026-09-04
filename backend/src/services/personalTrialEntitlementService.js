const crypto = require("crypto");

const TRIAL_IDENTITY_VERSION = 1;
const PERSONAL_TRIAL_DAYS = 7;

const TrialDecisionReason = Object.freeze({
  ELIGIBLE: "ELIGIBLE",
  PHONE_VERIFICATION_REQUIRED: "PHONE_VERIFICATION_REQUIRED",
  TRIAL_ALREADY_USED: "TRIAL_ALREADY_USED",
});

class PersonalTrialIdentityError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "PersonalTrialIdentityError";
    this.code = code;
  }
}

function normalizeGhanaPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");

  let nationalDigits;

  if (digits.length === 12 && digits.startsWith("233")) {
    nationalDigits = digits.slice(3);
  } else if (digits.length === 10 && digits.startsWith("0")) {
    nationalDigits = digits.slice(1);
  } else if (digits.length === 9) {
    nationalDigits = digits;
  } else {
    throw new PersonalTrialIdentityError(
      "Phone number must be a valid Ghana number.",
      "INVALID_TRIAL_PHONE",
    );
  }

  if (/^\d{9}$/.test(nationalDigits) === false) {
    throw new PersonalTrialIdentityError(
      "Phone number must be a valid Ghana number.",
      "INVALID_TRIAL_PHONE",
    );
  }

  return `+233${nationalDigits}`;
}

function normalizeInstallationId(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  if (uuidPattern.test(normalized) === false) {
    throw new PersonalTrialIdentityError(
      "Installation identity must be a valid UUID.",
      "INVALID_TRIAL_INSTALLATION",
    );
  }

  return normalized;
}

function normalizeSimIccid(value) {
  const normalized = String(value ?? "")
    .replace(/\s/g, "")
    .trim();

  if (/^\d{10,25}$/.test(normalized) === false) {
    throw new PersonalTrialIdentityError(
      "SIM identity is invalid.",
      "INVALID_TRIAL_SIM_IDENTITY",
    );
  }

  return normalized;
}

function normalizeTrialClaimValue(claimType, value) {
  if (claimType === "phone") {
    return normalizeGhanaPhone(value);
  }

  if (claimType === "installation") {
    return normalizeInstallationId(value);
  }

  if (claimType === "sim_iccid") {
    return normalizeSimIccid(value);
  }

  throw new PersonalTrialIdentityError(
    "Unsupported trial identity claim type.",
    "INVALID_TRIAL_CLAIM_TYPE",
  );
}

function resolveTrialIdentityPepper(explicitPepper) {
  const pepper = String(
    explicitPepper ?? process.env.TRIAL_IDENTITY_PEPPER ?? "",
  ).trim();

  if (pepper.length < 32) {
    throw new PersonalTrialIdentityError(
      "Trial identity protection is not configured.",
      "TRIAL_IDENTITY_PROTECTION_UNAVAILABLE",
    );
  }

  return pepper;
}

function hashPersonalTrialIdentity({ claimType, value, pepper }) {
  const normalizedValue = normalizeTrialClaimValue(claimType, value);

  const resolvedPepper = resolveTrialIdentityPepper(pepper);

  const digest = crypto
    .createHmac("sha256", resolvedPepper)
    .update(
      [
        "agentpro-personal-trial",
        String(TRIAL_IDENTITY_VERSION),
        claimType,
        normalizedValue,
      ].join(":"),
      "utf8",
    )
    .digest("hex");

  return {
    claimType,
    claimHash: digest,
    claimVersion: TRIAL_IDENTITY_VERSION,
  };
}

function requireDbClient(dbClient) {
  if (dbClient == null || typeof dbClient.query !== "function") {
    throw new Error("A database transaction client is required.");
  }

  return dbClient;
}

function sameNormalizedPhone(left, right) {
  try {
    return normalizeGhanaPhone(left) === normalizeGhanaPhone(right);
  } catch (_) {
    return false;
  }
}

async function findLegacyPersonalTrialByPhone({ dbClient, phone }) {
  const client = requireDbClient(dbClient);
  const normalizedPhone = normalizeGhanaPhone(phone);
  const nationalDigits = normalizedPhone.slice(4);

  const result = await client.query(
    `SELECT u.id, u.phone
       FROM users u
       INNER JOIN personal_subscriptions ps
         ON ps.user_id = u.id
      WHERE RIGHT(
        REGEXP_REPLACE(
          COALESCE(u.phone, ''),
          '\\D',
          '',
          'g'
        ),
        9
      ) = $1
      LIMIT 50`,
    [nationalDigits],
  );

  return result.rows.some((row) =>
    sameNormalizedPhone(row.phone, normalizedPhone),
  );
}

async function assessPersonalTrialEligibility({
  dbClient,
  userId,
  phone,
  phoneVerifiedAt,
  installationId = null,
  simIccid = null,
  pepper,
}) {
  const client = requireDbClient(dbClient);

  if (phoneVerifiedAt == null) {
    return {
      eligible: false,
      reason: TrialDecisionReason.PHONE_VERIFICATION_REQUIRED,
      phoneClaim: null,
    };
  }

  const phoneClaim = hashPersonalTrialIdentity({
    claimType: "phone",
    value: phone,
    pepper,
  });

  const simClaim =
    simIccid === null ||
    simIccid === undefined ||
    String(simIccid).trim().length === 0
      ? null
      : hashPersonalTrialIdentity({
          claimType: "sim_iccid",
          value: simIccid,
          pepper,
        });

  const installationClaim =
    installationId === null ||
    installationId === undefined ||
    String(installationId).trim().length === 0
      ? null
      : hashPersonalTrialIdentity({
          claimType: "installation",
          value: installationId,
          pepper,
        });

  const durableHistory = await client.query(
    `SELECT e.id
       FROM personal_trial_entitlements e
       LEFT JOIN personal_trial_identity_claims c
         ON c.entitlement_id = e.id
      WHERE e.user_id = $1
         OR (
           c.claim_type = 'phone'
           AND c.claim_hash = $2
           AND c.claim_version = $3
         )
      LIMIT 1`,
    [userId, phoneClaim.claimHash, phoneClaim.claimVersion],
  );

  if (durableHistory.rows.length > 0) {
    return {
      eligible: false,
      reason: TrialDecisionReason.TRIAL_ALREADY_USED,
      phoneClaim,
      simClaim,
    };
  }

  if (simClaim) {
    const durableSimHistory = await client.query(
      `SELECT e.id
         FROM personal_trial_identity_claims c
         INNER JOIN personal_trial_entitlements e
           ON e.id = c.entitlement_id
        WHERE c.claim_type = 'sim_iccid'
          AND c.claim_hash = $1
          AND c.claim_version = $2
        LIMIT 1`,
      [simClaim.claimHash, simClaim.claimVersion],
    );

    if (durableSimHistory.rows.length > 0) {
      return {
        eligible: false,
        reason: TrialDecisionReason.TRIAL_ALREADY_USED,
        phoneClaim,
        simClaim,
      };
    }
  }

  if (installationClaim) {
    const durableInstallationHistory =
      await client.query(
        `SELECT e.id
           FROM personal_trial_identity_claims c
           INNER JOIN personal_trial_entitlements e
             ON e.id = c.entitlement_id
          WHERE c.claim_type = 'installation'
            AND c.claim_hash = $1
            AND c.claim_version = $2
          LIMIT 1`,
        [
          installationClaim.claimHash,
          installationClaim.claimVersion,
        ],
      );

    if (
      durableInstallationHistory.rows.length > 0
    ) {
      return {
        eligible: false,
        reason:
          TrialDecisionReason.TRIAL_ALREADY_USED,
        phoneClaim,
        simClaim,
      };
    }
  }

  const legacyTrialExists = await findLegacyPersonalTrialByPhone({
    dbClient: client,
    phone,
  });

  if (legacyTrialExists) {
    return {
      eligible: false,
      reason: TrialDecisionReason.TRIAL_ALREADY_USED,
      phoneClaim,
      simClaim,
    };
  }

  return {
    eligible: true,
    reason: TrialDecisionReason.ELIGIBLE,
    phoneClaim,
    simClaim,
  };
}

function buildOptionalTrialClaims({ installationId, pepper }) {
  const claims = [];

  if (
    installationId === null ||
    installationId === undefined ||
    String(installationId).trim().length === 0
  ) {
    return claims;
  }

  claims.push(
    hashPersonalTrialIdentity({
      claimType: "installation",
      value: installationId,
      pepper,
    }),
  );

  return claims;
}

async function grantPersonalTrial({
  dbClient,
  userId,
  source,
  phone,
  phoneVerifiedAt,
  installationId = null,
  simIccid = null,
  pepper,
  now = new Date(),
}) {
  const client = requireDbClient(dbClient);

  const decision = await assessPersonalTrialEligibility({
    dbClient: client,
    userId,
    phone,
    phoneVerifiedAt,
    installationId,
    simIccid,
    pepper,
  });

  if (decision.eligible === false) {
    return {
      granted: false,
      reason: decision.reason,
      expiresAt: null,
    };
  }

  const grantedAt = new Date(now);
  const expiresAt = new Date(
    grantedAt.getTime() + PERSONAL_TRIAL_DAYS * 24 * 60 * 60 * 1000,
  );

  const entitlementResult = await client.query(
    `INSERT INTO personal_trial_entitlements (
       user_id,
       source,
       granted_at,
       expires_at
     )
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id)
       WHERE user_id IS NOT NULL
     DO NOTHING
     RETURNING id`,
    [userId, source, grantedAt, expiresAt],
  );

  if (entitlementResult.rows.length === 0) {
    return {
      granted: false,
      reason: TrialDecisionReason.TRIAL_ALREADY_USED,
      expiresAt: null,
    };
  }

  const entitlementId = entitlementResult.rows[0].id;

  const primaryClaimResult = await client.query(
    `INSERT INTO personal_trial_identity_claims (
       entitlement_id,
       claim_type,
       claim_hash,
       claim_version
     )
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (
       claim_type,
       claim_hash,
       claim_version
     )
     DO NOTHING
     RETURNING id`,
    [
      entitlementId,
      decision.phoneClaim.claimType,
      decision.phoneClaim.claimHash,
      decision.phoneClaim.claimVersion,
    ],
  );

  if (primaryClaimResult.rows.length === 0) {
    await client.query(
      `DELETE FROM personal_trial_entitlements
        WHERE id = $1`,
      [entitlementId],
    );

    return {
      granted: false,
      reason: TrialDecisionReason.TRIAL_ALREADY_USED,
      expiresAt: null,
    };
  }

  if (decision.simClaim) {
    const simClaimResult = await client.query(
      `INSERT INTO personal_trial_identity_claims (
         entitlement_id,
         claim_type,
         claim_hash,
         claim_version
       )
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (
         claim_type,
         claim_hash,
         claim_version
       )
       DO NOTHING
       RETURNING id`,
      [
        entitlementId,
        decision.simClaim.claimType,
        decision.simClaim.claimHash,
        decision.simClaim.claimVersion,
      ],
    );

    if (simClaimResult.rows.length === 0) {
      await client.query(
        `DELETE FROM personal_trial_identity_claims
          WHERE entitlement_id = $1`,
        [entitlementId],
      );

      await client.query(
        `DELETE FROM personal_trial_entitlements
          WHERE id = $1`,
        [entitlementId],
      );

      return {
        granted: false,
        reason: TrialDecisionReason.TRIAL_ALREADY_USED,
        expiresAt: null,
      };
    }
  }

  const optionalClaims = buildOptionalTrialClaims({
    installationId,
    pepper,
  });

  for (const claim of optionalClaims) {
    const optionalClaimResult = await client.query(
      `INSERT INTO personal_trial_identity_claims (
         entitlement_id,
         claim_type,
         claim_hash,
         claim_version
       )
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (
         claim_type,
         claim_hash,
         claim_version
       )
       DO NOTHING
       RETURNING id`,
      [entitlementId, claim.claimType, claim.claimHash, claim.claimVersion],
    );

    if (optionalClaimResult.rows.length === 0) {
      await client.query(
        `DELETE FROM personal_trial_identity_claims
          WHERE entitlement_id = $1`,
        [entitlementId],
      );

      await client.query(
        `DELETE FROM personal_trial_entitlements
          WHERE id = $1`,
        [entitlementId],
      );

      return {
        granted: false,
        reason: TrialDecisionReason.TRIAL_ALREADY_USED,
        expiresAt: null,
      };
    }
  }

  return {
    granted: true,
    reason: TrialDecisionReason.ELIGIBLE,
    expiresAt,
    entitlementId,
  };
}

module.exports = {
  PersonalTrialIdentityError,
  TrialDecisionReason,
  TRIAL_IDENTITY_VERSION,
  PERSONAL_TRIAL_DAYS,
  normalizeGhanaPhone,
  normalizeInstallationId,
  normalizeSimIccid,
  normalizeTrialClaimValue,
  hashPersonalTrialIdentity,
  findLegacyPersonalTrialByPhone,
  assessPersonalTrialEligibility,
  grantPersonalTrial,
};
