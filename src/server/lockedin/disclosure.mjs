const allowed = new Set(['athleteId', 'ageVerificationStatus', 'ageVerificationExpiresAt']);
/** Evaluate immediately before each send, including retries. Input comes from durable server records. */
export function buildDisclosure({ grant, actorId, recipientId, record, now = Date.now() }) {
  if (!grant || grant.ownerId !== actorId || grant.recipientId !== recipientId ||
      grant.athleteId !== record.athleteId || grant.revokedAt ||
      !Number.isFinite(grant.expiresAt) || grant.expiresAt <= now)
    throw new Error('disclosure_denied');
  if (!Array.isArray(grant.fields) || !grant.fields.length || grant.fields.some(f => !allowed.has(f)))
    throw new Error('invalid_disclosure_fields');
  if (grant.fields.some(f => f.startsWith('ageVerification')) &&
      (record.ageVerificationStatus !== 'verified' ||
       !Number.isFinite(record.ageVerificationExpiresAt) || record.ageVerificationExpiresAt <= now))
    throw new Error('verification_not_current');
  return Object.fromEntries(grant.fields.map(f => [f, record[f]]));
}

// Delivery remains disabled until a club-specific adapter is approved.
export async function deliverToClub() { throw new Error('club_connection_required'); }
