import assert from 'node:assert/strict';
import test from 'node:test';
import { isDomainComplete, runDomain, isAcceptanceComplete } from './creature-editor-acceptance.mjs';

function completeReport() {
  return {
    results: ['biped', 'quadruped', 'longneck'].map(kind => ({
      kind, terrainComplete: true, travelDistance: 30, comparisonProjection: { distance: 17 },
    })),
    comparisonComplete: true, edgeSavesComplete: true, earnedComplete: true, performanceComplete: true,
    edgeSaves: { passed: true }, earned: { passed: true }, performance: { results: [1, 2, 3, 4] },
  };
}

for (const domain of ['terrain', 'comparison']) {
  test(`${domain}: late failure remains incomplete and remaining retries it`, async () => {
    const report = completeReport();
    const owner = domain === 'terrain' ? report.results[1] : report;
    delete owner[`${domain}Complete`];
    if (domain === 'terrain') delete owner.travelDistance;
    else for (const result of report.results) delete result.comparisonProjection;
    let attempts = 0;
    await assert.rejects(runDomain(owner, domain, async () => {
      attempts++;
      assert.equal(isDomainComplete(owner, domain), false);
      // Match the real ordering: early measurements are retained, then the last
      // terrain assertion/export or final comparison image write rejects.
      if (domain === 'terrain') owner.travelDistance = 30;
      else for (const result of report.results) result.comparisonProjection = { distance: 17 };
      await Promise.resolve();
      throw new Error(`late ${domain} artifact failure`);
    }, { remaining: true }), /artifact failure/);
    assert.equal(attempts, 1, 'Partial measurements must not skip the failed domain');
    assert.equal(isDomainComplete(owner, domain), false);
    assert.equal(isAcceptanceComplete(report), false);

    // Persist/reload like the actual browser catch/finally/resume path.
    const resumed = JSON.parse(JSON.stringify(report));
    const retryOwner = domain === 'terrain' ? resumed.results[1] : resumed;
    assert.equal(await runDomain(retryOwner, domain, async () => {
      attempts++;
      assert.equal(isDomainComplete(retryOwner, domain), false);
    }, { remaining: true }), true);
    assert.equal(attempts, 2);
    assert.equal(isDomainComplete(retryOwner, domain), true);
    assert.equal(isAcceptanceComplete(resumed), true);
    assert.equal(await runDomain(retryOwner, domain, () => assert.fail('Completed work must be skipped'), { remaining: true }), false);
  });

  test(`${domain}: an explicit retry invalidates a stale success before work starts`, async () => {
    const report = completeReport();
    const owner = domain === 'terrain' ? report.results[0] : report;
    await assert.rejects(runDomain(owner, domain, async () => {
      assert.equal(isDomainComplete(owner, domain), false);
      assert.equal(isAcceptanceComplete(report), false);
      throw new Error('retry failed after old artifacts were retained');
    }), /retry failed/);
    assert.equal(owner[`${domain}Complete`], false);
    assert.equal(isAcceptanceComplete(JSON.parse(JSON.stringify(report))), false);
    await runDomain(owner, domain, async () => {}, { remaining: true });
    assert.equal(isAcceptanceComplete(report), true);
  });
}

test('aggregate requires both explicit domains and every other acceptance domain', () => {
  const report = completeReport();
  assert.equal(isAcceptanceComplete(report), true);
  const legacy = JSON.parse(JSON.stringify(report));
  delete legacy.comparisonComplete;
  for (const result of legacy.results) delete result.terrainComplete;
  assert.equal(isAcceptanceComplete(legacy), false, 'Never migrate old measurements into success automatically');
  for (const mutate of [
    r => { r.results[2].terrainComplete = false; },
    r => { r.comparisonComplete = false; },
    r => { r.edgeSaves.passed = false; },
    r => { r.earned.passed = false; },
    r => { r.performance.results.pop(); },
  ]) {
    const incomplete = JSON.parse(JSON.stringify(report)); mutate(incomplete);
    assert.equal(isAcceptanceComplete(incomplete), false);
  }
});

for (const domain of ['edgeSaves', 'earned', 'performance']) {
  test(`${domain}: failed explicit retry cannot be erased by another successful phase`, async () => {
    const report = completeReport();
    assert.equal(isAcceptanceComplete(report), true);
    await assert.rejects(runDomain(report, domain, async () => {
      assert.equal(isDomainComplete(report, domain), false);
      throw new Error('required retry failed');
    }), /required retry failed/);
    const resumed = JSON.parse(JSON.stringify(report));
    await runDomain(resumed, 'comparison', async () => {});
    assert.equal(isAcceptanceComplete(resumed), false);
    await runDomain(resumed, domain, async () => {}, { remaining: true });
    assert.equal(isAcceptanceComplete(resumed), true);
  });

  test(`${domain}: historical records without a completion marker must retry`, async () => {
    const report = completeReport();
    delete report[`${domain}Complete`];
    assert.equal(isAcceptanceComplete(report), false);
    let attempts = 0;
    await runDomain(report, domain, async () => { attempts++; }, { remaining: true });
    assert.equal(attempts, 1);
    assert.equal(isAcceptanceComplete(report), true);
  });
}

for (const domain of ['earned', 'performance']) {
  test(`${domain}: first record assignment followed by rejected final write stays incomplete`, async () => {
    const report = completeReport(), record = report[domain];
    delete report[domain]; delete report[`${domain}Complete`];
    await assert.rejects(runDomain(report, domain, async () => {
      report[domain] = record;
      await Promise.reject(new Error('final JSON write failed'));
    }), /final JSON write failed/);
    const resumed = JSON.parse(JSON.stringify(report));
    await runDomain(resumed, 'comparison', async () => {});
    assert.equal(isAcceptanceComplete(resumed), false);
    await runDomain(resumed, domain, async () => {}, { remaining: true });
    assert.equal(isAcceptanceComplete(resumed), true);
  });
}
