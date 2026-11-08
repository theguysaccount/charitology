/** FIELD-only CI17 resources. Import is inert: no driver, environment or IO. */
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { requireFieldCi17Profile } from "./field-responses-ci17-profile.mjs";

const fixtures=new WeakMap();
const refused=code=>Object.assign(Error(code),{code});
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const digest=value=>createHash("sha256").update(value).digest("hex");
export function requireFieldCi17Fixture(handle){
 const state=fixtures.get(handle);if(!state||state.closed)throw refused("FIELD_CI17_FIXTURE_AUTHORITY");return state.caps;
}
const AUTH_TABLES_SQL="CREATE TABLE \"user\"(id text PRIMARY KEY,email text NOT NULL,\"emailVerified\" boolean NOT NULL); CREATE TABLE \"session\"(id text PRIMARY KEY,\"userId\" text NOT NULL REFERENCES \"user\"(id),\"expiresAt\" timestamptz NOT NULL)";
const AUTH_ACL_SQL="SELECT has_table_privilege(current_user,'\"user\"','SELECT') AS user_select,has_table_privilege(current_user,'\"user\"','INSERT') AS user_insert,has_table_privilege(current_user,'\"user\"','UPDATE') AS user_update,has_table_privilege(current_user,'\"user\"','DELETE') AS user_delete,has_table_privilege(current_user,'\"session\"','SELECT') AS session_select,has_table_privilege(current_user,'\"session\"','INSERT') AS session_insert,has_table_privilege(current_user,'\"session\"','UPDATE') AS session_update,has_table_privilege(current_user,'\"session\"','DELETE') AS session_delete,has_column_privilege(current_user,'\"session\"','id','UPDATE') AS session_id_update,has_column_privilege(current_user,'\"session\"','userId','UPDATE') AS session_user_update,has_column_privilege(current_user,'\"session\"','expiresAt','UPDATE') AS session_expiry_update";
const AUTH_CATALOG_SQL="SELECT c.relname AS name,c.relacl::text AS acl,(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'number',a.attnum) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,(SELECT jsonb_agg(jsonb_build_object('kind',k.contype,'keys',k.conkey,'parentKeys',k.confkey,'parent',k.confrelid::regclass::text,'definition',pg_get_constraintdef(k.oid)) ORDER BY k.conname COLLATE \"C\") FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints FROM pg_class c WHERE c.relnamespace=current_schema()::regnamespace AND c.relname IN ('user','session') AND c.relkind='r' ORDER BY c.relname";
const FIELD_ACL_SQL="SELECT has_table_privilege(current_user,'os_reports','SELECT') AS can_select,has_table_privilege(current_user,'os_reports','INSERT') AS can_insert,has_table_privilege(current_user,'os_reports','UPDATE') AS can_update,has_table_privilege(current_user,'os_reports','DELETE') AS can_delete,has_table_privilege(current_user,'os_reports','TRUNCATE') AS can_truncate";

/** Only a genuinely minted FIELD profile can reach actual imports or clients. */
export async function openFieldCi17Fixture(profile){
 if(arguments.length!==1)throw refused("FIELD_CI17_FIXTURE_AUTHORITY");requireFieldCi17Profile(profile);
 await profile.assertTarget();
 const {database}=await import("../../lib/database.mjs");
 const {applicationGrantsSql}=await import("../../lib/migration-grants.mjs");
 const schema="os_field_ci_"+randomBytes(8).toString("hex"),runtimeRole="os_test_app";
 assert(/^os_field_ci_[a-f0-9]{16}$/.test(schema));profile.checkUrl(profile.ownerUrl);profile.checkUrl(profile.runtimeUrl);
 let owner,migration,db,ownerClient,created=false,driverFailed=false,closed=false,closeStarted=false,providerCalls=0,primary;
 const active=new Set(),trace=[],watched=new WeakSet(),originalFetch=globalThis.fetch;
 const healthy=()=>{if(driverFailed||closed||closeStarted)throw refused("FIELD_CI17_FIXTURE_UNHEALTHY");};
 const watch=(pool,traced=false)=>{
  profile.watch(pool);pool.on("error",()=>{driverFailed=true;});
  const attach=client=>{
   if(watched.has(client))return;watched.add(client);client.on("error",()=>{driverFailed=true;});
   if(traced){const original=client.query;client.query=function(...args){
    const text=typeof args[0]==="string"?args[0]:args[0]?.text;
    if(typeof text==="string"&&/^(INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)/.test(text.trimStart())){
     assert(trace.length<20000);const params=Array.isArray(args[1])?args[1]:[];
     trace.push({sequence:trace.length+1,backendPid:client.processID,kind:text.trimStart().split(/\s/)[0],sqlSha256:digest(text),parametersSha256:digest(JSON.stringify(params))});
    }return Reflect.apply(original,this,args);
   };}
  };pool.on("connect",attach);pool.on("acquire",attach);
 };
 const track=promise=>{assert(promise instanceof Promise);active.add(promise);void promise.then(()=>active.delete(promise),()=>active.delete(promise));};
 const cleanup=async primaryError=>{
  if(closeStarted)return;closeStarted=true;
  // Never race schema teardown past still-running real commands.
  await Promise.allSettled([...active]);
  try{if(ownerClient){ownerClient.release(driverFailed);ownerClient=null;}}
  finally{
   try{if(owner)await profile.cleanup({db,migration,owner,schema,created,primaryError});}
   finally{closed=true;globalThis.fetch=originalFetch;}
  }
 };
 try{
  owner=database(profile.ownerUrl,{schema});watch(owner.pool);
  await profile.beforeSchema(schema,owner.pool);ownerClient=await owner.pool.connect();
  await profile.assertRole(owner.pool,"owner");await profile.assertTarget();healthy();
  await ownerClient.query("CREATE SCHEMA "+quote(schema));created=true;
  await ownerClient.query("SET search_path="+quote(schema)+",pg_catalog,pg_temp;SET TIME ZONE 'UTC';SET DateStyle='ISO, MDY'");
  migration=database(profile.ownerUrl,{schema});watch(migration.pool);await migration.migrate();
  await ownerClient.query(AUTH_TABLES_SQL);await ownerClient.query(applicationGrantsSql(runtimeRole,schema));
  await ownerClient.query('REVOKE ALL ON "user","session" FROM '+quote(runtimeRole));
  await ownerClient.query('GRANT SELECT ON "user","session" TO '+quote(runtimeRole));
  await ownerClient.query('GRANT UPDATE(id) ON "session" TO '+quote(runtimeRole));
  db=database(profile.runtimeUrl,{schema});watch(db.pool,true);await profile.assertRole(db.pool,"runtime");
  const authAcl=(await db.pool.query(AUTH_ACL_SQL)).rows[0];
  for(const key of ["user_select","session_select","session_id_update"])assert.equal(authAcl[key],true);
  for(const key of ["user_insert","user_update","user_delete","session_insert","session_update","session_delete","session_user_update","session_expiry_update"])assert.equal(authAcl[key],false);
  const fieldAcl=(await db.pool.query(FIELD_ACL_SQL)).rows[0];
  for(const key of ["can_select","can_insert"])assert.equal(fieldAcl[key],true);
  for(const key of ["can_update","can_delete","can_truncate"])assert.equal(fieldAcl[key],false);
  const authCatalog=(await ownerClient.query(AUTH_CATALOG_SQL)).rows;
  const definitions={user:[["id","text"],["email","text"],["emailVerified","boolean"]],session:[["id","text"],["userId","text"],["expiresAt","timestamp with time zone"]]};
  assert.equal(authCatalog.length,2);assert(authCatalog.every(table=>table.columns.length===3&&table.columns.every((column,index)=>column.name===definitions[table.name][index][0]&&column.type===definitions[table.name][index][1]&&column.notNull===true&&column.number===index+1)));
  const identity=(await db.pool.query("SELECT current_database() AS database,current_user AS role,host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('server_version_num')::int AS version_num,current_schema() AS schema")).rows[0];
  assert.equal(identity.database,"charitology_os_ci");assert.equal(identity.role,runtimeRole);assert.equal(identity.port,5432);assert.equal(identity.version_num,170011);assert.equal(identity.schema,schema);
  const tableOwner=(await ownerClient.query("SELECT relowner::regrole::text AS owner FROM pg_class WHERE oid='os_reports'::regclass")).rows[0];assert.equal(tableOwner.owner,"os_field_ci_owner");assert.notEqual(tableOwner.owner,runtimeRole);
  globalThis.fetch=()=>{providerCalls++;throw refused("FIELD_CI17_PROVIDER_REFUSED");};
  const handle=Object.freeze({format:"field-ci17-business-fixture",version:1});
  const caps=Object.freeze({db,owner:Object.freeze({async query(text,args){healthy();const value=await ownerClient.query(text,args);healthy();return value;}}),
   identity:Object.freeze({...identity,runtimeRole}),healthy,trace,track,providerCalls:()=>providerCalls});
  fixtures.set(handle,{caps,cleanup,profile,authAcl,authCatalog,get closed(){return closed;},get driverFailed(){return driverFailed;}});return handle;
 }catch(error){primary=error;try{await cleanup(error);}catch{}throw primary;}
}
export async function closeFieldCi17Fixture(handle,primaryError=null){
 if(arguments.length<1||arguments.length>2)throw refused("FIELD_CI17_FIXTURE_AUTHORITY");
 const state=fixtures.get(handle);if(!state||state.closed)throw refused("FIELD_CI17_FIXTURE_AUTHORITY");
 await state.cleanup(primaryError);
 if(state.driverFailed&&!primaryError)throw refused("FIELD_CI17_FIXTURE_DRIVER_FAILURE");
 return Object.freeze({fixtureClosed:state.closed,providerCalls:state.caps.providerCalls(),syntheticAuthOnly:true,actualSqlAuthAclVerified:true});
}
