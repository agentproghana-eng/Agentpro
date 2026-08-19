const fs = require('fs');
const path = require('path');

describe('MTN Personal MashUp global flow seed', () => {
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      '../../migrations/082_seed_mtn_personal_mashup_flows.sql'
    ),
    'utf8'
  );

  const repairSql = fs.readFileSync(
    path.join(
      __dirname,
      '../../migrations/086_fix_mtn_personal_mashup_direct_allocations.sql'
    ),
    'utf8'
  );

  test('uses the captured Pulse code and Personal MashUp transaction type', () => {
    expect(sql).toContain("'buy_mashup'");
    expect(sql).toContain("'*567#'");
    expect(sql).toContain("ARRAY['proceed to buy bundle']");
    expect(sql).toContain("ARRAY['mashup for self', 'mashup for others']");
  });

  test('preserves manual PIN boundary and confirmed result markers', () => {
    expect(sql).toContain("ARRAY['successful', 'subscribed']");
    expect(sql).toContain(
      "ARRAY['failed', 'incomplete', 'insufficient', 'only available on mymtn app']"
    );
    expect(sql).toContain("'pin_prompt'::ussd_flow_action");
  });

  test('repairs allocation flows to send digits 1-5 directly', () => {
    expect(repairSql).toContain("ARRAY['confirm phone number']");
    expect(repairSql).toContain("ARRAY['mins']");
    expect(repairSql).toContain("'send_selection'::ussd_flow_action");
    expect(repairSql).not.toContain("ARRAY['99. more']");
  });

  test('covers the four fixed tiers captured live', () => {
    expect(sql).toContain("'ghc1'");
    expect(sql).toContain("'ghc5'");
    expect(sql).toContain("'ghc10'");
    expect(sql).toContain("'ghc30'");
  });
});
