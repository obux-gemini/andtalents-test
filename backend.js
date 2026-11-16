const fetchBounded=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(45000)});
import {config} from './config.js';
const SESSION_KEY='andtalents-test-session-v1';
const RECOVERY_KEY='andtalents-password-recovery';
const authHeaders={apikey:config.key,'Content-Type':'application/json'};
function storedSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch{return null;}}
let session=storedSession();
let refreshPromise;
export const getSession=()=>session;
export function syncSession(event){
 if(event.storageArea!==localStorage||(event.key!==SESSION_KEY&&event.key!==null))return false;
 const previous=session?.user?.id;
 session=storedSession();
 return previous!==session?.user?.id;
}
export class SessionExpired extends Error{
 constructor(){super('Deine Sitzung ist abgelaufen. Bitte melde Dich erneut an.');}
}
function save(value){session=value?{...value,expires_at:value.expires_at||Math.floor(Date.now()/1000)+(value.expires_in||3600)}:null;if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));else localStorage.removeItem(SESSION_KEY);}
function expireSession(){
 save(null);
 setTimeout(()=>{if(!session)window.dispatchEvent(new Event('andtalents-session-expired'));},0);
}
async function result(response){const raw=await response.text();let data;try{data=raw?JSON.parse(raw):{};}catch{throw Error('Der Server hat keine gültige Antwort geliefert.');}if(!response.ok){const message=data.message||data.error_description||data.msg||data.error||'Die Anfrage konnte nicht ausgeführt werden.';
 const error=Error(message.replace(/Company-Account/g,'Unternehmenskonto').replace(/Company-Profil/g,'Unternehmensprofil').replace(/Kernskills/g,'Skills').replace(/Fire Skills/g,'Top Skills').replace('Dieser Account','Dieses Konto'));error.status=response.status;error.code=data.error_code||data.code||data.error;throw error;}return data;}
async function refreshSession(owner){
 const current=storedSession();
 if(current?.user?.id!==owner)throw new SessionExpired();
 session=current;
 if(current.expires_at>Date.now()/1000+60)return;
 try{
  const value=await authRequest('/token?grant_type=refresh_token',{body:{refresh_token:current.refresh_token}});
  if(storedSession()?.refresh_token===current.refresh_token)save(value);
  else if(storedSession()?.user?.id===owner)session=storedSession();
  else throw new SessionExpired();
 }catch(error){
  if(error instanceof SessionExpired)throw error;
  if(error.status===400||error.status===401){
   const latest=storedSession();
   if(latest?.user?.id===owner&&latest.refresh_token!==current.refresh_token){session=latest;return;}
   if(latest?.refresh_token===current.refresh_token)expireSession();
   throw new SessionExpired();
  }
  throw Error('Die Verbindung konnte nicht hergestellt werden. Bitte erneut versuchen.');
 }
}
async function refresh(owner){
 if(session?.expires_at>Date.now()/1000+60)return;
 if(!refreshPromise){
  const run=()=>refreshSession(owner);
  refreshPromise=(navigator.locks?navigator.locks.request(SESSION_KEY,run):run()).finally(()=>{refreshPromise=null;});
 }
 await refreshPromise;
}
export async function request(path,{method='POST',body,headers={},raw=false,blob=false}={}){
 const owner=session?.user?.id;
 if(!owner)throw new SessionExpired();
 await refresh(owner);
 if(session?.user?.id!==owner||storedSession()?.user?.id!==owner)throw new SessionExpired();
 const current=session;
 const response=await fetchBounded(config.url+path,{method,cache:blob?'no-store':undefined,headers:{apikey:config.key,Authorization:'Bearer '+current.access_token,...(!raw?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:raw?body:JSON.stringify(body)});
 try{return blob&&response.ok?await response.blob():await result(response);}catch(error){
  if(error.status===401&&['PGRST301','bad_jwt','session_not_found','refresh_token_not_found'].includes(error.code)){
   if(storedSession()?.access_token===current.access_token)expireSession();
   throw new SessionExpired();
  }
  throw error;
 }
}
export async function api(action,payload={}){if(action==='recruiter_costs')return request('/rest/v1/rpc/app_recruiter_costs',{body:payload});if(action==='mark_swipe_notice')return request('/rest/v1/rpc/app_swipe_notice',{body:{phase:payload.phase}});return request('/rest/v1/rpc/app_api',{body:{action,payload}});}
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
async function authRequest(path,{method='POST',body,token}={}){
 return result(await fetchBounded(config.url+'/auth/v1'+path,{method,headers:{...authHeaders,...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)}));
}
async function passwordSession(email,password){return authRequest('/token?grant_type=password',{body:{email,password}});}
export async function login(email,password){const value=await passwordSession(email,password);save(value);return value;}
export function pendingRecovery(){
 try{
  const pending=JSON.parse(localStorage.getItem(RECOVERY_KEY)||'null');
  return pending?.expiresAt>Date.now()&&['talent','recruiter'].includes(pending.role)?pending:null;
 }catch{return null;}
}
export async function requestPasswordReset(email,role){
 const verifier=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
 const challenge=btoa(String.fromCharCode(...digest)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 const redirect=new URL('./',location.href);
 const previous=pendingRecovery();
 const pending={verifier,role,expiresAt:Date.now()+3600000};
 localStorage.setItem(RECOVERY_KEY,JSON.stringify(pending));
 try{await authRequest('/recover?'+new URLSearchParams({redirect_to:redirect.href}),{body:{email,code_challenge:challenge,code_challenge_method:'s256'}});}
 catch(error){
  if(pendingRecovery()?.verifier===verifier){
   if(previous)localStorage.setItem(RECOVERY_KEY,JSON.stringify(previous));
   else localStorage.removeItem(RECOVERY_KEY);
  }
  if(error.status===429)throw Error('Es wurden zu viele Anfragen gestellt. Bitte versuche es später erneut.');
  throw Error('Die E-Mail konnte gerade nicht angefordert werden. Bitte versuche es erneut.');
 }
}
export async function exchangeRecovery(code,pending){
 const value=await authRequest('/token?grant_type=pkce',{body:{auth_code:code,code_verifier:pending.verifier}});
 if(pendingRecovery()?.verifier===pending.verifier)localStorage.removeItem(RECOVERY_KEY);
 return value;
}
export async function finishPasswordReset(recovery,password){
 await authRequest('/user',{method:'PUT',token:recovery.access_token,body:{password}});
 try{await authRequest('/logout?scope=local',{token:recovery.access_token});}catch{/* The recovery token is discarded even if sign-out fails. */}
 if(storedSession()?.user?.id===recovery.user?.id)save(null);
}
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
export async function logout(){
 const owner=session?.user?.id;
 if(!owner)return;
 try{await request('/auth/v1/logout?scope=local',{body:{}});}
 catch(error){if(!(error instanceof SessionExpired))throw error;}
 finally{
  if(storedSession()?.user?.id===owner)save(null);
  else session=storedSession();
 }
}
export async function upload(file){if(file.size>5242880)throw Error('Dateien dürfen höchstens 5 MB groß sein.');const allowed=['application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];if(!allowed.includes(file.type))throw Error('Bitte PDF, Word, JPG oder PNG auswählen.');const ext=file.name.split('.').pop().replace(/[^a-z0-9]/gi,'');const path=session.user.id+'/'+crypto.randomUUID()+'.'+ext;await request('/storage/v1/object/application-documents/'+path,{body:file,raw:true,headers:{'Content-Type':file.type}});await api('document',{path,name:file.name});return path;}
export async function documentUrl(path){const data=await request('/storage/v1/object/sign/application-documents/'+path,{body:{expiresIn:60}});const url=data.signedURL||data.signedUrl;return url.startsWith('http')?url:config.url+(url.startsWith('/storage/v1')?'':'/storage/v1')+url;}
export async function deleteDocument(path){await request('/storage/v1/object/application-documents',{method:'DELETE',body:{prefixes:[path]}});await api('document',{path,decision:'delete'});}

const profilePictureBucket='/storage/v1/object/profile-pictures';
const profilePicturePath=owner=>owner+'/profile.jpg';

export async function readProfilePicture(){
 const owner=getSession()?.user?.id;
 const files=await request('/storage/v1/object/list/profile-pictures',{body:{prefix:owner,search:'profile.jpg',limit:1}});
 const picture=files.find(file=>file.name==='profile.jpg');
 if(!picture)return null;
 if(getSession()?.user?.id!==owner)throw new SessionExpired();
 return fetchProfilePicture(profilePicturePath(owner),picture.updated_at||picture.id);
}

export async function readMatchedProfilePicture(applicationId){
 const owner=getSession()?.user?.id;
 const picture=await request('/rest/v1/rpc/app_matched_profile_picture',{body:{p_application_id:applicationId}});
 if(!picture)return null;
 if(getSession()?.user?.id!==owner)throw new SessionExpired();
 return fetchProfilePicture(picture.path,picture.revision);
}

async function fetchProfilePicture(path,revision){
 try{
  return await request('/storage/v1/object/authenticated/profile-pictures/'+encodeURI(path)+'?v='+encodeURIComponent(revision),{method:'GET',blob:true});
 }catch(error){
  if(error.status===404||error.code==='NoSuchKey'||(error.status===400&&error.message==='Object not found'))return null;
  throw error;
 }
}

export async function saveProfilePicture(file){
 const owner=getSession()?.user?.id;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Bitte wähle ein Bild im Format JPG, PNG oder WebP.');
 if(file.size>5242880)throw Error('Das Profilbild darf höchstens 5 MB groß sein.');
 const image=await createImageBitmap(file).catch(()=>{throw Error('Dieses Bild konnte nicht gelesen werden.');});
 let picture;
 try{
  const scale=Math.min(1,512/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.width*scale));
  canvas.height=Math.max(1,Math.round(image.height*scale));
  const context=canvas.getContext('2d',{alpha:false});
  context.fillStyle='#fff';
  context.fillRect(0,0,canvas.width,canvas.height);
  context.drawImage(image,0,0,canvas.width,canvas.height);
  picture=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.88));
 }finally{image.close();}
 if(!picture)throw Error('Das Profilbild konnte nicht vorbereitet werden.');
 if(getSession()?.user?.id!==owner)throw new SessionExpired();
 await request(profilePictureBucket+'/'+profilePicturePath(owner),{body:picture,raw:true,headers:{'Content-Type':picture.type,'x-upsert':'true','cache-control':'max-age=0'}});
 return picture;
}

export async function removeProfilePicture(){
 await request(profilePictureBucket,{method:'DELETE',body:{prefixes:[profilePicturePath(getSession()?.user?.id)]}});
}
