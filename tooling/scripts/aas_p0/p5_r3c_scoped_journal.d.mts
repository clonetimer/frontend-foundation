import type { P5DiscoveredCapability, P5TrustedIdentity, P5WritePlan } from './p5_capability_contract.mjs';
export interface P5R3cStorage {
  getItem(key: string): string | null;
  setItem(key: string,value: string): void;
  removeItem(key: string): void;
}
export interface P5R3cRecord {
  readonly version: 1;
  readonly origin: string;
  readonly tenantId: string;
  readonly subjectId: string;
  readonly sessionEpoch: string;
  readonly providerId: string;
  readonly receiptEpoch: string;
  readonly method: 'PATCH';
  readonly path: string;
  readonly key: string;
  readonly etag: string;
  readonly status: 'draft' | 'approved' | 'archived';
  readonly body: string;
}
export interface P5R3cSession {
  readonly identity: P5TrustedIdentity & {readonly role:'writer'|'reader'};
  readonly csrfToken: string;
}
export interface P5R3cLockManager {
  request<T>(name:string,options:{mode:'exclusive';ifAvailable:true},
    callback:(lock:object|null)=>Promise<T>):Promise<T>;
}
export interface P5R3cResponse {
  readonly status: number;
  readonly body?: unknown;
}
export interface P5R3cOptions {
  action:'begin'|'check'|'replay';
  lockManager:P5R3cLockManager;
  storage:P5R3cStorage;
  origin:string;
  verifiedIdentity:P5TrustedIdentity;
  capability:P5DiscoveredCapability;
  expectedProviderId:string;
  expectedReceiptEpoch:string;
  now?:()=>number;
  getTrustedSession:()=>Promise<P5R3cSession>;
  request?:Pick<P5R3cRecord,'method'|'path'|'key'|'etag'|'status'|'body'>;
  confirmReplay?:boolean;
  executePatch?:(args:{plan:P5WritePlan;record:P5R3cRecord;session:P5R3cSession})=>Promise<P5R3cResponse>;
  queryReceipt?:(args:{plan:P5WritePlan;record:P5R3cRecord;session:P5R3cSession})=>Promise<P5R3cResponse>;
}
export type P5R3cResult =
  | {state:'busy'|'committed'|'idle'}
  | {state:'pending'|'blocked';reason:string};
export const P5_R3C_PENDING_KEY:string;
export const P5_R3C_LOCK_NAME:string;
export function readP5R3cPending(storage:P5R3cStorage):Readonly<P5R3cRecord>|null;
export function runP5R3cOperation(args:P5R3cOptions):Promise<P5R3cResult>;
