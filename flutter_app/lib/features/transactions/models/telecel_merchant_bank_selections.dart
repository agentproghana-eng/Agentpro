/// Telecel Merchant bank menu routing.
///
/// IMPORTANT:
/// This mapping belongs exclusively to a Telecel SIM whose business role is
/// `merchant`.
///
/// Do not reuse the Telecel Personal or Agent bank mappings here. The provider
/// may be the same, but the SIM purpose exposes a different USSD menu.
///
/// Merchant path:
/// *110# -> Send Money (1) -> Transfer to bank (5)
/// -> alphabet group -> bank.
///
/// The names intentionally mirror the live provider menu, including historical
/// names still exposed by Telecel.
const Map<String, List<String>> kTelecelMerchantBankSelections = {
  // 1 — A-D
  'Access Bank': ['1', '1'],
  'ADB': ['1', '2'],
  'Absa': ['1', '3'],
  'Bank of Africa': ['1', '4'],
  'CAL Bank': ['1', '5'],
  'CBG': ['1', '6'],
  'ARB Apex Bank': ['1', '7'],
  'BSIC': ['1', '8'],

  // 2 — E-G
  'Ecobank': ['2', '1'],
  'Energy Bank': ['2', '2'],
  'Fidelity': ['2', '3'],
  'First National Bank': ['2', '4'],
  'GCB Bank': ['2', '5'],
  'GT Bank': ['2', '6'],
  'First Atlantic Bank': ['2', '7'],
  'FirstBank Ghana': ['2', '8'],

  // 3 — H-R
  'Heritage': ['3', '1'],
  'NIB': ['3', '2'],
  'Premium': ['3', '3'],
  'Prudential': ['3', '4'],
  'Republic': ['3', '5'],
  'Royal Bank': ['3', '6'],

  // 4 — S-Z
  'Stanchart': ['4', '1'],
  'Stanbic': ['4', '2'],
  'Sovereign': ['4', '3'],
  'UBA': ['4', '4'],
  'UMB': ['4', '5'],
  'Unibank': ['4', '6'],
  'Zenith': ['4', '7'],
};
