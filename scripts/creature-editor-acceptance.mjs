/** Shared completion gate for the resumable public-UI acceptance harness. */
export function isDomainComplete(owner, domain) {
  return owner[`${domain}Complete`] === true;
}

export async function runDomain(owner, domain, work, { remaining = false } = {}) {
  if (remaining && isDomainComplete(owner, domain)) return false;
  // An explicit retry invalidates prior success before any assertion/artifact.
  // Partial measurements and old files may survive a failure, but cannot skip it.
  owner[`${domain}Complete`] = false;
  await work();
  owner[`${domain}Complete`] = true;
  return true;
}

export function isAcceptanceComplete(report) {
  return report.results.length === 3
    && report.results.every(result => isDomainComplete(result, 'terrain'))
    && isDomainComplete(report, 'comparison')
    && isDomainComplete(report, 'edgeSaves')
    && isDomainComplete(report, 'earned')
    && isDomainComplete(report, 'performance')
    && report.edgeSaves?.passed === true
    && report.earned?.passed === true
    && report.performance?.results.length === 4;
}
