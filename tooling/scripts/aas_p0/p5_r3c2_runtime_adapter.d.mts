export interface P5R3c2TrustedHost {
  origin: string;
  getApproval: (input:{action:'begin'|'check'|'replay';origin:string;fixtureOnly:true}) => Promise<boolean>;
  getSession: (input:{origin:string;fetchSession:()=>Promise<unknown>}) => Promise<unknown>;
}
export interface P5R3c2Browser {
  location:{origin:string};
  navigator:{locks:{request:(name:string,options:unknown,callback:(lock:unknown)=>Promise<unknown>)=>Promise<unknown>}};
  localStorage:{getItem:(name:string)=>string|null;setItem:(name:string,text:string)=>void;removeItem:(name:string)=>void};
}
export interface P5R3c2Result {
  state:'busy'|'idle'|'blocked'|'pending'|'committed';
  reason?:string;
}
export interface P5R3c2ReferenceAdapter {
  readonly kind:'synthetic-reference-only';
  readonly enabledByDefault:false;
  pending():unknown;
  begin(input:{recordId:number;status:'draft'|'approved'|'archived';key:string}):Promise<P5R3c2Result>;
  check():Promise<P5R3c2Result>;
  replay():Promise<P5R3c2Result>;
}
export function createP5R3c2ReferenceAdapter(input:{
  host:P5R3c2TrustedHost;
  browser?:P5R3c2Browser;
  fetchImpl?:typeof fetch;
}):P5R3c2ReferenceAdapter;
export function p5R3c2SourceIsEligible(source:unknown):false;
