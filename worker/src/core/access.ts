export interface AccessFields {
  plan_id: number | null;
  expires_at: number | null;
  searches_remaining: number | null;
  is_blocked: number;
}

export type AccessState =
  | { active: true; canCreate: true }
  | { active: boolean; canCreate: false; reason: 'blocked' | 'no_plan' | 'expired' | 'quota' };

/** Subscription rules: NULL expires_at / searches_remaining mean "unlimited". */
export function entitlement(u: AccessFields, nowSec: number): AccessState {
  if (u.is_blocked) return { active: false, canCreate: false, reason: 'blocked' };
  if (u.plan_id == null) return { active: false, canCreate: false, reason: 'no_plan' };
  if (u.expires_at != null && u.expires_at <= nowSec) return { active: false, canCreate: false, reason: 'expired' };
  if (u.searches_remaining != null && u.searches_remaining <= 0) return { active: true, canCreate: false, reason: 'quota' };
  return { active: true, canCreate: true };
}
