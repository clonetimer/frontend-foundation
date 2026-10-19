/** P5-R3a read-only capability gate. Types cannot themselves grant runtime permission. */
declare const verifiedDiscoveryBrand: unique symbol;
export type P5MutationMethod = 'POST' | 'PATCH' | 'DELETE';
export interface P5TrustedIdentity {
  tenantId: string;
  subjectId: string;
  sessionEpoch: string;
}
export interface P5DeclaredRoute {
  method: P5MutationMethod;
  path: string;
  receiptPath: string;
}
export interface P5RawCapability {
  contract: string;
  providerId: string;
  receiptEpoch: string;
  scope: { tenantId: string; subjectId: string };
  guarantees: {
    atomicMutationAndReceipt: boolean;
    sameKeySameIntentReplay: boolean;
    authenticatedReceiptLookup: boolean;
    principalScopedKeys: boolean;
    conditionalMutation: boolean;
  };
  minReceiptRetentionSeconds: number;
  routes: P5DeclaredRoute[];
}
export interface P5ParsedCapability {
  readonly version: string;
  readonly origin: string;
  readonly providerId: string;
  readonly receiptEpoch: string;
  readonly tenantId: string;
  readonly subjectId: string;
  readonly sessionEpoch: string;
  readonly checkedAt: number;
  readonly retentionSeconds: number;
  readonly routes: readonly Readonly<P5DeclaredRoute>[];
}
/** Obtained only from runtime authenticated discovery, not serialized project data. */
export interface P5DiscoveredCapability extends P5ParsedCapability {
  readonly [verifiedDiscoveryBrand]: true;
}
export interface P5WritePlan {
  readonly origin: string;
  readonly method: P5MutationMethod;
  readonly path: string;
  readonly receiptPath: string;
  readonly providerId: string;
  readonly receiptEpoch: string;
  readonly tenantId: string;
  readonly subjectId: string;
  readonly sessionEpoch: string;
}
export const P5_CAPABILITY_PATH: string;
export const P5_CAPABILITY_VERSION: string;
export const P5_CAPABILITY_MAX_AGE_MS: number;
export function validateP5Capability(payload: unknown, args: {
  origin: string; verifiedIdentity: P5TrustedIdentity; checkedAt?: number;
}): P5ParsedCapability;
export function discoverP5Capability(args: {
  origin: string; verifiedIdentity: P5TrustedIdentity;
  fetchImpl?: typeof fetch; now?: () => number;
}): Promise<P5DiscoveredCapability>;
export function authorizeP5WritePlan(args: {
  capability: P5DiscoveredCapability; origin: string;
  verifiedIdentity: P5TrustedIdentity; method: P5MutationMethod; path: string;
  expectedProviderId: string; expectedReceiptEpoch: string; now?: number;
}): P5WritePlan;
