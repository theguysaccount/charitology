/** Bounded data/driver admission only. No authority, clock, I/O or defaults. */
import {isProxy} from 'node:util/types';
import {stable} from './security.mjs';
import {parseBackupJson} from './backup-json.mjs';
import {validateGroupExactStamp} from './participation-group-model.mjs';
export class RecurringOccurrenceError extends Error {
  constructor(code='recurrence_fields',status=422){super('Review this finite draft batch or reconcile its retained history.');this.name='RecurringOccurrenceError';this.code=code;this.status=status;}
}
export const need=(v,code,status)=>{if(!v)throw new RecurringOccurrenceError(code,status);};
export const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
export const same=(a,b)=>stable(a)===stable(b);
export const id=v=>{need(typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v));return v;};
export const number=v=>{need(typeof v==='number'||typeof v==='string'&&/^(?:0|[1-9][0-9]*)$/.test(v));const n=Number(v);need(Number.isSafeInteger(n)&&n>=0,'recurrence_driver',500);return n;};
export const stamp=v=>{try{validateGroupExactStamp(v);}catch{throw new RecurringOccurrenceError('recurrence_time');}return v;};
export function prop(v,k){need(v&&typeof v==='object'&&!isProxy(v));const d=Object.getOwnPropertyDescriptor(v,k);need(d?.enumerable&&Object.hasOwn(d,'value'));return d.value;}
export function fields(v,keys){need(v&&typeof v==='object'&&!isProxy(v)&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype);const names=Reflect.ownKeys(v);need(names.length===keys.length&&keys.every(k=>names.includes(k)));return Object.fromEntries(keys.map(k=>[k,prop(v,k)]));}
export function dense(v,max){need(Array.isArray(v)&&!isProxy(v)&&Object.getPrototypeOf(v)===Array.prototype);const n=Object.getOwnPropertyDescriptor(v,'length')?.value;need(Number.isSafeInteger(n)&&n>=0&&n<=max);need(Reflect.ownKeys(v).length===n+1);return Array.from({length:n},(_,i)=>prop(v,String(i)));}
export const rows=(r,max)=>dense(prop(r,'rows'),max);
export function owned(input,max=131072){
  let nodes=0,bytes=0;const active=new Set(),charge=n=>{bytes+=n;need(bytes<=max,'recurrence_limit');};
  const unicode=v=>!/\u0000/u.test(v)&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v);
  function walk(v,depth){
    need(++nodes<=4096&&depth<=16,'recurrence_limit');
    if(v===null||typeof v==='boolean'||typeof v==='number'){need(typeof v!=='number'||Number.isFinite(v));charge(Buffer.byteLength(JSON.stringify(v)));return v;}
    if(typeof v==='string'){need(v.length<=max&&unicode(v));charge(Buffer.byteLength(JSON.stringify(v)));return v;}
    need(v&&typeof v==='object'&&!isProxy(v)&&!active.has(v));const array=Array.isArray(v);need(Object.getPrototypeOf(v)===(array?Array.prototype:Object.prototype));
    const keys=Reflect.ownKeys(v);need(keys.every(k=>typeof k==='string'&&k.length<=100&&unicode(k)&&!/[\u0000-\u001f\u007f]/.test(k)));let ordered=keys;
    if(array){const n=Object.getOwnPropertyDescriptor(v,'length')?.value;need(Number.isSafeInteger(n)&&n>=0&&n<=256,'recurrence_limit');ordered=Array.from({length:n},(_,i)=>String(i));need(keys.length===n+1&&keys.every(k=>k==='length'||ordered.includes(k)));}else need(keys.length<=64,'recurrence_limit');
    active.add(v);charge(2);const out=array?[]:{};let first=true;
    for(const k of ordered){const x=prop(v,k);if(!first)charge(1);first=false;if(!array)charge(Buffer.byteLength(JSON.stringify(k))+1);Object.defineProperty(out,k,{value:walk(x,depth+1),enumerable:true,writable:true,configurable:true});}
    active.delete(v);return out;
  }
  return walk(input,0);
}
export function jsonRow(text,max=131072){need(typeof text==='string'&&Buffer.byteLength(text)<=max,'recurrence_driver',500);return parseBackupJson(Buffer.from(text),max);}
