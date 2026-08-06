export function assertCloudReadiness({
  aiState,
  searchState,
  communicationState,
  emailState,
  emailDomainState,
  linkedDomains,
  expectedEmailDomainId
}) {
  const failures = [];
  if (aiState !== 'Succeeded') failures.push(`AI=${aiState}`);
  if (String(searchState).toLowerCase() !== 'running') failures.push(`Search=${searchState}`);
  if (communicationState !== 'Succeeded') failures.push(`ACS=${communicationState}`);
  if (emailState !== 'Succeeded') failures.push(`Email=${emailState}`);
  if (emailDomainState !== 'Succeeded') failures.push(`EmailDomain=${emailDomainState}`);
  const normalizedExpected = String(expectedEmailDomainId).toLowerCase();
  const normalizedLinks = (linkedDomains ?? []).map(value => String(value).toLowerCase());
  if (!normalizedLinks.includes(normalizedExpected)) failures.push('ACS email domain is not linked');
  if (failures.length) throw new Error(`Azure readiness verification failed: ${failures.join(', ')}.`);
}
