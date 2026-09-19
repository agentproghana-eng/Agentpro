/// Compile-time distribution-channel controls.
///
/// The Google Play build is deliberately consumption-only for digital
/// AgentPro products until Play Billing is implemented for those products.
/// Direct APK/web distribution keeps the existing payment flows.
const bool kPlayStoreBuild = bool.fromEnvironment(
  'AGENTPRO_PLAY_STORE_BUILD',
  defaultValue: false,
);
