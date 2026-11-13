const fetchBounded=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(45000)});
import {config} from './config.js';
const SESSION_KEY='andtalents-test-session-v1';
let session;try{session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{session=null;}
let refreshPromise;
export const getSession=()=>session;
function save(value){session=value?{...value,expires_at:value.expires_at||Math.floor(Date.now()/1000)+(value.expires_in||3600)}:null;if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));else localStorage.removeItem(SESSION_KEY);}
async function result(response){const raw=await response.text();let data;try{data=raw?JSON.parse(raw):{};}catch{throw Error('Der Server hat keine gültige Antwort geliefert.');}if(!response.ok){const message=data.message||data.error_description||data.msg||data.error||'Die Anfrage konnte nicht ausgeführt werden.';
 const error=Error(message.replace(/Company-Account/g,'Unternehmenskonto').replace(/Company-Profil/g,'Unternehmensprofil').replace(/Kernskills/g,'Skills').replace(/Fire Skills/g,'Top Skills').replace('Dieser Account','Dieses Konto'));error.status=response.status;error.code=data.error_code||data.code;throw error;}return data;}
async function refresh(){if(!session)return;if(session.expires_at>Date.now()/1000+60)return;if(!refreshPromise)refreshPromise=(async()=>{try{save(await result(await fetchBounded(config.url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})})));}catch(error){if(error.status===400||error.status===401){save(null);throw Error('Die Sitzung ist abgelaufen. Bitte erneut anmelden.');}throw Error('Die Verbindung konnte nicht hergestellt werden. Bitte erneut versuchen.');}finally{refreshPromise=null;}})();return refreshPromise;}
export async function request(path,{method='POST',body,headers={},raw=false}={}){await refresh();if(!session)throw Error('Bitte zuerst anmelden.');const response=await fetchBounded(config.url+path,{method,headers:{apikey:config.key,Authorization:'Bearer '+session.access_token,...(!raw?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:raw?body:JSON.stringify(body)});return result(response);}
export async function api(action,payload={}){if(action==='recruiter_costs')return request('/rest/v1/rpc/app_recruiter_costs',{body:{}});if(action==='mark_swipe_notice')return request('/rest/v1/rpc/app_swipe_notice',{body:{phase:payload.phase}});return request('/rest/v1/rpc/app_api',{body:{action,payload}});}
export async function candidateFeedRequest(jobId = null) {
 const body=jobId?{p_job_id:jobId}:{};
 try {
  return await request('/rest/v1/rpc/app_candidate_feed',{body});
 } catch (error) {
  if (error.code!=='PGRST202') throw error;
  const feed=await api('feed');
  const items=jobId?feed.items.filter(job=>job.id===jobId):feed.items;
  return {items,count:items.length};
 }
}
export function profileWorkplaces(profileId,place){
 return request('/rest/v1/rpc/app_profile_workplaces',{body:{p_profile_id:profileId,p_place:place}});
}
export function saveCompanySetup(account,profile,place){
 return request('/rest/v1/rpc/app_save_company_setup',{body:{p_account:account,p_profile:profile,p_place:place}});
}
async function passwordSession(email,password){return result(await fetchBounded(config.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({email,password})}));}
export async function login(email,password){const value=await passwordSession(email,password);save(value);return value;}
export async function changePassword(currentPassword,newPassword){
 const user=session?.user;
 if(!user?.email)throw Error('Bitte melde Dich erneut an.');
 const verified=await passwordSession(user.email,currentPassword).catch(error=>{
  if(error.code==='invalid_credentials')throw Error('Das aktuelle Passwort ist falsch.');
  throw error;
 });
 if(verified.user?.id!==user.id||session?.user?.id!==user.id)throw Error('Bitte melde Dich erneut an.');
 await result(await fetchBounded(config.url+'/auth/v1/user',{method:'PUT',headers:{apikey:config.key,Authorization:'Bearer '+verified.access_token,'Content-Type':'application/json'},body:JSON.stringify({current_password:currentPassword,password:newPassword})}));
 if(session?.user?.id===user.id)save(verified);
}
export async function signup(email,password){if(email.toLowerCase().endsWith('@example.invalid')){await result(await fetchBounded(config.url+'/functions/v1/test-auth',{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+config.gatewayJwt,'Content-Type':'application/json'},body:JSON.stringify({email,password})}));return login(email,password);}const value=await result(await fetchBounded(config.url+'/auth/v1/signup',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({email,password})}));if(value.access_token)save(value);else throw Error('Bitte bestätige Deine E-Mail-Adresse über den Link in Deinem Postfach und melde Dich danach an. Für Tests ohne E-Mail nutze eine eindeutige Adresse mit @example.invalid.');return value;}
export async function logout(){try{if(session)await request('/auth/v1/logout',{body:{}});}finally{save(null);}}
export async function upload(file){if(file.size>5242880)throw Error('Dateien dürfen höchstens 5 MB groß sein.');const allowed=['application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];if(!allowed.includes(file.type))throw Error('Bitte PDF, Word, JPG oder PNG auswählen.');const ext=file.name.split('.').pop().replace(/[^a-z0-9]/gi,'');const path=session.user.id+'/'+crypto.randomUUID()+'.'+ext;await request('/storage/v1/object/application-documents/'+path,{body:file,raw:true,headers:{'Content-Type':file.type}});await api('document',{path,name:file.name});return path;}
export async function documentUrl(path){const data=await request('/storage/v1/object/sign/application-documents/'+path,{body:{expiresIn:60}});const url=data.signedURL||data.signedUrl;return url.startsWith('http')?url:config.url+(url.startsWith('/storage/v1')?'':'/storage/v1')+url;}
export async function deleteDocument(path){await request('/storage/v1/object/application-documents',{method:'DELETE',body:{prefixes:[path]}});await api('document',{path,decision:'delete'});}
