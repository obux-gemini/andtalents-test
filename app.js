import {MIN_SKILLS,MATCH_MIN,TRAVEL_LABELS,selectedTravel,hasMinimumSkills,meetsMatchPolicy,mayShowNavigation,noticePhase} from './product-policy.js?v=0.9.2';
import {scorePill,matchOverview,skillList,skillsHeading,topSkillIcon} from './match-view.js?v=0.15.88';
import {api,request,candidateFeedRequest,login,signup,logout,changePassword,getSession,syncSession,SessionExpired,pendingRecovery,requestPasswordReset,exchangeRecovery,finishPasswordReset,upload,documentUrl,deleteDocument,profileWorkplaces,saveCompanySetup,readProfilePicture,saveProfilePicture,removeProfilePicture,readMatchedProfilePicture} from './backend.js?v=0.15.88';
import {sessionResources} from './session-resources.js?v=0.14';
import {activateDesktopTab,companyLabel,currentDesktopItem,desktopDetails,desktopTable,desktopViewport,expandDesktopDetails,selectDesktopItem} from './desktop-layout.js?v=0.15.58';
import {jobSkillSections} from './job-import-sections.js?v=0.15.22';
import {initializeTheme} from './theme-preferences.js?v=0.10.1';
initializeTheme();
const app=document.querySelector('#app'),modal=document.querySelector('#modal');
const matchPictureObservers=new WeakMap();
const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>value?new Date(value).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}):'–';
const money=value=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',minimumFractionDigits:Number.isInteger(value)?0:2}).format(value);
const costMonth=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric',timeZone:'UTC'});
const choices={employment:['Vollzeit','Teilzeit'],leadership:['ja','nein'],experience:['Einsteiger','Erfahren','Experte'],office:['100% Remote','100% Hybrid','100% Office'],size:['1-50 Mitarbeiter','51-250 Mitarbeiter','251-1000 Mitarbeiter','1000+ Mitarbeiter'],type:['Start-Up','Inhabergeführt','DAX'],culture:['Surfshop','Agentur','Corporate']};
const labels={employment:'Beschäftigungsart',leadership:'Mitarbeiterführung',experience:'Erfahrungslevel',office:'Arbeitsmodell',size:'Unternehmensgröße',type:'Unternehmenstyp',culture:'Unternehmenskultur'};
const optionLabels={
 '100% Remote':'100 % Remote','100% Hybrid':'Hybrid','100% Office':'100 % Office',
 '1-50 Mitarbeiter':'1–50 Mitarbeiter','51-250 Mitarbeiter':'51–250 Mitarbeiter',
 '251-1000 Mitarbeiter':'251–1.000 Mitarbeiter','1000+ Mitarbeiter':'mehr als 1.000 Mitarbeiter',
 'Start-Up':'Start-up','keine Reisen':'Keine Reisen','1-5 Tage pro Monat':'1–5 Tage pro Monat',
 '50% plus':'Mehr als 50 %','ja':'Ja','nein':'Nein',
 'English':'Englisch','German':'Deutsch','French':'Französisch','Chinese':'Chinesisch',
 'Spanish':'Spanisch','Italian':'Italienisch','Portuguese':'Portugiesisch','Polish':'Polnisch',
 'Dutch':'Niederländisch','Turkish':'Türkisch','Arabic':'Arabisch','Russian':'Russisch'
};
const optionLabel=value=>Object.hasOwn(optionLabels,value)?optionLabels[value]:value;
const month=value=>String(value||'').replace(/^(\d{4})-(\d{2})$/, '$2.$1');
const PROFILE_SUMMARY_LIMIT=240;
const applicationSent='Bewerbung gesendet. Nimmt der Recruiter sie an, habt Ihr ein Match.';
const state={me:null,draft:{},skills:[],catalog:new Map(),jobs:[],applications:[],applicationStatus:'',feed:[],saved:[],busy:false};
const resources=sessionResources(()=>getSession()?.user?.id);
const feedFreshFor=15000;
const feedUsableFor=60000;
const readMe=()=>resources.load('me',()=>api('me'),60000);
const readFeed=()=>resources.load('feed',()=>candidateFeedRequest(),feedFreshFor);
const readRecruiterJobs=(jobId)=>api('jobs',{include_candidate_counts:false,...(jobId?{job_id:jobId}:{})});

function invalidateCandidateFeed(jobId,keepOtherJobs=false){
 const cached=keepOtherJobs?resources.peek('feed',feedFreshFor):null;
 resources.invalidate('feed','newJobs','job:'+jobId);
 if(cached){
  const items=cached.items.filter(job=>job.id!==jobId);
  resources.set('feed',{items,count:items.length});
  if(routeKey==='/talent/dashboard'){
   displayNewJobCount(items.length);
   const slot=app.querySelector('#desktop-talent-dashboard');
   if(slot&&desktopViewport.matches)slot.outerHTML=talentDashboardPanels({items});
  }
 }else if(routeKey==='/talent/dashboard'){
  loadTalentDashboard();
 }
}
function loadPlaceholder(label){
 return `<div class="load-placeholder" role="status"><span class="sr-only">${E(label)}</span><span></span><span></span><span></span></div>`;
}

let pageVersion=0,searchVersion=0,countTimer,countVersion=0,toastTimer,routeKey='';
let renderedLocation, renderedHistory, recovery;
const resumeJobKey='andtalents-resume-job';
function jobSnapshot(form){
 const fields=[...new FormData(form)].filter(([name])=>!['workplace','occupation-search','skill-search'].includes(name));
 return {fields,skills:state.skills.map(({id,fire})=>[id,Boolean(fire)])};
}
function changedJob(){
 const form=app.querySelector('[data-form="job"]');
 return form?.jobBaseline&&!form.dataset.committed&&JSON.stringify(form.jobBaseline)!==JSON.stringify(jobSnapshot(form))?form:null;
}
function rememberInterruptedJob(){
 const owner=state.me?.profile?.user_id;
 if(!owner||!changedJob())return;
 saveDraft();
 sessionStorage.setItem(resumeJobKey,JSON.stringify({
  owner,path:routeKey,entry:history.state?.newJobEntry
 }));
}
function warnBeforeUnload(event){
 if(!changedJob())return;
 saveDraft();
 event.preventDefault();
 event.returnValue='';
}
function trackJobChanges(){
 if(changedJob())window.addEventListener('beforeunload',warnBeforeUnload);
 else window.removeEventListener('beforeunload',warnBeforeUnload);
}
function confirmJobDeparture(){
 const form=changedJob();
 if(!form)return true;
 if(state.busy)return false;
 if(!window.confirm('Änderungen verwerfen? Deine Änderungen an diesem Job sind noch nicht gespeichert.'))return false;
 form.dataset.committed='true';
 delete state.draft.jobEdits?.[form.dataset.draftKey];
 persistDraft();
 trackJobChanges();
 return true;
}
const go=path=>{
 if(location.hash==='#'+path)render();
 else if(confirmJobDeparture())location.hash=path;
};
function toast(text,error=false){const el=document.querySelector('#toast');el.textContent=text;el.className='show'+(error?' error-toast':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className='',5000);}
function errorBlock(error){return `<div class="error" role="alert">${E(error.message||error)}</div>`;}
function field(name,label,{type='text',value='',placeholder='',required=true,maxlength='',readonly=false,digitsOnly=false}={}){
 const postalCode=['postcode','site_postcode','billing_postcode'].includes(name);
 const numeric=type==='number'||postalCode;
 const limit=postalCode?5:type==='number'?8:type==='tel'||digitsOnly?30:maxlength;
 const digits=postalCode?'[0-9]{5}':digitsOnly?'[0-9]{6,30}':'0*[1-9][0-9]*';
return `<label class="field"><span>${E(label)}${required?' *':''}</span><input name="${E(name)}" type="${numeric?'text':type}" value="${E(value)}" placeholder="${E(placeholder)}" ${required?'required':''} ${limit?`maxlength="${limit}"`:''} ${readonly?'readonly class="readonly"':''} ${type==='password'?'minlength="8" autocomplete="new-password"':''} ${numeric||digitsOnly?`inputmode="numeric" pattern="${digits}" data-digits`:''} ${type==='tel'?`autocomplete="tel" ${digitsOnly?'':'pattern="[0-9+ .\\(\\)\\/\\-]{6,30}" data-phone'}`:''}></label>`;
}
const INDUSTRIES=[
 'Automobilindustrie','Baugewerbe & Bauwirtschaft','Beratung','Bildung, Erziehung & Unterricht',
 'Biotechnologie & Chemietechnik','Energieversorgung & Energiewirtschaft',
 'Finanzdienstleistungen & Versicherungen','Gemeinnützige Organisationen & NGOs','Gesundheitswesen','Handel',
 'Hotel- und Gastgewerbe','Immobilien-, Grundstücks- und Wohnungswesen','Industrie & Produktion',
 'IT und Internet','Kunst, Unterhaltung und Erholung','Land- und Forstwirtschaft, Fischerei',
 'Logistik, Lagerei & Verkehrswirtschaft','Luft- und Raumfahrt','Marketing & PR','Medien & Kommunikation',
 'Medizintechnik & Pharmaindustrie','Öffentliche Verwaltung','Personalwesen','Rechtswesen',
 'Schiffbau und Meerestechnik','sonstige Dienstleistungen','Telekommunikationsbranche',
 'Textil- und Bekleidungsbranche','Wasser, Abwasser & Entsorgung','Sonstiges'
];
function industryField(value){
 const legacy=value&&!INDUSTRIES.includes(value)?`<option value="${E(value)}" selected>${E(value)} (bisherige Branche)</option>`:'';
 const options=INDUSTRIES.map(industry=>`<option value="${E(industry)}"${industry===value?' selected':''}>${E(industry)}</option>`).join('');
 return `<label class="field"><span>Branche *</span><select tabindex="-1" name="industry" required><option value=""${value?'':' selected'} disabled>Branche auswählen</option>${legacy}${options}</select></label>`;
}
function companyProperties(fields,previous={}){
 return {
  ...Object.fromEntries(['office','size','type','culture'].map(key=>[key,fields[key]||''])),
  address:previous.address,
  postcode:previous.postcode,
  city:previous.city
 };
}
function pills(name,values,selected=[],{single=false,required=false,caption=''}={}){selected=Array.isArray(selected)?selected:[String(selected)];return `<div class="group"><label>${E(caption||labels[name]||name)}${required?' *':''}</label><div class="choices">${values.map((value,i)=>`<label class="choice"><input tabindex="-1" type="${single?'radio':'checkbox'}" name="${E(name)}" value="${E(value)}" ${selected.includes(String(value))?'checked':''} ${single&&required?'required':''}><span>${E(name==='radius'?(value==='de'?'Ganz Deutschland':value+' km'):name==='experience'?value+({'Einsteiger':' · 0–2 Jahre Erfahrung','Erfahren':' · 3–5 Jahre Erfahrung','Experte':' · mehr als 5 Jahre Erfahrung'}[value]||''):optionLabel(value))}</span></label>`).join('')}</div></div>`;}
const actionButton=(action,text,kind='',extra='')=>`<button type="button" class="btn ${kind}" data-action="${action}" ${extra}>${text}</button>`;
const glyphs={home:0xf015,user:0xf007,edit:0xf044,cards:0xe4df,send:0xf1d8,match:0xf560,bookmark:0xf02e,close:0xf00d,chart:0xf200,target:0xf140,company:0xf1ad,pin:0xf3c5,clock:0xf017,compass:0xf14e,check:0xf00c};
function icon(name,solid=false){return `<i class="fa-icon ${solid?'solid':''}" aria-hidden="true">${String.fromCodePoint(glyphs[name]||glyphs.check)}</i>`;}
const euroSymbol='<span class="currency-symbol" aria-hidden="true">€</span>';
function header(role,current){
 const session=getSession();
 const navigation=mayShowNavigation(role,state.me,routeKey,!!session);
 const account=state.me?.profile;
 const hasFeedback=routeKey==='/'||routeKey==='/home'||(role==='recruiter'&&account?.role==='recruiter'&&account.user_id===session?.user?.id);
 const name=account?.user_id===session?.user?.id
  ? [account?.first_name,account?.last_name].map(part=>part?.trim()).filter(Boolean).join(' ')
  : '';
 const dashboard=navigation?`<a class="iconbtn mobile-dashboard" href="#/${role}/dashboard" aria-label="Dashboard">${icon('home')}</a>`:'<span class="header-spacer"></span>';
 const profile=navigation?`<a class="iconbtn header-profile-link" href="#/${role}/profile">
  ${icon('user')}<span class="sr-only">Mein Profil</span><span class="desktop-label header-profile-label">
   <span aria-hidden="true">Mein Profil</span>
   ${name?`<span class="header-profile-name" title="${E(name)}">${E(name)}</span>`:''}
  </span>
 </a>`:'';
 return `<header class="header ${session?'':'guest-header'}${hasFeedback?' header-with-feedback':''}">
  ${dashboard}
  <a class="brand" href="#/"><img class="logo" src="./logo.webp" alt="&TALENTS Logo"><span class="app-version">Version 0.15.89</span></a>
  ${hasFeedback?`<a class="btn secondary header-feedback" href="#/recruiter/feedback" ${current==='feedback'?'aria-current="page"':''}>${icon('edit')} Feedback geben</a>`:''}
  <div class="header-actions">${profile}</div>
 </header>`;
}
function nav(role,current,desktop=false){
 if(!mayShowNavigation(role,state.me,routeKey,!!getSession()))return '';
 const links=role==='talent'?
  [['filter','edit','Job-Filter'],['jobs','cards','Jobs'],['applications','send','Bewerbungen'],['matches','match','Matches'],['saved','bookmark','Gespeicherte Jobs']]:
  [['jobs','cards','Jobs'],['applications','send','Bewerbungen'],['matches','match','Matches']];
 if(desktop){
  links.unshift(['dashboard','home','Dashboard']);
  if(role==='recruiter')links.push(['costs','€','Kosten'],['companies','company','Unternehmensprofile']);
  links.push(['profile','user','Mein Profil']);
 }else if(role==='recruiter')links.push(['costs','€','Kosten']);
 return `<nav class="${desktop?`desktop-nav desktop-nav-${role}`:'nav'}" aria-label="Hauptnavigation">${links.map(([path,glyph,title])=>{
  const active=current===path||routeKey.startsWith('/'+role+'/'+path+'/')||routeKey==='/'+role+'/'+path||(path==='companies'&&routeKey.startsWith('/recruiter/company/'))||(path==='jobs'&&routeKey.startsWith('/recruiter/job/'));
  const symbol=glyph==='€'?euroSymbol:icon(glyph);
  return `<a href="#/${role}/${path}" aria-label="${title}" title="${title}" ${active?'aria-current="page"':''} class="${active?'active':''}"${desktop?'':` data-nav-page="${path}"`}>${symbol}${desktop?`<span>${title}</span>`:''}</a>`;
 }).join('')}</nav>`;
}
function shell(role,current,content,counterRole=null){
 const rail=counterRole?`<div class="availability-rail" aria-label="Aktuelle Trefferzahl">${availabilityCounter(counterRole)}</div>`:'';
 const page=`<main class="page ${current==='jobs'&&role==='talent'?'swipe-page':''} ${counterRole?'page-with-counter':''}">${content}</main>`;
 const sidebar=nav(role,current,true);
 return header(role,current)+(sidebar?`<div class="desktop-shell">${sidebar}<div class="desktop-workspace">${rail}${page}</div></div>`:rail+page)+nav(role,current);
}
function narrow(content,role=routeKey.split('/')[1]||state.me?.profile?.role){role=['talent','recruiter'].includes(role)?role:null;return header(role,'')+`<main class="narrow ${role==='recruiter'?'onboarding-recruiter':''}">${content}</main>`+(role?nav(role,''):'');}
function steps(current,total,text){return `<div class="steps">${Array.from({length:total},(_,i)=>`${i?'<span class="step-line"></span>':''}<span class="step ${i+1===current?'active':i+1<current?'done':''}">${i+1<current?'✓':i+1}</span>`).join('')}</div><div class="step-caption">Schritt ${current} von ${total}: ${text}</div>`;}
function empty(title,text,link=''){return `<div class="empty"><div class="empty-icon">◇</div><h2>${E(title)}</h2><p>${E(text)}</p>${link}</div>`;}
function scoreBadge(score,kind='chart'){const n=Math.max(0,Math.min(100,Number(score)||0));return `<span class="score" aria-label="Skill-Match ${n} Prozent"><span class="score-fill" style="width:${n} %"></span><span class="score-value">${icon(kind,true)} ${n} %</span></span>`;}
function skillsWidget(job=false){return `<div class="group"><label>Skills * <span id="skill-count">(${state.skills.length}/10)</span></label><p class="hint">${job?'Wähle bis zu 10 Skills, die für diesen Job wichtig sind. Je genauer die Auswahl, desto passender die Kandidaten. Für die Veröffentlichung brauchst Du mindestens 5 Skills.':'Wähle mindestens 5 und höchstens 10 Skills. Du kannst nach einem Beruf oder direkt nach einzelnen Skills suchen.'}</p><label class="field skill-search"><span>${job?'Suche nach dem Beruf für diese Stelle':'Suche nach Deinem Beruf'}</span><input name="occupation-search" data-search="occupation" placeholder="z. B. Programmierer, Buchhalter, Designer" autocomplete="off"></label><div class="search-results" id="occupation-results"></div><label class="field skill-search"><span>Oder suche direkt nach Skills</span><input name="skill-search" data-search="skill" placeholder="z. B. Python, SAP, Schweißen" autocomplete="off"></label><div class="search-results" id="skill-results"></div><div role="status" data-skill-overlap></div><div id="selected-skills" class="skill-area"></div><p class="hint">Markiere bis zu 3 Skills mit ${topSkillIcon()} als Top Skills – ${job?'die Anforderungen, die Dir am wichtigsten sind':'Deine größten Stärken'}. Sie zählen beim Matching stärker.</p></div>`;}
const skillResultLabel=(label,selected)=>`${selected?'✓':'＋'} ${label}`;
function skillResult(s){
 const selected=state.skills.some(skill=>Number(skill.id)===Number(s.id));
 return `<button type="button" class="result${selected?' selected':''}" data-action="toggle-skill" data-id="${s.id}" data-label="${E(s.label)}" aria-pressed="${selected}">${E(skillResultLabel(s.label,selected))}</button>`;
}
function markSkillResults(){
 document.querySelectorAll('.search-results [data-action="toggle-skill"]').forEach(button=>{
  const selected=state.skills.some(skill=>String(skill.id)===button.dataset.id);
  button.classList.toggle('selected',selected);
  button.setAttribute('aria-pressed',String(selected));
  button.textContent=skillResultLabel(button.dataset.label,selected);
 });
}
function selectedSkillList(skills,editable=false){
 const rows=skills.map(s=>editable?`<li class="selected-skill-row"><button type="button" class="top-skill-toggle" data-action="fire" data-id="${s.id}" aria-label="Top Skill ${E(s.label)}" aria-pressed="${!!s.fire}">${topSkillIcon(s.fire)}</button><span>${E(s.label)}</span><button type="button" class="remove-skill" data-action="remove-skill" data-id="${s.id}" aria-label="${E(s.label)} entfernen">×</button></li>`:`<li class="selected-skill-row"><span class="selected-skill-marker">${s.fire?topSkillIcon(true,'Top Skill'):''}</span><span>${E(s.label)}</span></li>`).join('');
 return rows?`<ul class="selected-skill-list${editable?'':' static-skill-list'}">${rows}</ul>`:'<p class="hint">Noch keine Skills ausgewählt.</p>';
}
function paintSkills(){const el=document.querySelector('#selected-skills');if(!el)return;el.innerHTML=`<h3 class="skill-title">Ausgewählte Skills (${state.skills.length}/10)</h3>${selectedSkillList(state.skills,true)}`;document.querySelector('#skill-count').textContent=`(${state.skills.length}/10)`;markSkillResults();updateDesktopJobPreview();}
function paintSkillOverlapNotice(notice){
 const target=notice.closest('form')?.dataset.form==='candidate'?'Jobs':'Kandidaten';
 const explanation=`Verschiedene Skills helfen uns besser passende ${target} zu finden, Du kannst aber trotzdem beide Skills auswählen.`;
 notice.innerHTML=[...notice.skillPairs.values()].map(({message})=>`<div class="notice orange skill-overlap-notice"><p>${E(message)}</p><p>${explanation}</p></div>`).join('');
}
async function checkSkillOverlaps(form,added,results){
 const notice=form?.querySelector('[data-skill-overlap]');
 if(!notice||state.skills.length<2||!added.length)return;
 const snapshot=new Map(state.skills.map(skill=>[Number(skill.id),skill]));
 try{
  const pairs=await request('/rest/v1/rpc/app_skill_selection_overlaps',{body:{p_skill_ids:[...snapshot.keys()]}});
  if(!notice.isConnected)return;
  const current=new Map(state.skills.map(skill=>[Number(skill.id),skill]));
  const notices=notice.skillPairs??=new Map();
  const previousCount=notices.size;
  for(const {source_id,target_id,relationship} of pairs){
   const source=snapshot.get(source_id),target=snapshot.get(target_id);
   if(!source||!target||current.get(source_id)!==source||current.get(target_id)!==target)continue;
   if(!added.includes(source_id)&&!added.includes(target_id))continue;
   const key=[source_id,target_id].sort((a,b)=>a-b).join(':');
   if(notices.has(key))continue;
   const message=relationship==='hierarchy'
    ? `${source.label} wird durch ${target.label} bereits abgedeckt.`
    : `${source.label} und ${target.label} sind austauschbar.`;
   notices.set(key,{source_id,target_id,message});
  }
  if(notices.size===previousCount)return;
  if(results?.isConnected)results.after(notice);
  paintSkillOverlapNotice(notice);
 }catch{
  // The optional hint does not interrupt selecting or saving skills.
 }
}
function updateSkillSelection(button,action,id){
 const form=button.closest('form');
 const skill=state.skills.find(item=>String(item.id)===id);
 if(action==='fire'){
  if(!skill)return;
  if(!skill.fire&&state.skills.filter(item=>item.fire).length>=3){toast('Maximum von 3 Top Skills erreicht.',true);return;}
  skill.fire=!skill.fire;
 }else if(action==='remove-skill'||(action==='toggle-skill'&&skill)){
  state.skills=state.skills.filter(skill=>String(skill.id)!==id);
  const notice=form?.querySelector('[data-skill-overlap]');
  if(notice?.skillPairs?.size){
   const previousCount=notice.skillPairs.size;
   for(const [key,{source_id,target_id}] of notice.skillPairs){
    if(source_id===Number(id)||target_id===Number(id))notice.skillPairs.delete(key);
   }
   if(notice.skillPairs.size!==previousCount)paintSkillOverlapNotice(notice);
  }
 }else{
  const incoming=action==='add-package'?state.package||[]:[state.catalog.get(Number(id))];
  const added=[];
  for(const skill of incoming){
   if(!skill||state.skills.some(item=>Number(item.id)===Number(skill.id)))continue;
   if(state.skills.length>=10){toast('Maximum von 10 Skills erreicht.',true);break;}
   state.skills.push({id:skill.id,label:skill.label,fire:false});
   added.push(Number(skill.id));
  }
  void checkSkillOverlaps(form,added,button.closest('.search-results'));
 }
 paintSkills();
 saveDraft();
 scheduleCount();
}
function desktopTabs(kind,tabs){
 return `<div class="desktop-${kind}-tabs desktop-only" role="group">${tabs.map(([id,label],index)=>
  `<button class="btn secondary small" type="button" data-desktop-tab="${id}" aria-pressed="${index===0}">${label}</button>`).join('')}</div>`;
}
function prefsForm(p={},job=false){
 const location=`<section class="filter-group">${job?`<h2>Arbeitsort</h2><div id="workplace-picker"></div>${field('address','Straße & Hausnummer',{value:p.address||'',required:false})}`:'<h2>Suchort</h2>'}<div class="cols${job?'':' candidate-location'}">${field('postcode','PLZ',{value:p.postcode||'',placeholder:'z. B. 10115',required:job||(p.radius||'de')!=='de'})}${job?field('city','Stadt',{value:p.city||'',placeholder:'z. B. Berlin'}):`<label class="field"><span>Stadt / Stadtteil</span><output class="city-display" id="candidate-city">${E(p.city||'–')}</output><input type="hidden" name="city" value="${E(p.city||'')}"></label>`}</div><div id="postcode-hint" class="hint" aria-live="polite"></div>${job?actionButton('open-workplace','+ Standort hinzufügen','secondary small'):pills('radius',['10','25','50','100','de'],p.radius||'de',{single:true,caption:'Umkreis'})}</section>`;
 const general=`${pills('travel',TRAVEL_LABELS,selectedTravel(p.travel,job).map(i=>TRAVEL_LABELS[i]),{single:job,required:true,caption:'Reisebereitschaft'})}${pills('employment',job?[...choices.employment,'Vollzeit oder Teilzeit']:choices.employment,job&&p.employment?.length===2?['Vollzeit oder Teilzeit']:p.employment||[],{required:true,single:job})}`;
 const skillPicker=skillsWidget(job);
 const requirements=`${pills('experience',choices.experience,p.experience||[],{required:true,single:job,caption:job?'Erforderliches Erfahrungslevel':'Erfahrungslevel'})}<section class="filter-group">${field(job?'max_salary':'min_salary',job?'Maximales Gehalt (brutto/Jahr)':'Mindestgehalt (brutto/Jahr)',{type:'number',value:p[job?'max_salary':'min_salary']||'',placeholder:'z. B. 45000'})}<p class="hint">${job?'Kandidaten sehen das maximale Gehalt nicht. Wir nutzen es ausschließlich für das Matching.':'Dein Mindestgehalt sieht niemand, weder der Recruiter noch der Arbeitgeber. Wir nutzen es und den Gehaltsrahmen des Jobs ausschließlich für das Matching.'}</p></section>${pills('leadership',choices.leadership,p.leadership||[],{required:true,single:job})}`;
 const optional=`${!job?`<div class="section-label">Optionale Angaben</div><p class="hint">Verfeinere Deine Treffer. Mehrfachauswahl möglich.</p>${['office','size','type','culture'].map(k=>pills(k,choices[k],p[k]||[])).join('')}`:''}`;
 return '<div class="section-label">Notwendige Angaben</div>'+location+general+skillPicker+requirements+optional;
}
function readPrefs(form,job=false){const f=new FormData(form);const get=name=>f.getAll(name);return {postcode:String(f.get('postcode')||''),city:String(f.get('city')||''),address:String(f.get('address')||''),radius:String(f.get('radius')||'de'),travel:job?(f.has('travel')?TRAVEL_LABELS.indexOf(f.get('travel')):null):get('travel').map(x=>TRAVEL_LABELS.indexOf(x)),employment:get('employment').includes('Vollzeit oder Teilzeit')?['Vollzeit','Teilzeit']:get('employment'),leadership:get('leadership'),experience:get('experience'),[job?'max_salary':'min_salary']:Number(f.get(job?'max_salary':'min_salary')), ...Object.fromEntries(['office','size','type','culture'].map(k=>[k,get(k)]))};}
function errorToForm(form,error){const el=form.querySelector('.form-error');if(el){el.innerHTML=errorBlock(error);el.scrollIntoView({behavior:'smooth',block:'center'});}else toast(error.message,true);}
function validPassword(p){return p.length>=8&&/[A-Z]/.test(p)&&/[a-z]/.test(p)&&/\d/.test(p)&&/[\W_]/.test(p);}
const recruiterDemoEmails={
 recruiter:'recruiter001@example.invalid',
 headhunter:'demo-headhunter-01@example.invalid'
};
const candidateDemoEmails={backend:'candidate001@example.invalid',data:'candidate002@example.invalid'};
const isSharedDemo=email=>[...Object.values(recruiterDemoEmails),...Object.values(candidateDemoEmails)].includes(email?.toLowerCase());
function home(){return narrow(`<section class="welcome"><h1 class="welcome-headline">Schneller finden,<br> was wirklich <span class="welcome-headline-accent">passt.</span></h1><p class="intro">Echte Skills. Klare Anforderungen.<br>Finde heraus, wer wirklich zusammenpasst.</p><div class="role-cards"><a class="role-card" href="#/talent/onboarding" data-new-registration="talent"><span class="symbol">${icon('user')}</span><strong>Für Kandidaten</strong><small>Profil anlegen und passende Jobs entdecken</small></a><a class="role-card" href="#/recruiter/onboarding" data-new-registration="recruiter"><span class="symbol">${icon('cards')}</span><strong>Für Recruiter</strong><small>Unternehmensprofil und Jobs anlegen</small></a></div><div class="row" style="justify-content:center"><a href="#/talent/login">Anmelden für Kandidaten</a><span class="muted">·</span><a href="#/recruiter/login">Anmelden für Recruiter</a></div></section><div class="box"><h3>Mit Testdaten ausprobieren</h3><p class="hint">Wähle ein Testkonto und probiere den Ablauf vom Treffer über die Bewerbung bis zum Match aus.</p><div class="demo-list">${actionButton('demo','<span>Miriam · Recruiter</span><span>→</span>','secondary','data-email="'+recruiterDemoEmails.recruiter+'" data-role="recruiter"')}${actionButton('demo','<span>Robin · Headhunter</span><span>→</span>','secondary','data-email="'+recruiterDemoEmails.headhunter+'" data-role="recruiter"')}${actionButton('demo','<span>Lena · Backend-Entwicklerin</span><span>→</span>','secondary','data-email="'+candidateDemoEmails.backend+'" data-role="talent"')}${actionButton('demo','<span>Amir · Datenanalyst</span><span>→</span>','secondary','data-email="'+candidateDemoEmails.data+'" data-role="talent"')}</div></div><p class="footer-note">&TALENTS · Online-Testumgebung<br>Nur fiktive Angaben verwenden. Alle Matchkosten sind simuliert.</p>`);}
function guestPage(role,page){const titles={jobs:'Deine Jobs',filter:'Dein Job-Filter',applications:'Deine Bewerbungen',matches:'Deine Matches',saved:'Gespeicherte Jobs',profile:'Dein Profil'};return shell(role,page,`<h1>${{jobs:icon('cards'),filter:icon('edit'),applications:icon('send'),matches:icon('match'),saved:icon('bookmark'),profile:icon('user')}[page]||''} ${titles[page]||'Willkommen'}</h1>${empty('Dein Profil ist noch nicht angelegt','Lege zuerst Dein Konto an. Anschließend kannst Du Deinen Job-Filter einrichten und passende Jobs entdecken.',`<a class="btn orange" href="#/${role}/onboarding">Profil anlegen</a><a class="back-link" href="#/${role}/login">Bereits registriert? Anmelden</a>`)}`);}
const testEnvironmentNote='<p class="hint login-test-note"><strong>Hinweis für die Testumgebung</strong><br>Neue Adressen mit @example.invalid benötigen keine E-Mail-Bestätigung. Es entstehen keine echten Matchkosten.</p>';
function loginPage(role){return narrow(`<h1>Anmelden für ${role==='talent'?'Kandidaten':'Recruiter'}</h1><p class="intro">Melde Dich mit Deiner E-Mail-Adresse und Deinem Passwort an.</p><form data-form="login" data-role="${role}" class="box">${field('email','E-Mail',{type:'email',placeholder:'Deine E-Mail-Adresse'})}${testEnvironmentNote}<div class="field"><label for="login-password">Passwort *</label><div class="password-entry"><input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Dein Passwort" required>${actionButton('toggle-password','Anzeigen','secondary small','aria-controls="login-password"')}</div></div><div class="form-error"></div><button class="btn full">Anmelden →</button></form><p class="hint"><a href="#/${role}/forgot-password">Passwort vergessen?</a></p><p class="hint" style="text-align:center">Noch kein Konto? <a href="#/${role}/onboarding">Jetzt registrieren</a></p><a class="back-link" href="#/">← Zur Startseite</a>`);}
function passwordRecoveryPage(role,reset=false){
 const openRequest=`<a class="btn secondary" href="#/${role}/forgot-password">Neuen Link anfordern</a>`;
 const back=`<a class="back-link" href="#/${role}/login">Zur Anmeldung</a>`;
 if(reset&&!recovery?.session)return narrow(`<h1>Passwort zurücksetzen</h1><p>Der Link ist ungültig oder abgelaufen. Öffne den Link im selben Browser, in dem Du ihn angefordert hast.</p>${openRequest}${back}`,role);
 const controls=reset
  ? '<label class="field"><span>Neues Passwort *</span><input type="password" name="password" autocomplete="new-password" required minlength="8"></label><p class="hint">Mindestens 8 Zeichen mit Groß- und Kleinbuchstaben, einer Zahl und einem Sonderzeichen.</p><label class="field"><span>Neues Passwort wiederholen *</span><input type="password" name="repeat" autocomplete="new-password" required minlength="8"></label>'
  : field('email','E-Mail',{type:'email',placeholder:'Deine E-Mail-Adresse'});
 return narrow(`<h1>${reset?'Neues Passwort festlegen':'Passwort vergessen?'}</h1>${reset?'':'<p class="intro">Fordere einen Link zum Zurücksetzen Deines Passworts an. Öffne ihn in diesem Browser.</p>'}
  <form class="box" data-form="${reset?'reset-password':'request-password-reset'}" data-role="${role}">
  ${controls}<div class="form-error"></div><button class="btn full">${reset?'Passwort speichern':'Link anfordern'}</button></form>${back}`,role);
}
function registrationSessionPage(role){
 const label=state.me?.profile?.first_name||getSession()?.user?.email;
 return narrow(`<h1>Du bist bereits angemeldet</h1><p class="intro">Du bist als ${E(label)} angemeldet. Möchtest Du Dich abmelden und ein neues Konto anlegen?</p>
  <div class="box">${actionButton('logout-for-registration','Abmelden und registrieren','orange',`data-id="${role}"`)}
  <a class="btn secondary" href="#/${state.me?.profile?.role||role}/dashboard">Zum Dashboard</a></div>`,role);
}
function accountPage(role){
 return narrow(`${steps(1,role==='talent'?2:3,role==='talent'?'Profil anlegen':'Registrierung')}<h1>${role==='talent'?'Profil anlegen':'Konto für Recruiter'}</h1><p class="intro">${role==='talent'?'Zunächst benötigen wir ein paar Angaben zu Dir. Danach richtest Du Deinen Job-Filter ein und kannst direkt mit dem Swipen beginnen.':'Lege zunächst Dein persönliches Konto für Recruiter an. Diese Angaben dienen der Benutzerverwaltung und der Kommunikation innerhalb Deines Unternehmenskontos.'}</p><form data-form="account" data-role="${role}" class="box" autocomplete="off" ${role==='recruiter'?'novalidate':''}>${field('first_name','Vorname',{placeholder:role==='talent'?'Dein Vorname':'Max'})}${field('last_name','Nachname',{placeholder:role==='talent'?'Dein Nachname':'Mustermann'})}${role==='recruiter'?field('phone','Telefon',{type:'tel',placeholder:'+49 123 456789'})+'<h3>Anmeldedaten</h3>':''}${field('email','E-Mail',{type:'email',placeholder:role==='talent'?'deine@email.de':'max@muster-gmbh.de'})}${testEnvironmentNote}${field('password','Passwort',{type:'password',placeholder:'Dein Passwort'})}<ul class="password-rules" id="password-rules">${['Mindestens 8 Zeichen','Mindestens 1 Großbuchstabe','Mindestens 1 Kleinbuchstabe','Mindestens 1 Zahl','Mindestens 1 Sonderzeichen'].map(x=>`<li>${x}</li>`).join('')}</ul><div class="spacer"></div>${field('repeat','Passwort wiederholen',{type:'password',placeholder:'Passwort wiederholen'})}<p class="hint"><a class="text-link" href="./legal/">Rechtliche Hinweise zur Testumgebung</a></p><div class="form-error"></div><div class="spacer"></div><button class="btn orange full">Weiter →</button></form><a class="back-link" href="#/${role}/login">Bereits registriert? Anmelden</a>`);
}
function candidateForm(onboarding=false){const c=state.me?.candidate;const p=state.draft.talentPrefs||c?.preferences||{};state.skills=structuredClone(state.draft.talentSkills||c?.skills||[]);const form=`${onboarding?steps(2,2,'Job-Filter einrichten'):''}<h1>${icon('edit')} Dein Job-Filter</h1><p class="intro">Alle Angaben in Deinem Job-Filter beeinflussen Deine persönlichen Treffer.</p><form data-form="candidate" data-count-form id="matching-form" class="box">${prefsForm(p)}<div class="form-error"></div><button class="btn orange full">${onboarding?'Job-Filter speichern & Swipen starten':'Job-Filter speichern'} →</button></form>`;return shell('talent','filter',form,'talent');}
const companyRoute=(accountId,profileId='')=>`/recruiter/company/${accountId}${profileId?'/'+profileId:''}`;
const companyFilters=['office','size','type','culture'];
const companyAccount=()=>state.me.companies.find(company=>company.is_active!==false);

function companyDirectory(current=''){
 const company=companyAccount();
 const profiles=state.me.company_profiles.filter(profile=>profile.company_id===company?.id);
 return `<aside class="box desktop-company-list" aria-label="Unternehmensprofile">
  ${profiles.length?`<ul class="company-directory-profiles">${profiles.map(profile=>`<li><a class="company-profile-link" href="#${E(companyRoute(company.id,profile.id))}"${profile.id===current?' aria-current="page"':''}>${E(profile.public_name)}</a></li>`).join('')}</ul>`:''}
  <a class="btn secondary small" href="#${E(company?companyRoute(company.id,'new'):'/recruiter/company/new')}">+ Unternehmensprofil</a>
 </aside>`;
}

function workplaceFields(place={},prefix=''){
 return `${field(prefix+'address','Straße & Hausnummer',{value:place.address,maxlength:200})}<div class="cols">
  ${field(prefix+'postcode','PLZ',{value:place.postcode,maxlength:5,digitsOnly:true})}
  ${field(prefix+'city','Stadt',{value:place.city,maxlength:100})}
 </div>`;
}

function companyForm(mode,company={},profile={}){
 const onboarding=mode==='onboarding';
 const accountOnly=mode==='account';
 const hasAccountFields=onboarding||accountOnly||!company.id;
 const firstSite=!profile.id&&!accountOnly;
 const key=[mode,company.id||'new',profile.id||'new'].join('/');
 const stored=state.draft.companyFields;
 const f=stored?.key===key?stored:{};
 const value=(name,fallback='')=>f[name]??fallback;
 const address=Object.fromEntries(addressFields.map(name=>[name,value(name,company[name])]));
 const billingAddress=Object.fromEntries(addressFields.map(name=>[name,value('billing_'+name,company.billing_address?.[name]??'')]));
 const separateBilling=stored?.key===key?f.separate_billing==='on':Boolean(company.billing_address);
 const siteAddress=Object.fromEntries(addressFields.map(name=>[name,value('site_'+name)]));
 const legalName=value('legal_name',company.legal_name||'');
 const customName=f.customName??!!profile.id;
 const accountFields=`<h2>Unternehmenskonto</h2><p class="hint">Diese Angaben dienen der Abrechnung, Benutzerverwaltung und Administration.</p>
  ${field('legal_name','Firmenname',{value:legalName,placeholder:'Muster GmbH'})}${workplaceFields(address)}
  <label class="history-toggle"><input type="checkbox" name="separate_billing" aria-controls="billing-address-fields"${separateBilling?' checked':''}>Abweichende Rechnungsadresse</label>
  <fieldset class="profile-fields" id="billing-address-fields" aria-label="Abweichende Rechnungsadresse"${separateBilling?'':' hidden disabled'}>${workplaceFields(billingAddress,'billing_')}</fieldset>`;
 const firstWorkplace=`<section class="group company-first-workplace"><h3>Erster Standort</h3>
  <div class="company-location-actions">${actionButton('copy-company-address','Unternehmensadresse übernehmen','secondary small')}</div>
  ${field('site_name','Standortname',{value:value('site_name'),maxlength:80})}${workplaceFields(siteAddress,'site_')}</section>`;
 const profileFields=`<h2>Unternehmensprofil</h2><p class="hint">Diese Angaben sehen Kandidaten bei Deinen Jobs.</p>
  ${field('public_name','Firmenname für Kandidaten',{value:value('public_name',profile.public_name||(onboarding?legalName:''))})}
  ${firstSite?firstWorkplace:''}${industryField(value('industry',profile.industry||''))}
  ${field('language','Arbeitssprache',{value:optionLabel(value('language',profile.language||'Deutsch'))})}
  <p class="hint">Diese Angaben helfen Kandidaten beim Filtern der Jobs.</p>
  ${companyFilters.map(name=>pills(name,choices[name],value(name,profile.properties?.[name]||''),{single:true,required:true})).join('')}`;
 const back=profile.id?companyRoute(company.id,profile.id):'/recruiter/companies';
 const form=`<form data-form="company" data-count-form data-company-mode="${mode}" data-company-id="${E(company.id||'')}" data-profile-id="${E(profile.id||'')}" data-company-key="${E(key)}" data-custom-name="${customName}" class="box" novalidate>
  ${hasAccountFields?accountFields:''}${hasAccountFields&&!accountOnly?'<div class="divider"></div>':''}${accountOnly?'':profileFields}
  <div class="form-error" aria-live="polite"></div>
  ${accountOnly?`<div class="form-actions">${actionButton('cancel-company-account','Abbrechen','secondary')}<button type="submit" class="btn orange">Unternehmenskonto speichern</button></div>`:`<button class="btn orange full">${onboarding?'Weiter zum Job':'Unternehmensprofil speichern'} →</button>`}
 </form>`;
 const heading=onboarding?'Unternehmensprofil':accountOnly?'Unternehmenskonto bearbeiten':profile.id?'Unternehmensprofil bearbeiten':'Neues Unternehmensprofil';
 const intro=onboarding?'<p class="intro">Lege Dein Unternehmenskonto und das öffentliche Profil für Deine Jobs an.</p>':'';
 return shell('recruiter','',`${onboarding?steps(2,3,'Unternehmenskonto &amp; -profil'):''}<h1>${icon('company')} ${heading}</h1>${intro}
  ${form}${onboarding||accountOnly?'':`<a class="form-back" href="#${E(back)}">← Zur Übersicht</a>`}`,accountOnly?null:'recruiter');
}

function companyOverview(company,profile){
 const details=[['Firmenname für Kandidaten',profile.public_name],['Branche',profile.industry],['Arbeitssprache',optionLabel(profile.language)],
  ...companyFilters.map(name=>[labels[name],optionLabel(profile.properties?.[name]||'–')])];
 const content=`<div class="row between"><h1>${icon('company')} Unternehmensprofile</h1><a class="btn secondary small" href="#${E(companyRoute(company.id,'account'))}">Unternehmenskonto bearbeiten</a></div><div class="desktop-company-layout">
  ${companyDirectory(profile.id)}
  <section class="box company-overview">
   <h2>${E(profile.public_name)}</h2>
   <div class="row company-mobile-tabs" role="group" aria-label="Unternehmensprofil">
    ${actionButton('company-tab','Profildaten','secondary small','data-id="facts" aria-pressed="true"')}
    ${actionButton('company-tab','Standorte','secondary small','data-id="sites" aria-pressed="false"')}
   </div>
   <div class="company-profile-columns" data-company-tab="facts">
    <section class="company-facts"><h3>Profildaten</h3><dl class="company-profile-facts">${details.map(([label,value])=>`<div><dt>${E(label)}</dt><dd>${E(value)}</dd></div>`).join('')}</dl>
     <a class="btn secondary" href="#${E(companyRoute(company.id,profile.id))}/edit">Profil bearbeiten</a>
    </section>
    <section class="company-sites"><h3>Standorte</h3><div data-company-workplaces="${E(profile.id)}" aria-live="polite"><p class="hint">Wird geladen …</p></div></section>
   </div>
  </section>
 </div>`;
 return shell('recruiter','',content);
}

function companiesPage(id,profileId,mode){
 const {companies,company_profiles:profiles}=state.me;
 const company=companyAccount();
 if(id&&id!=='new'&&!companies.some(item=>item.id===id))throw Error('Unternehmenskonto nicht gefunden.');
 if(id==='new'||profileId==='new')return companyForm('new',company||{});
 if(!company)return companyForm('new');
 if(profileId==='account')return companyForm('account',company);
 const profile=profiles.find(item=>item.company_id===company.id&&(!profileId||item.id===profileId));
 if(profileId&&!profile)throw Error('Unternehmensprofil nicht gefunden.');
 if(!profile)return companyForm('new',company);
 return mode==='edit'?companyForm('edit',company,profile):companyOverview(company,profile);
}
function resizeTextarea(input){
 if(!input?.getClientRects().length)return;
 input.style.height='auto';
 input.style.height=(input.scrollHeight+input.offsetHeight-input.clientHeight)+'px';
}
function resizeJobDescription(input=document.querySelector('[data-form="job"] textarea[name="description"]')){
 resizeTextarea(input);
}
function resizeProfileSummary(){
 const input=document.querySelector('.profile-summary');
 if(!input)return;
 input.form.querySelector('#profile-summary-count').textContent=`${input.value.length}/${PROFILE_SUMMARY_LIMIT}`;
 resizeTextarea(input);
}
function requireMinimumSkills(){if(!hasMinimumSkills(state.skills))throw Error('Bitte wähle mindestens 5 und höchstens 10 Skills aus.');}

const jobImportMarkup=()=>`<details class="group job-import">
  <summary>Stellenanzeige importieren</summary>
  <p class="hint">Gib den öffentlichen Link zu einer einzelnen Anzeige auf einer Karriereseite ein. Für die Skillvorschläge werden nur Aufgaben und Anforderungen ausgewertet.</p>
  <label class="field"><span>Link zur Stellenanzeige</span><input type="text" data-job-import-url inputmode="url" maxlength="2048" placeholder="https://…"></label>
  ${actionButton('import-job-link','Link auslesen','secondary')}
  <details data-job-import-paste>
   <summary>Anzeigentext einfügen</summary>
   <p class="hint">Füge die Abschnitte mit ihren Überschriften ein oder setze „Aufgaben“ und „Anforderungen“ jeweils in eine eigene Zeile.</p>
   <label class="field"><span>Text der Stellenanzeige</span><textarea data-job-import-text maxlength="24000"></textarea></label>
   ${actionButton('import-job-text','Skills finden','secondary')}
  </details>
  <p class="hint" role="status" data-job-import-status></p>
  <div data-job-import-results></div>
 </details>`;
async function importJob(button,fromLink){
 const section=button.closest('.job-import');
 const status=section.querySelector('[data-job-import-status]');
 const results=section.querySelector('[data-job-import-results]');
 const form=button.form;
 const input=section.querySelector(fromLink?'[data-job-import-url]':'[data-job-import-text]');
 const value=input.value.trim();
 if(!value||(fromLink&&!URL.canParse(value))){
  status.textContent=fromLink?'Bitte gib einen gültigen Link ein.':'Bitte füge den Anzeigentext ein.';
  input.focus();
  return;
 }
 const actions=[...section.querySelectorAll('[data-action^="import-job-"]')];
 actions.forEach(item=>item.disabled=true);
 results.replaceChildren();
 status.textContent='Anzeige wird ausgewertet …';
 try{
  const text=fromLink?'':jobSkillSections(value);
  const {title,skills,sectionsFound}=fromLink
   ? await request('/functions/v1/job-import',{body:{url:value}})
   : {skills:text?await request('/rest/v1/rpc/app_job_import_skills',{body:{p_text:text}}):[],sectionsFound:Boolean(text)};
  if(!section.isConnected)return;
  skills.forEach(skill=>state.catalog.set(skill.id,skill));
  results.importedTitle=title;
  results.innerHTML=(title?`<p><strong>Erkannter Jobtitel</strong><br>${E(title)}</p>${actionButton('use-imported-job-title','Jobtitel übernehmen','secondary small')}`:'')+
   (skills.length?`<p class="hint">Wähle bis zu zehn Skills für Deinen Job aus. Weitere Skills kannst Du über die Suche ergänzen.</p>${skillsHeading}<div class="search-results">${skills.map(skillResult).join('')}</div>`:'');
  if(sectionsFound===false){
   status.textContent='Keine Aufgaben oder Anforderungen erkannt. Füge die Abschnitte mit ihren Überschriften ein.';
   section.querySelector('[data-job-import-paste]').open=true;
  }else status.textContent=skills.length?`${skills.length} Skills gefunden.`:'In den Aufgaben und Anforderungen wurden keine Skills aus dem Katalog gefunden.';
 }catch(error){
  if(!form.isConnected)return;
  status.textContent=fromLink?'Die Anzeige konnte nicht geladen werden. Du kannst den Anzeigentext einfügen.':error.message;
  if(fromLink)section.querySelector('[data-job-import-paste]').open=true;
 }finally{
  actions.forEach(item=>item.disabled=false);
 }
}

function jobForm(job=null,onboarding=false){
 const key=job?.id||(onboarding?'new':'new-job');
 job=state.draft.jobEdits?.[key]||job;
 state.draft.job=job||{};
 state.skills=structuredClone(job?.skills||[]);
 const profiles=state.me.company_profiles;
 const selected=job?.company_profile_id||state.draft.companyProfile?.id;
 const profile=profiles.find(item=>item.id===selected)||profiles[0];
 const preferences=job?.preferences||defaultProfileAddress(profile);
 const description=job?.description||'';
 const content=`${onboarding?steps(3,3,'Job'):''}<h1>${icon('cards')} ${job?.id?'Job bearbeiten':'Neuer Job'}</h1>
  <p class="intro">Lege die Anforderungen für Deinen Job fest. Sobald Deine Matching-Angaben vollständig sind, siehst Du, wie viele Kandidaten dazu passen.</p>
  <div class="desktop-editor">
    <form data-form="job" data-workplace-profile="${E(profile?.id||'')}" data-workplace-default="${!job}" data-draft-key="${E(key)}" data-count-form id="matching-form" class="box" novalidate>
     <div class="job-validation" tabindex="-1" hidden></div>
    <label class="field"><span>Unternehmensprofil *</span>
     <select tabindex="-1" name="company_profile_id" required>${profiles.map(item=>`<option value="${E(item.id)}"${item.id===profile?.id?' selected':''}>${E(item.public_name)}</option>`).join('')}</select>
    </label>
    <div class="job-count${job?.id?'':' job-count-new'}">${availabilityCounter('recruiter')}</div>
    ${!job?.id?jobImportMarkup():''}
    ${field('title','Jobtitel',{value:job?.title||'',placeholder:'z. B. Softwareentwickler/in'})}
    <label class="field"><span>Kurzbeschreibung *</span><textarea name="description" maxlength="240" required placeholder="Beschreibe den Job in maximal 240 Zeichen.">${E(description)}</textarea><small id="description-count">${description.length}/240</small></label>
    ${prefsForm(preferences,true)}
    <input type="hidden" name="status" value="${E(job?.status||'published')}">
    <div class="form-error"></div>
    <div class="form-actions">
     ${actionButton('preview-job','Vorschau','secondary')}
     ${actionButton('save-draft','Als Entwurf speichern','secondary')}
     <button type="submit" class="btn orange">${job?.id?'Änderungen speichern →':'Veröffentlichen'}</button>
    </div>
   </form>
   <section class="box desktop-editor-preview desktop-only" data-desktop-job-preview></section>
  </div>
  <a class="form-back" href="${onboarding?'#/recruiter/onboarding/company':'#/recruiter/jobs'}">← ${onboarding?'Zurück zum Unternehmensprofil':'Zur Jobübersicht'}</a>`;
 return shell('recruiter','jobs',content);
}
const addressFields=['address','postcode','city'];
const addressKey=place=>JSON.stringify(addressFields.map(key=>String(place[key]??'').trim().toLowerCase()));
const jobAddress=form=>Object.fromEntries(addressFields.map(key=>[key,form.elements[key].value.trim()]));
const companyProfile=id=>state.me.company_profiles.find(profile=>profile.id===id);

function defaultProfileAddress(profile){
 const company=state.me.companies.find(item=>item.id===profile?.company_id);
 const address=profile?.properties||{};
 return addressFields.every(key=>address[key])?address:company||{};
}

function paintWorkplacePicker(form,emptyLabel='Keine gespeicherten Standorte'){
 const picker=form.querySelector('#workplace-picker');
 const choices=form.workplaces||[];
 form.workplaceChoices=choices;
 picker.innerHTML=`<label class="field"><span>Gespeicherten Standort auswählen</span>
  <select name="workplace"${choices.length?'':' disabled'}>
   <option value="" disabled>${choices.length?'Individuelle Adresse':E(emptyLabel)}</option>
   ${choices.map((place,index)=>{
    const label=place.name.split(' · ').includes(place.city)?place.name:place.name+' · '+place.city;
    return `<option value="${index}">${E(label)}</option>`;
   }).join('')}
  </select></label>`;
 syncWorkplaceChoice(form);
}

function syncWorkplaceChoice(form){
 const select=form.elements.workplace;
 if(!select)return;
 const key=addressKey(jobAddress(form));
 const index=form.workplaceChoices.findIndex(place=>addressKey(place)===key);
 select.options[0].hidden=index>=0;
 select.value=index<0?'':String(index);
}

async function loadWorkplaces(form,applyDefault=form.dataset.workplaceDefault==='true'){
 const profileId=form.dataset.workplaceProfile;
 const load=Symbol();
 const originalAddress=addressKey(jobAddress(form));
 form.workplaceLoad=load;
 form.workplaces=[];
 paintWorkplacePicker(form,profileId?'Standorte werden geladen …':undefined);
 if(!profileId)return;
 try{
  const places=await profileWorkplaces(profileId);
  if(!form.isConnected||form.workplaceLoad!==load)return;
  form.workplaces=places;
  paintWorkplacePicker(form);
  const defaultPlace=places.find(place=>place.is_primary)||places[0];
  if(applyDefault&&defaultPlace&&addressKey(jobAddress(form))===originalAddress){
   const autoAddress=form.jobBaseline&&JSON.stringify(form.jobBaseline.fields.filter(([name])=>addressFields.includes(name)))===JSON.stringify(jobSnapshot(form).fields.filter(([name])=>addressFields.includes(name)));
   fillJobAddress(form,defaultPlace);
   if(autoAddress)form.jobBaseline.fields=form.jobBaseline.fields.map(([name,value])=>[name,addressFields.includes(name)?form.elements[name].value:value]);
   if(state.draft.jobEdits?.[form.dataset.draftKey])saveDraft();
   scheduleCount();
   updateDesktopJobPreview();
  }
 }catch{
  if(form.isConnected&&form.workplaceLoad===load){
   paintWorkplacePicker(form,'Standorte konnten nicht geladen werden');
   toast('Gespeicherte Arbeitsorte konnten nicht geladen werden.',true);
  }
 }
}

function changeWorkplace(control){
 const form=control.form;
 if(control.name==='workplace'){
  const place=form.workplaceChoices[Number(control.value)];
  if(control.value!==''&&place)fillJobAddress(form,place);
 }else{
  const profile=companyProfile(control.value);
  if(profile&&profile.id!==form.dataset.workplaceProfile){
   form.dataset.workplaceProfile=profile.id;
   fillJobAddress(form,defaultProfileAddress(profile));
   form.workplacePending=loadWorkplaces(form,true);
  }
 }
 saveDraft();
 scheduleCount();
}

function fillJobAddress(form,place){
 for(const key of addressFields)form.elements[key].value=place[key]??'';
 form.querySelector('#postcode-hint').textContent='';
 syncWorkplaceChoice(form);
}

function showWorkplaceForm(profileId,place={},jobEditor=null){
 if(!companyProfile(profileId))return;
 showModal(place.id?'Standort bearbeiten':'Standort hinzufügen',`<form data-form="workplace">
  <input type="hidden" name="profile_id" value="${E(profileId)}">
  <input type="hidden" name="id" value="${E(place.id||'')}">
  ${field('name','Standortname',{value:place.name,placeholder:'z. B. Büro Berlin',maxlength:80})}
  ${workplaceFields(place)}
  <label class="history-toggle"><input type="checkbox" name="is_primary"${place.is_primary?' checked disabled':''}>Hauptstandort</label><p class="hint">Dieser Standort wird bei neuen Jobs für dieses Unternehmensprofil vorausgewählt. Du kannst einen anderen Standort als Hauptstandort festlegen.</p>
  <div class="form-error" role="alert"></div>
  <div class="form-actions">${actionButton('close-modal','Abbrechen','secondary')}<button type="submit" class="btn orange">Standort speichern</button></div>
 </form>`);
 if(jobEditor)modal.querySelector('[data-form="workplace"]').jobEditor=jobEditor;
}

function paintCompanyWorkplaces(container,places,editing=false){
 const profileId=container.dataset.companyWorkplaces;
 container.places=places;
 container.innerHTML=places.map(place=>`<div class="document">
  <div><strong>${E(place.name)}</strong>${place.is_primary?' <span class="badge">Hauptstandort</span>':''}
   <p class="hint">${E(place.address)}<br>${E(place.postcode)} ${E(place.city)}</p></div>
  ${editing?actionButton('edit-company-workplace','Bearbeiten','secondary small',`data-id="${E(place.id)}" aria-label="Standort ${E(place.name)} bearbeiten"`):''}
 </div>`).join('')+(places.length?'':'<p class="hint">Noch kein Standort hinterlegt.</p>')+`<div class="form-actions company-location-actions">
  ${places.length?actionButton('toggle-company-workplaces',editing?'Fertig':'Standorte bearbeiten','secondary',`aria-pressed="${editing}"`):''}
  ${actionButton('add-company-workplace','+ Standort hinzufügen','orange',`data-id="${E(profileId)}"`)}
 </div>`;
}

async function loadCompanyWorkplaces(container){
 try{
  const places=await profileWorkplaces(container.dataset.companyWorkplaces);
  if(container.isConnected)paintCompanyWorkplaces(container,places);
 }catch(error){
  if(container.isConnected)container.innerHTML=errorBlock(error);
 }
}

function newJobForm(){
 const entry=history.state?.newJobEntry;
 if(!entry||entry!==state.draft.newJobEntry){
  state.draft.newJobEntry=crypto.randomUUID();
  history.replaceState({...history.state,newJobEntry:state.draft.newJobEntry},'');
  renderedHistory=history.state;
  delete state.draft.jobEdits?.['new-job'];
  persistDraft();
 }
 return jobForm();
}
function stat(value,title,kind,href=''){
 const tag=href?'a':'div';
 const displayValue=typeof value==='number'?formatCount(value):value;
 const length=String(displayValue).length;
 const valueClass=length>8?'stat-value-long':length>6?'stat-value-wide':'';
 const watermark=kind==='expense'?'€':icon(kind);
 return `<${tag} class="stat stat-${kind}"${href?` href="${E(href)}"`:''}><strong class="${valueClass}">${E(displayValue)}</strong><span>${E(title)}</span><span class="stat-watermark" aria-hidden="true">${watermark}</span></${tag}>`;
}
function dashboardStats(role,stats,feed){
 return role==='recruiter'
  ? stat(stats.jobs,'Aktive Jobs','cards','#/recruiter/jobs')+stat(stats.pending,'Neue Bewerbungen','send','#/recruiter/applications')+stat(stats.matches,'Matches','match','#/recruiter/matches')+stat(money(stats.test_cents/100),'Kosten','expense','#/recruiter/costs')
  : stat(feed?.items.length??resources.peek('newJobs',feedUsableFor)?.count??'…','Neue Jobs','cards','#/talent/jobs')+stat(stats.pending,'Offene Bewerbungen','send','#/talent/applications')+stat(stats.matches,'Matches','match','#/talent/matches')+stat(stats.saved,'Gespeicherte Jobs','bookmark','#/talent/saved');
}
function noMoreJobs(){
 return '<p>Keine weiteren passenden Jobs.</p><a class="btn secondary" href="#/talent/filter">Job-Filter bearbeiten</a>';
}
function talentDashboardPanels(feed){
 const jobs=candidateTableRows(feed.items).slice(0,6).map(row=>({...row,href:'#/talent/jobs/'+row.id}));
 const list=jobs.length?desktopTable('dashboard-talent-jobs',jobs,['Job','Match-Score'],null,'Dein nächster Job'):`<section class="desktop-table-panel"><h2>Dein nächster Job</h2>${noMoreJobs()}</section>`;
 return `<div class="desktop-only desktop-dashboard" id="desktop-talent-dashboard" data-feed-loaded>${list}<section class="desktop-table-panel"><div class="row between dashboard-panel-heading"><h2>Dein Job-Filter</h2><a class="btn secondary small" href="#/talent/filter">Filter bearbeiten</a></div>${skillsHeading}${selectedSkillList(state.me.candidate.skills||[])}</section></div>`;
}
async function loadRecruiterDashboardFilter(){
 const slot=document.querySelector('#dashboard-company-filter-slot');
 const data=state.recruiterDashboard;
 if(!slot||!data||data.loading||data.jobs)return;
 data.loading=true;
 try{
  const [jobs,applications,costs]=await Promise.all([readRecruiterJobs(),api('applications'),api('recruiter_costs').catch(()=>null)]);
  if(!slot.isConnected||state.recruiterDashboard!==data)return;
  Object.assign(data,{jobs,applications,costs});
  slot.innerHTML=`<div class="toolbar">${companyProfileFilter('dashboard-profile-filter')}</div>`;
 }catch{
  // The overall totals stay usable if the profile filter data fails to load.
 }finally{data.loading=false;}
}
function displayNewJobCount(value){
 const tile=app.querySelector('#dashboard-stats .stat-cards strong');
 if(tile)tile.textContent=value==null?'–':formatCount(value);
 const nextJob=app.querySelector('#talent-next-job');
 if(nextJob&&value!=null){
  nextJob.querySelector('[data-has-jobs]').hidden=value===0;
  nextJob.querySelector('[data-no-jobs]').hidden=value!==0;
 }
}
async function loadTalentDashboard(){
 const slot=app.querySelector('#desktop-talent-dashboard');
 if(!slot||state.me?.profile?.role!=='talent'||slot.dataset.loading||
  (slot.hasAttribute('data-feed-loaded')&&resources.peek('feed',feedFreshFor)))return;
 slot.dataset.loading='true';
 const candidate=state.me.candidate;
 try{
  let feed=resources.peek('feed',feedFreshFor);
  if(!feed){
   const preferences={...candidate.preferences};
   if(preferences.radius==='de')delete preferences.postcode;
   const count=await resources.load('newJobs',()=>api('preview_count',{preferences,skills:candidate.skills}),feedFreshFor)
    .catch(()=>null);
   if(!slot.isConnected)return;
   feed=resources.peek('feed',feedFreshFor);
   displayNewJobCount(feed?.items.length??count?.count);
  }
  if(!desktopViewport.matches||!slot.isConnected)return;
  if(!slot.hasAttribute('data-feed-loaded'))slot.innerHTML=loadPlaceholder('Passende Jobs werden geladen …');
  feed=feed||await readFeed();
  if(!slot.isConnected||!feed)return;
  displayNewJobCount(feed.items.length);
  slot.outerHTML=talentDashboardPanels(feed);
 }catch{
  if(slot.isConnected&&!slot.hasAttribute('data-feed-loaded'))slot.innerHTML='';
 }finally{
  delete slot.dataset.loading;
 }
}
function filterRecruiterDashboard(profile){
 const data=state.recruiterDashboard;
 if(!data)return;
 const jobs=data.jobs.filter(job=>job.company_profile_id===profile);
 const ids=new Set(jobs.map(job=>job.id));
 const applications=data.applications.filter(a=>ids.has(a.id));
 const filtered={
  jobs:jobs.filter(job=>job.status==='published').length,
  pending:applications.filter(a=>a.state==='pending').length,
  matches:applications.filter(a=>a.state==='matched').length,
  test_cents:(data.costs?.months||[]).reduce((total,row)=>total+(ids.has(row.job_id)?row.amount_cents:0),0)
 };
 document.querySelector('#dashboard-stats').innerHTML=dashboardStats('recruiter',profile?filtered:data.stats);
}
async function dashboard(role){if(role==='talent'&&!state.me.candidate){go('/talent/onboarding/filter');return '';}if(role==='recruiter'&&!state.me.company_profiles.length){go('/recruiter/onboarding/company');return '';}const stats=await api('stats');
 const feed=role==='talent'?resources.peek('feed',feedUsableFor):null;
 state.recruiterDashboard=role==='recruiter'?{stats}:null;
 const desktopContent=role==='talent'
  ? '<div id="desktop-talent-dashboard" class="desktop-only"></div>'
  : '';
 const name=state.me.profile.first_name;
 const count=feed?.items.length??resources.peek('newJobs',feedUsableFor)?.count;
 const nextJob=role==='talent'
  ? `<div class="box" id="talent-next-job"><h2>Dein nächster Job</h2>
    <div data-has-jobs ${count===0?'hidden':''}><p class="intro">Entdecke die Jobs, die zu Deinen Skills und Wünschen passen.</p><a class="btn" href="#/talent/jobs">Jetzt entdecken</a></div>
    <div data-no-jobs ${count===0?'':'hidden'}>${noMoreJobs()}</div></div>`
  : '<div class="box"><h2>Deine Jobs</h2><p class="intro">Lege neue Jobs an und stelle die entscheidenden Anforderungen zusammen. Oder bearbeite Deine bestehenden Jobs.</p><div class="dashboard-actions"><a class="btn" href="#/recruiter/jobs">Jobs verwalten →</a><a class="btn secondary" href="#/recruiter/job/new">+ neuer Job</a></div></div>';
 return shell(role,'',`<div class="row between"><h1>${icon('home')} Hallo ${E(name)}!</h1><a class="btn orange desktop-only" href="#/${role}/${role==='recruiter'?'job/new':'jobs'}">${role==='recruiter'?'+ Neuer Job':'Jetzt entdecken'}</a></div>
  <p class="intro">Hier findest Du Deine Jobs, Bewerbungen und Matches.</p>${role==='recruiter'?'<div id="dashboard-company-filter-slot"></div>':''}
  <div class="stats" id="dashboard-stats" aria-label="Deine Übersicht">${dashboardStats(role,stats,feed)}</div>${desktopContent}
  <div class="cards dashboard-shortcuts">${nextJob}
   <div class="box"><h2>${role==='talent'?'Dein Job-Filter':'Neue Bewerbungen'}</h2><p class="intro">${role==='talent'?'Passe Deine Skills und Präferenzen an und sieh, wie sich Deine Treffer verändern.':'Prüfe die fachliche Passung und entscheide, mit wem Du in Kontakt treten möchtest.'}</p><a class="btn secondary" href="#/${role}/${role==='talent'?'filter':'applications'}">${role==='talent'?'Filter bearbeiten':'Bewerbungen prüfen'} →</a></div>
  </div>${role==='recruiter'?'<p class="settings-note">In der Testumgebung simulieren wir 15 € je Match.</p>':''}`);
}
const feedbackQuestions=[
 ['friction','Wo sind Sie beim Testen hängen geblieben?'],
 ['decision','Was hat Ihnen bei der Entscheidung zwischen den Bewerbungen geholfen oder gefehlt?'],
 ['use_case','Für welche Art von Stelle würden Sie &TALENTS ausprobieren?']
];
function recruiterFeedbackPage(){
 const questions=feedbackQuestions.map(([name,label])=>`<label class="field"><span>${E(label)} (optional)</span><textarea name="${name}" rows="3" maxlength="1500"></textarea></label>`).join('');
 const ratings=Array.from({length:10},(_,index)=>{
  const value=index+1;
  return `<label><input type="radio" name="rating" value="${value}" aria-label="${value}" required><span aria-hidden="true">${value}</span></label>`;
 }).join('');
 return shell('recruiter','feedback',`<h1 class="page-title">${icon('edit')} Feedback</h1>
  <p class="intro">Wie war Ihr Test mit &amp;TALENTS?</p>
  <form class="box recruiter-feedback" data-form="recruiter-feedback">
   <label class="field"><span>Name (optional)</span><input name="contact_name" autocomplete="name" maxlength="120"></label>
   <label class="field"><span id="feedback-email-label">E-Mail-Adresse *</span><input name="contact_email" type="email" autocomplete="email" maxlength="254" aria-labelledby="feedback-email-label" required></label>
   ${questions}
   <fieldset class="feedback-rating">
    <legend>Können Sie sich vorstellen, dass Ihnen &amp;TALENTS bei der Gewinnung von passenden Bewerberprofilen helfen kann? *</legend>
    <p class="hint">1 = überhaupt nicht, 10 = auf jeden Fall</p>
    <div class="feedback-rating-options">${ratings}</div>
   </fieldset>
   <p class="hint">Bitte geben Sie keine personenbezogenen Daten Dritter ein.</p>
   <div class="form-error" role="alert"></div>
   <div class="form-actions"><button type="submit" class="btn orange">Feedback senden</button></div>
  </form>`);
}
function recruiterFeedbackEntry(signedInAsTalent=false){
 const intro=signedInAsTalent?'Melden Sie sich zuerst vom Kandidatenkonto ab. Anschließend können Sie sich als Recruiter anmelden.':'Melden Sie sich als Recruiter an. Den Feedbackbogen finden Sie anschließend oben in der App.';
 const action=signedInAsTalent?actionButton('logout','Abmelden','secondary'):'<a class="btn orange" href="#/recruiter/login">Als Recruiter anmelden</a>';
 return narrow(`<h1>Feedback</h1><p class="intro">${intro}</p>${action}`,signedInAsTalent?'talent':'recruiter');
}
function costJobs(costs,profile){
 return costs.jobs.filter(job=>!profile||job.company_profile_id===profile);
}
function costJobOptions(jobs){
 return '<option value="">Alle Jobs</option>'+jobs.map(job=>`<option value="${E(job.id)}">${E(job.title)}</option>`).join('');
}
function costHistory(costs,jobs){
 const ids=new Set(jobs.map(job=>job.id));
 const totals=new Map();
 for(const row of costs.months){
  if(ids.has(row.job_id))totals.set(row.month,(totals.get(row.month)||0)+row.amount_cents);
 }
 const amounts=[...totals.values()];
 const sum=amounts.reduce((total,amount)=>total+amount,0);
 let history='<p class="hint">Für diese Auswahl sind noch keine Kosten erfasst.</p>';
 if(totals.size){
  const oldest=[...totals.keys()].sort()[0];
  const max=amounts.reduce((highest,amount)=>Math.max(highest,amount),1);
  const cursor=new Date(costs.current_month+'-01T00:00:00Z');
  const rows=[];
  for(let key=costs.current_month;key>=oldest;key=cursor.toISOString().slice(0,7)){
   const amount=totals.get(key)||0;
   rows.push(`<li><span>${costMonth.format(cursor)}</span><strong>${money(amount/100)}</strong><span class="cost-track" aria-hidden="true"><span style="width:${amount/max*100}%"></span></span></li>`);
   cursor.setUTCMonth(cursor.getUTCMonth()-1);
  }
  history=`<ul class="cost-months">${rows.join('')}</ul>`;
 }
 return `<p class="cost-total"><span>Gesamtkosten</span><strong>${money(sum/100)}</strong></p><h2>Kosten pro Monat</h2>${history}`;
}
async function costsPage(version){
 const costs=await api('recruiter_costs');
 if(version!==pageVersion)return '';
 state.costs=costs;
 const profiles=state.me.company_profiles;
 const period=`<form data-form="cost-period">
  <fieldset class="cost-period">
   <legend>Zeitraum</legend>
   <div class="cost-period-controls">
    ${field('from','Von',{type:'date',required:false})}
    ${field('to','Bis',{type:'date',required:false})}
    <div class="cost-period-actions">
     <button type="submit" class="btn secondary">Zeitraum anwenden</button>
     <button type="submit" value="reset" class="btn secondary" formnovalidate>Zurücksetzen</button>
    </div>
   </div>
   <div class="form-error"></div>
  </fieldset>
 </form>`;
 return shell('recruiter','costs',`<h1 class="page-title">${euroSymbol} Kosten</h1><p class="intro">Hier siehst Du die Kosten Deiner Matches im Zeitverlauf.</p><div class="toolbar"><label class="field"><span>Unternehmensprofil</span><select tabindex="-1" id="cost-profile-filter"><option value="">Alle Unternehmensprofile</option>${profiles.map(profile=>`<option value="${E(profile.id)}">${E(profile.public_name)}</option>`).join('')}</select></label><label class="field"><span>Job</span><select tabindex="-1" id="cost-job-filter">${costJobOptions(costs.jobs)}</select></label></div>${period}<div class="desktop-costs"><section class="box cost-summary" id="cost-summary" aria-live="polite">${costHistory(costs,costs.jobs)}</section><section class="box" id="cost-jobs">${costJobSummary(costs,costs.jobs)}</section></div><p class="settings-note">Die Kosten werden in der Testumgebung simuliert. Es erfolgen keine echten Zahlungen.</p>`);
}
function costJobSummary(costs,jobs){
 const totals=new Map();
 for(const row of costs.months)totals.set(row.job_id,(totals.get(row.job_id)||0)+row.amount_cents);
 const rows=jobs.map(job=>totals.has(job.id)?`<div class="document"><span>${E(job.title)}</span><strong>${money(totals.get(job.id)/100)}</strong></div>`:'').join('');
 return '<h2>Kosten je Job</h2>'+(rows||'<p class="hint">Für diese Auswahl sind noch keine Kosten erfasst.</p>');
}
function filterCosts(){
 const profile=document.querySelector('#cost-profile-filter').value;
 const select=document.querySelector('#cost-job-filter');
 const jobs=costJobs(state.costs,profile);
 const selected=select.value;
 select.innerHTML=costJobOptions(jobs);
 select.value=jobs.some(job=>job.id===selected)?selected:'';
 const visible=select.value?jobs.filter(job=>job.id===select.value):jobs;
 document.querySelector('#cost-summary').innerHTML=costHistory(state.costs,visible);
 document.querySelector('#cost-jobs').innerHTML=costJobSummary(state.costs,visible);
}
function jobIndustry(job){
 return job.industry||state.me?.company_profiles?.find(profile=>profile.id===job.company_profile_id)?.industry;
}
function jobCompany(name,industry,className='company'){
 return `<div class="${className}">${companyLabel(name,industry)}</div>`;
}
function companyProfileFilter(id){
 return `<label class="field"><span>Unternehmensprofil</span><select id="${id}"><option value="">Alle Unternehmensprofile</option>${state.me.company_profiles.map(profile=>`<option value="${E(profile.id)}">${E(profile.public_name)}</option>`).join('')}</select></label>`;
}
function jobFactsPreferenceKey(){
 return 'andtalents-job-facts-'+state.me.profile.user_id;
}
function showJobFacts(){
 try{return localStorage.getItem(jobFactsPreferenceKey())!=='off';}catch{return true;}
}
function jobFacts(job,visible=true){
 if(!visible)return '';
 const {employment,travel}=job.preferences||job;
 const types=[employment].flat().filter(Boolean);
 const employmentLabel=types.includes('Vollzeit')&&types.includes('Teilzeit')?'Vollzeit oder Teilzeit':types.map(optionLabel).join(', ');
 const office=optionLabel(job.properties?.office);
 const travelLabel=selectedTravel(travel,true).map(index=>optionLabel(TRAVEL_LABELS[index])).join(', ');
 const items=[office,employmentLabel,travelLabel].filter(Boolean);
 return items.length?`<p class="job-facts">${E(items.join(' · '))}</p>`:'';
}
function jobFactsSetting(){
 return `<section class="box desktop-profile-section" data-desktop-panel="account" data-desktop-current><h2>Jobansicht</h2>
  <label class="history-toggle"><input type="checkbox" id="show-job-facts"${showJobFacts()?' checked':''}>Arbeitsmodell, Beschäftigungsart und Reisebereitschaft im Job anzeigen</label>
 </section>`;
}
const jobStatuses=[['published','Veröffentlicht'],['draft','Entwurf'],['closed','Pausiert']];
function jobFilterSummary(job){
 const p=job.preferences||{};
 const formatOptions=value=>[value].flat().filter(Boolean).map(optionLabel).join(', ');
 const employment=p.employment?.includes('Vollzeit')&&p.employment?.includes('Teilzeit')
  ? 'Vollzeit oder Teilzeit':formatOptions(p.employment);
 const location=[p.address,[p.postcode||job.postcode,p.city||job.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
 const filters=[
  ['Arbeitsort',location],
  ['Reisebereitschaft',selectedTravel(p.travel,true).map(i=>optionLabel(TRAVEL_LABELS[i])).join(', ')],
  [labels.employment,employment],
  ['Erforderliches Erfahrungslevel',formatOptions(p.experience)],
  ['Maximales Gehalt (brutto/Jahr)',Number(p.max_salary)>0?money(Number(p.max_salary)):''],
  [labels.leadership,formatOptions(p.leadership)]
 ].filter(([,value])=>value);
 if(!filters.length)return '';
 return `<section class="job-filter-summary"><h4>Job-Filter</h4>
  <dl>${filters.map(([label,value])=>`<div><dt>${E(label)}</dt><dd>${E(value)}</dd></div>`).join('')}</dl>
 </section>`;
}
const jobCountKey=id=>'recruiter-job-count:'+id;
async function paintRecruiterJobCount(target){
 const id=target.dataset.jobCandidateCount;
 try{
  const count=await resources.load(jobCountKey(id),async()=>{
   const [job]=await api('jobs',{job_id:id});
   return job?.candidate_count;
  },15000);
  if(target.isConnected)target.textContent=Number.isFinite(count)?`Aktuell: ${formatCount(count)} Treffer`:'Trefferzahl nicht verfügbar';
 }catch{
  if(target.isConnected)target.textContent='Trefferzahl nicht verfügbar';
 }
}
const recruiterJobCountObserver=new IntersectionObserver(entries=>{
 for(const entry of entries){
  if(!entry.isIntersecting||!entry.target.isConnected)continue;
  recruiterJobCountObserver.unobserve(entry.target);
  void paintRecruiterJobCount(entry.target);
 }
});
function observeRecruiterJobCounts(){
 recruiterJobCountObserver.disconnect();
 app.querySelectorAll('[data-job-candidate-count]').forEach(target=>recruiterJobCountObserver.observe(target));
}
function jobCard(j){
 const statuses=jobStatuses;
 const options=statuses.map(([value,label])=>`<option value="${value}" ${j.status===value?'selected':''}>${label}</option>`).join('');
 const warning=hasMinimumSkills(j.skills)?'':'<p class="minimum-warning">Vor der Veröffentlichung bitte mindestens 5 Skills auswählen.</p>';
 const count=Number.isFinite(j.candidate_count)?`Aktuell: ${formatCount(j.candidate_count)} Treffer`:
  `<span data-job-candidate-count="${E(j.id)}" aria-live="polite">Treffer werden geladen …</span>`;
 return `<article class="job-card recruiter-job-card"><label class="job-state-row"><span>Status</span><select tabindex="-1" data-job-status="${j.id}" aria-label="Status von ${E(j.title)}">${options}</select></label><div class="match-heading"><div><h3>${E(j.title)}</h3>${jobCompany(j.company,jobIndustry(j))}<div class="meta">${E(j.city||j.preferences?.city)}</div></div></div>${warning}<p class="job-status">${E(statuses.find(([value])=>value===j.status)?.[1])} · ${count}</p>${jobFilterSummary(j)}${skillsHeading}${selectedSkillList(j.skills??[])}${jobDescriptionBlock(j.description)}<div class="card-footer"><small>Bearbeitet am ${date(j.updated_at)}</small><div class="row"><a href="#/recruiter/job/${j.id}" class="btn secondary small">Bearbeiten</a>${actionButton('own-preview','Vorschau','secondary small',`data-id="${j.id}"`)}<a class="btn secondary small desktop-only" href="#/recruiter/applications/job/${E(j.id)}">Bewerbungen</a>${actionButton('delete-job','Job löschen','danger small',`data-id="${E(j.id)}"`)}</div></div></article>`;
}
async function changeJobLifecycle(job,operation,acknowledgedCount=null){
 const origin=pageVersion;
 const result=await api('job_lifecycle',{job_id:job.id,operation,acknowledged_count:acknowledgedCount});
 if(origin!==pageVersion)return;
 const deleting=operation==='delete';
 if(result.confirmation_required){
  const count=result.pending_count;
  const pending=count===1?'Für diesen Job gibt es noch eine offene Bewerbung.':
   `Für diesen Job gibt es noch ${formatCount(count)} offene Bewerbungen.`;
  const consequence=deleting
   ? (count===1?'Die offene Bewerbung wird automatisch abgelehnt.':'Alle offenen Bewerbungen werden automatisch abgelehnt.')
   : 'Offene Bewerbungen bleiben bestehen und können weiter bearbeitet werden.';
  const label=deleting?'Job löschen':'Job pausieren';
  showModal(label+'?',`<p><strong>${E(job.title)}</strong></p>${count?'<p class="notice orange">'+E(pending)+' '+E(consequence)+'</p>':''}${deleting?'<p>Der Job verschwindet aus Deiner Jobübersicht. Bestehende Matches bleiben erhalten.</p>':''}`,
   actionButton('close-modal','Abbrechen','secondary','autofocus')+
   actionButton('confirm-job-lifecycle',label,deleting?'danger':'orange',`data-id="${E(job.id)}" data-operation="${operation}" data-pending-count="${E(count)}"`));
  return;
 }
 if(modal.open)modal.close();
 resources.invalidate(jobCountKey(job.id));
 toast(deleting?'Job gelöscht.':'Job pausiert.');
 await render();
}
async function changeRecruiterJobStatus(select){
 const job=state.jobs.find(item=>item.id===select.dataset.jobStatus);
 if(!job)return;
 const status=select.value;
 select.value=job.status;
 await withButton(select,async()=>{
  if(status==='closed'){await changeJobLifecycle(job,'pause');return;}
  await api('save_job',{...job,status});
  resources.invalidate(jobCountKey(job.id));
  toast('Status gespeichert.');
  await render();
 });
}
const compactScore=value=>`<span class="desktop-compact-score"><span class="sr-only">Match-Score </span>${E(value)} %</span>`;
const jobStatusLabel=job=>jobStatuses.find(([value])=>value===job.status)?.[1]||'';
const recruiterJobRows=jobs=>jobs.map(job=>({
  id:job.id,label:job.title,subtitle:job.company||'',
  status:jobStatusLabel(job),applicationCount:job.pending_application_count??0,job
}));
function recruiterJobList(key,rows,_headings,active){
 return `<section class="desktop-table-panel desktop-only" aria-label="Deine Jobs">
  <ul class="desktop-job-list" data-desktop-choice-list="${E(key)}">
   ${rows.map(({id,label,subtitle,status,applicationCount})=>`<li class="desktop-result-row" data-desktop-choice${id===active?' data-desktop-current':''}>
    <button type="button" class="desktop-row-control" data-desktop-select="${E(id)}" aria-pressed="${id===active}">${E(label)}</button>
    ${subtitle?`<small class="desktop-result-subtitle">${companyLabel(subtitle)}</small>`:''}
    <div class="desktop-result-summary"><span>${E(status)}</span><span>Bewerbungen <strong>${formatCount(applicationCount)}</strong></span></div>
   </li>`).join('')}
  </ul>
 </section>`;
}
const candidateTableRows=jobs=>jobs.map(job=>({
 id:job.id,label:job.title,subtitle:job.company,subtitleIsCompany:true,industry:job.industry,
 cells:[compactScore(job.match.score)],job
}));
function ownJobDetails(items,preferred=''){
 return items.length
  ? desktopDetails('recruiter-jobs',recruiterJobRows(items),[],item=>jobCard(item.job),preferred,recruiterJobList)
  : empty(state.jobs.length?'Keine Jobs in dieser Auswahl':'Noch keine Jobs',state.jobs.length?'Passe die Filter an.':'Lege Deinen ersten Job an.');
}
function activeFeedJob(){
 const id=desktopViewport.matches?currentDesktopItem('talent-feed',state.feed.map(job=>job.id)):null;
 return state.feed.find(job=>job.id===id)||state.feed[0];
}
function candidateFeed(){
 if(!state.feed.length)return `<div id="swipe-stack" class="swipe-container">${swipeCard()}</div>`;
 const active=activeFeedJob();
 return `<div class="desktop-detail-layout">
  ${desktopTable('talent-feed',candidateTableRows(state.feed),['Jobs','Match-Score'],active.id,`Neue Jobs · ${formatCount(state.feed.length)}`)}
  <div id="swipe-stack" class="swipe-container">${swipeCard()}</div>
 </div>`;
}
async function jobsPage(role){
 if(role==='talent'){
  if(!hasMinimumSkills(state.me.candidate?.skills)){toast('Bitte ergänze Deinen Job-Filter auf mindestens 5 Skills.',true);go('/talent/filter');return '';}
  const version=pageVersion;
  const cached=resources.peek('feed',feedUsableFor);
  if(!cached)app.innerHTML=shell(role,'jobs',loadPlaceholder('Passende Jobs werden geladen …'));
  const feed=cached||await readFeed();
  if(version!==pageVersion)return '';
  if(!feed)throw Error('Passende Jobs konnten nicht geladen werden.');
  state.feed=[...feed.items];
  const preferred=routeKey.split('/')[3];
  currentDesktopItem('talent-feed',state.feed.map(job=>job.id),preferred);
  return shell(role,'jobs',`<h1 class="page-title swipe-page-title">${icon('cards')} Deine Jobs</h1><span id="stack-count" class="sr-only" aria-live="polite">${state.feed.length} ${state.feed.length===1?'Job':'Jobs'}</span><div id="candidate-feed">${candidateFeed()}</div>`);
 }
 const jobs=await readRecruiterJobs();
 state.jobs=jobs;
 const publishedJobs=jobs.filter(job=>job.status==='published').length;
 return shell(role,'jobs',`<div class="row between"><div><h1>${icon('cards')} Deine Jobs</h1><p class="intro">${publishedJobs} ${publishedJobs===1?'Job':'Jobs'} veröffentlicht</p></div><a class="btn orange" href="#/recruiter/job/new">+ Neuer Job</a></div><div class="toolbar"><label class="field"><span>Unternehmensprofil</span><select tabindex="-1" id="job-company-filter"><option value="">Alle Unternehmensprofile</option>${state.me.company_profiles.map(profile=>`<option value="${E(profile.id)}">${E(profile.public_name)}</option>`).join('')}</select></label><label class="field"><span>Status</span><select tabindex="-1" id="job-status-filter"><option value="">Alle</option><option value="published">Veröffentlicht</option><option value="draft">Entwurf</option><option value="closed">Pausiert</option></select></label></div><div id="own-jobs">${ownJobDetails(jobs,routeKey.split('/')[3])}</div>`);
}
async function attachLocation(job){
 if(job.location)return job;
 state.mapLocations??=fetch('./postcode-centroids.json').then(response=>response.json()).catch(()=>null);
 const locations=await state.mapLocations;
 if(!locations)state.mapLocations=null;
 const point=locations?.[job.postcode||job.preferences?.postcode];
 return point?{...job,location:{lat:point[0],lon:point[1]}}:job;
}
function locationBlock(j){const location=j.location;let map='';if(location?.lat&&location?.lon)map=`<iframe title="Arbeitsort ${E(j.city)}" src="https://www.openstreetmap.org/export/embed.html?bbox=${location.lon-.015},${location.lat-.015},${location.lon+.015},${location.lat+.015}&amp;layer=mapnik&amp;marker=${location.lat},${location.lon}" loading="lazy" referrerpolicy="no-referrer"></iframe>`;return `<section class="location-section"><div class="location-heading"><h3>Arbeitsort</h3><address>${E([j.address,j.postcode,j.city].filter(Boolean).join(', '))}</address></div>${map?`<div class="location-map">${map}</div>`:''}</section>`;}
function swipeCard(){const j=activeFeedJob();if(!j)return empty('Keine weiteren passenden Jobs','Mit Deinem aktuellen Filter gibt es keine weiteren Jobs. Du kannst Deine Auswahl anpassen oder später wiederkommen.','<a class="btn secondary" href="#/talent/filter">Job-Filter bearbeiten</a>');if(!Array.isArray(j.match?.details)){
 const details=`<div class="match-heading"><div><h2>${E(j.title)}</h2>${jobCompany(j.company,j.industry,'swipe-company')}</div>${scoreWithInfo(j.match.score)}</div>`;
 return `<article class="box feed-detail-placeholder">${details}<div data-feed-detail-status>${loadPlaceholder('Jobdetails werden geladen …')}</div></article>`;
}return `<article class="swipe-card" data-job="${j.id}" aria-label="${E(j.title)}"><div class="swipe-feedback" aria-hidden="true"></div><div class="candidate-fixed-header swipe-grab" title="Nach links ablehnen, nach rechts bewerben, nach unten merken"><div class="match-heading"><div><h2>${E(j.title)}</h2>${jobCompany(j.company,j.industry,'swipe-company')}</div>${scoreWithInfo(j.match.score)}</div>${jobFacts(j,showJobFacts())}${matchOverview(j.match)}</div><div class="card-scroll">${candidateJobContent(j,state.me.candidate?.skills)}</div><div class="swipe-actions"><button type="button" class="skip" data-action="skip" aria-label="Job ablehnen" title="Ablehnen">${icon('close',true)}<span class="desktop-label" aria-hidden="true">Ablehnen</span></button><button type="button" class="bookmark" data-action="bookmark" aria-label="Job merken" title="Job merken">${icon('bookmark')}<span class="desktop-label" aria-hidden="true">Merken</span></button><button type="button" class="apply" data-action="apply" aria-label="Auf diesen Job bewerben" title="Bewerben">${icon('send')}<span class="desktop-label" aria-hidden="true">Bewerben</span></button></div></article>`;}
const matchExplanationTitle='Wie wird der Match-Score berechnet?';
const matchExplanationBody='<p>Der Match-Score zeigt beiden Seiten, wie gut die Skills die Anforderungen des Jobs erfüllen. Top Skills zählen beim Matching stärker. Ein ausgefüllter Stern zeigt, dass beide Seiten den Skill markiert haben. Eine Kontur zeigt eine einseitige Markierung. Zusätzliche Skills senken den Score nicht.</p>';
const matchExplanation=()=>`<details class="match-explanation"><summary>${matchExplanationTitle}</summary>${matchExplanationBody}</details>`;
function scoreWithInfo(score){
 return `<button type="button" class="swipe-score-info" data-action="explain-match-score" aria-label="Match-Score ${E(score)} Prozent. ${matchExplanationTitle}" aria-haspopup="dialog">${scorePill(score,{showInfo:true})}</button>`;
}
function mobileDetailsToggle(id,label){
 return `<button type="button" class="btn secondary small mobile-detail-toggle" data-action="toggle-mobile-details" aria-expanded="false" aria-controls="${E(id)}">${label} einblenden</button>`;
}
const swipeIntroSteps=[
 ['skip','close','Ablehnen','Wische nach links oder tippe auf das Kreuz. Der Job verschwindet aus Deinen neuen Jobs.'],
 ['bookmark','bookmark','Merken','Wische nach unten oder tippe auf das Lesezeichen. Du findest den Job unter „Gespeicherte Jobs“ und kannst Dich später bewerben.'],
 ['apply','send','Bewerben','Wische nach rechts oder tippe auf den Papierflieger. Deine Bewerbung wird direkt gesendet. Wenn Du „Über mich“ ausgefüllt hast, sieht der Recruiter diesen Text schon bei der Bewerbung. Nimmt er sie an, entsteht ein Match.']
];
const seenSwipeIntro=new Set();
function showSwipeIntro(){
 const owner=state.me.profile.user_id;
 const key='andtalents-swipe-intro-'+owner;
 if(seenSwipeIntro.has(owner))return false;
 try{if(localStorage.getItem(key)==='seen')return false;}catch{/* Remember the introduction for this session. */}
 const rows=swipeIntroSteps.map(([action,glyph,label,description])=>`<li><span class="swipe-intro-icon ${action}">${icon(glyph,action==='skip')}</span><div><strong>${label}</strong><p>${description}</p></div></li>`).join('');
 showModal('Jobs entdecken',`<p>Du kannst wischen oder die Symbole antippen.</p><ul class="swipe-intro-list">${rows}</ul>`,actionButton('close-modal','Verstanden'));
 seenSwipeIntro.add(owner);
 try{localStorage.setItem(key,'seen');}catch{/* The introduction has already been shown in this session. */}
 return true;
}
function jobDescriptionBlock(description){
 if(!description?.trim())return '';
 return `<section class="job-description-block"><h3 class="job-description-title">Kurzbeschreibung</h3><p class="match-description">${E(description)}</p></section>`;
}
function candidateJobContent(job,candidateSkills){
 return `${skillList(job,{candidateSkills})}${jobDescriptionBlock(job.description)}<div class="candidate-job-location">${locationBlock(job)}</div>`;
}
function applicationStatus(state){
 return `<span class="status-pill ${E(state)}">${E(statuses[state])}</span>`;
}
function candidateListCard(job,application=false){
 const candidateSkills=application?job.candidate_skills:state.me.candidate?.skills;
 const status=application?`<div class="result-dates"><span>Beworben am ${date(job.applied_at)}</span>${applicationStatus(job.state)}</div>`:'';
 const id=`data-id="${E(job.id)}"`;
 const canApply=!application&&job.status==='published'&&meetsMatchPolicy(job.match,job.skills,candidateSkills);
 const actions=application
  ? (job.state==='pending'?actionButton('confirm-withdraw-application','Bewerbung zurückziehen','secondary small',`data-id="${E(job.application_id)}"`):'')
  : (canApply?actionButton('apply-saved','Bewerben','small',id):'')+actionButton('decline-saved','Ablehnen','secondary small',id)+actionButton('unsave','Entfernen','secondary small',id);
 const detailsId='application-details-'+job.application_id;
 const overview=matchOverview(job.match);
 const details=candidateJobContent(job,candidateSkills);
 return `<article class="job-card candidate-list-card"><div class="match-heading"><div><h3>${E(job.title)}</h3>${jobCompany(job.company,job.industry)}</div>${scoreWithInfo(job.match.score)}</div>${jobFacts(job,showJobFacts())}${overview}${status}${application?mobileDetailsToggle(detailsId,'Skills und Jobdetails'):''}<div ${application?`id="${E(detailsId)}" class="mobile-detail-content"`:''} data-candidate-job-card="${E(job.id)}">${details}</div>${actions?`<div class="card-footer candidate-job-actions">${actions}</div>`:''}</article>`;
}
const mapTargets=new Map();
async function paintCandidateMap(target,job){
 const located=await attachLocation(job);
 if(target.isConnected&&located.location&&!target.querySelector('iframe'))target.innerHTML=locationBlock(located);
}
const mapObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
 for(const entry of entries){
  if(!entry.isIntersecting)continue;
  const target=entry.target;
  const job=mapTargets.get(target);
  mapObserver.unobserve(target);
  mapTargets.delete(target);
  if(job&&target.isConnected)paintCandidateMap(target,job);
 }
}):null;
function loadCandidateJobMap(container,job){
 for(const target of mapTargets.keys()){
  if(!target.isConnected){mapObserver.unobserve(target);mapTargets.delete(target);}
 }
 const target=container?.querySelector('.candidate-job-location');
 if(!target||!job?.postcode||target.querySelector('iframe')||mapTargets.has(target))return;
 if(!mapObserver){paintCandidateMap(target,job);return;}
 mapTargets.set(target,job);
 mapObserver.observe(target);
}
function paintCandidateFeed(){
 const root=app.querySelector('#candidate-feed');
 if(!root)return;
 root.innerHTML=candidateFeed();
 app.querySelector('#stack-count').textContent=state.feed.length+(state.feed.length===1?' Job':' Jobs');
 loadActiveFeedCard();
}
async function loadActiveFeedCard(){
 const stack=app.querySelector('#swipe-stack');
 const job=activeFeedJob();
 if(!stack||!job)return;
 if(Array.isArray(job.match?.details)){
  loadCandidateJobMap(stack,job);
  return;
 }
 const feed=state.feed;
 const pending=stack.querySelector('[data-feed-detail-status]');
 if(!pending)return;
 pending.innerHTML=loadPlaceholder('Jobdetails werden geladen …');
 try{
  const result=await resources.load('job:'+job.id,()=>candidateFeedRequest(job.id),feedFreshFor);
  if(feed!==state.feed||!result)return;
  const index=feed.findIndex(item=>item.id===job.id);
  if(index<0)return;
  const detail=result.items[0];
  if(!detail){
   const active=stack.isConnected&&activeFeedJob()?.id===job.id;
   invalidateCandidateFeed(job.id,true);
   feed.splice(index,1);
   if(active){paintCandidateFeed();maybeSwipeNotice();}
   return;
  }
  feed[index]=detail;
  if(!stack.isConnected||activeFeedJob()?.id!==job.id)return;
  stack.innerHTML=swipeCard();
  loadCandidateJobMap(stack,detail);
 }catch{
  if(pending.isConnected)pending.innerHTML=actionButton('retry-feed-detail','Erneut versuchen','secondary');
 }
}
async function refreshCandidateFeed(){
 const root=app.querySelector('#candidate-feed');
 if(!root||resources.peek('feed',feedFreshFor))return;
 const previous=state.feed;
 try{
  const result=await readFeed();
  if(!result||!root.isConnected||state.feed!==previous||state.busy||pointer)return;
  if(result.items.length===previous.length&&result.items.every((item,index)=>
   item.id===previous[index].id&&item.match?.score===previous[index].match?.score)){
   maybeSwipeNotice();
   return;
  }
  state.feed=[...result.items];
  paintCandidateFeed();
  maybeSwipeNotice();
 }catch{
  // The last available feed remains usable during a transient failure.
 }
}
function loadListedJobMaps(){
 const jobs=routeKey==='/talent/saved'?state.saved:state.applications;
 for(const card of app.querySelectorAll('[data-candidate-job-card]')){
  loadCandidateJobMap(card,jobs.find(job=>job.id===card.dataset.candidateJobCard));
 }
}
async function savedPage(){state.saved=await api('saved');return shell('talent','saved',`<h1 class="page-title" data-page-title="saved">${icon('bookmark')} Gespeicherte Jobs</h1><p class="intro">Diese Jobs hast Du Dir für später gespeichert.</p><div>${state.saved.length?desktopDetails('talent-saved',candidateTableRows(state.saved),['Job','Match-Score'],item=>candidateListCard(item.job)):empty('Noch keine gespeicherten Jobs','Wische einen Job nach unten, um ihn für später zu speichern.')}</div>`);}
const statuses={pending:'Offen',matched:'Match',rejected:'Abgelehnt',withdrawn:'Zurückgezogen',closed:'Match aufgelöst'};
const matchStatuses={
 talent:{active:'Aktiv',negative:'Negative Rückmeldung',hired:'Vertrag unterschrieben'},
 recruiter:{open:'Offen',contacted:'Kontaktiert',first_interview:'Erstes Interview',shortlist:'Shortlist',hired:'Vertrag unterschrieben',rejected:'Abgelehnt'}
};
const currentMatchStatus=(application,role)=>application.match_status??(role==='recruiter'?'open':'active');
const matchStatusOptions=(role,selected)=>Object.entries(matchStatuses[role]).map(([value,label])=>
 `<option value="${value}"${selected===value?' selected':''}>${label}</option>`).join('');
function matchStatusEditor(application,role){
 return `<label class="field match-status-editor"><span>Match-Status</span><select data-match-status="${E(application.application_id)}">${matchStatusOptions(role,currentMatchStatus(application,role))}</select></label>`;
}
function statusFilter(id,options){
 return `<label class="field"><span>Nach Status filtern</span><select id="${id}"><option value="">Alle</option>${options}</select></label>`;
}
function matchStatusFilter(role){
 return statusFilter('match-status-filter',matchStatusOptions(role));
}
function candidateApplicationStatusFilter(){
 const values=['pending','rejected','withdrawn'];
 if(state.applicationStatus==='closed'||state.applications.some(a=>a.state==='closed'))values.push('closed');
 return statusFilter('candidate-application-status-filter',values.map(value=>
  `<option value="${value}"${value===state.applicationStatus?' selected':''}>${statuses[value]}</option>`).join(''));
}
async function saveMatchStatus(select){
 const role=state.me.profile.role;
 const application=state.applications.find(item=>item.application_id===select.dataset.matchStatus&&item.state==='matched');
 if(!application)return;
 if(state.busy){select.value=currentMatchStatus(application,role);return;}
 const page=pageVersion;
 await withButton(select,async()=>{
  try{
   const result=await api('set_match_status',{application_id:application.application_id,status:select.value});
   application.match_status=result.match_status;
   if(page!==pageVersion||!select.isConnected)return;
   refreshApplicationList();
   const updated=document.querySelector('[data-match-status="'+CSS.escape(application.application_id)+'"]');
   (updated||document.querySelector('#match-status-filter'))?.focus({preventScroll:true});
   toast('Match-Status gespeichert.');
  }catch(error){
   select.value=currentMatchStatus(application,role);
   throw error;
  }
 });
}
function talentMatchDetails(application){
 return `<div class="talent-match-details" data-candidate-job-card="${E(application.id)}">
  ${jobDescriptionBlock(application.description)}
  ${application.address||application.postcode||application.city?`<div class="candidate-job-location">${locationBlock(application)}</div>`:''}
 </div>`;
}
function applicationCard(a,role){
 const recruiter=role==='recruiter';
 const matched=a.state==='matched';
 const title=recruiter?a.candidate_name:a.title;
 const id=E(a.application_id);
 const detailsId='application-details-'+a.application_id;
 const skills=skillList(a,{candidateSkills:a.candidate_skills||[]});
 const dates=`<div class="result-dates"><span>Beworben am ${date(a.applied_at)}</span><span class="status-pill ${E(a.state)}">${E(statuses[a.state])}</span></div>`;
 const actions=recruiter&&a.state==='pending'
  ? `<div class="application-actions">${actionButton('confirm-reject','Ablehnen','danger', 'data-id="'+id+'"')}${meetsMatchPolicy(a.match,a.skills,a.candidate_skills)?actionButton('confirm-match','Annehmen · 15 €','','data-id="'+id+'"'):'<span class="hint">Du kannst die Bewerbung ab 50 % Match-Score annehmen, wenn beide Seiten mindestens 5 Skills haben.</span>'}</div>` : '';
 const header=`<div class="match-heading"><div><h3><button type="button" class="result-title" data-action="application-detail" data-id="${id}">${E(title)}</button></h3>${recruiter?'<div class="meta desktop-only desktop-job-title">'+E(a.title)+'</div>':jobCompany(a.company,a.industry)}</div>${scoreWithInfo(a.match.score)}</div>`;
 const overview=matchOverview(a.match);
 const details=matched
  ? `${matchStatusEditor(a,role)}${recruiter?candidateAbout(a):jobFacts(a,showJobFacts())}<section class="${recruiter?'recruiter-match-skills':''}">${overview}${mobileDetailsToggle(detailsId,recruiter?'Skills':'Skills und Jobdetails')}<div class="mobile-detail-content" id="${E(detailsId)}">${skills}${recruiter?'':talentMatchDetails(a)}</div></section>${dates}
    ${recruiter?`<div class="desktop-match-profile">${candidateFullProfile(a,{showAbout:false})}${applicationContact(a,role)}</div>${actionButton('full-profile','Match-Profil anzeigen','secondary match-profile-button recruiter-match-profile-button','data-id="'+id+'"')}`:applicationContact(a,role)}`
  : `<div class="mobile-only">${dates}</div>${candidateAbout(a)}${overview}
    ${mobileDetailsToggle(detailsId,'Skills')}<div class="mobile-detail-content application-disclosure" id="${E(detailsId)}">${skills}<div class="desktop-only">${dates}</div></div>${actions}`;
 return `<article class="application-card ${recruiter?'recruiter-application':''}${matched?(recruiter?' recruiter-match':' talent-match'):''}">${recruiter?'<header class="application-job-context"><small>Bewerbung auf</small><h3>'+E(a.title)+'</h3>'+jobCompany(a.company,a.industry)+(a.city?'<div class="meta">Arbeitsort: '+E(a.city)+'</div>':'')+'</header>':''}<div class="application-main">${header}${details}</div></article>`;
}
function applicationSubset(role,matches=false){
 const job=document.querySelector('#application-job-filter')?.value??(routeKey.startsWith('/recruiter/applications/job/')?routeKey.split('/')[4]:'');
 const company=document.querySelector('#application-company-filter')?.value;
 const history=document.querySelector('#application-history')?.checked;
 const matchStatus=document.querySelector('#match-status-filter')?.value;
 return state.applications.filter(a=>{
  if((company&&a.company_profile_id!==company)||(job&&a.id!==job))return false;
  if(matches)return a.state==='matched'&&(!matchStatus||currentMatchStatus(a,role)===matchStatus);
  if(a.state==='matched')return false;
  if(role==='talent')return !state.applicationStatus||a.state===state.applicationStatus;
  return history||a.state==='pending';
 }).sort((a,b)=>b.match.score-a.match.score||String(a.applied_at).localeCompare(String(b.applied_at)));
}
function applicationRows(list,role){
 const recruiter=role==='recruiter';
 return list.map(job=>({
  id:job.application_id,
  label:recruiter?job.candidate_name:job.title,
  subtitle:recruiter?job.title:job.company,
  subtitleIsCompany:!recruiter,
  industry:job.industry,
  status:job.state==='matched'?`<span class="status-pill">${E(matchStatuses[role][currentMatchStatus(job,role)])}</span>`:applicationStatus(job.state),
  job
 }));
}
function applicationResultList(key,rows,_headings,active){
 const label=key.endsWith('-matches')?'Matches':key.startsWith('talent-')?'Meine Bewerbungen':'Bewerbungen';
 return `<section class="desktop-table-panel desktop-only" aria-label="${label}">
  <ul class="desktop-job-list" data-desktop-choice-list="${E(key)}">
   ${rows.map(({id,label,subtitle,subtitleIsCompany,industry,status,job})=>`<li class="desktop-result-row" data-desktop-choice${id===active?' data-desktop-current':''}>
    <button type="button" class="desktop-row-control" data-desktop-select="${E(id)}" aria-pressed="${id===active}">${E(label)}</button>
    ${subtitle||(subtitleIsCompany&&industry)?`<small class="desktop-result-subtitle">${subtitleIsCompany?companyLabel(subtitle,industry):E(subtitle)}</small>`:''}
    <div class="desktop-result-summary">
     <div class="desktop-application-status">${status}<small>${date(job.applied_at)}</small></div>
     ${compactScore(job.match.score)}
    </div>
   </li>`).join('')}
  </ul>
 </section>`;
}
function paintApplications(role,matches=false,preferred=''){
 const list=applicationSubset(role,matches);
 if(!list.length&&matches&&document.querySelector('#match-status-filter')?.value)return empty('Keine Matches in dieser Auswahl','Passe den Statusfilter an.');
 if(!list.length&&!matches&&role==='talent'&&state.applicationStatus)return empty('Keine Bewerbungen in dieser Auswahl','Passe den Statusfilter an.');
 if(!list.length)return empty(matches?'Noch keine Matches':'Keine Bewerbungen in dieser Auswahl',matches?(role==='talent'?'Sobald ein Recruiter Deine Bewerbung annimmt, erscheint das Match hier.':'Nimm eine Bewerbung an, um ein Match zu erhalten.'):role==='recruiter'?'Passe die Filter an.':'Passe die Auswahl an oder entdecke passende Jobs.');
 const recruiter=role==='recruiter';
 return desktopDetails(role+'-applications-'+(matches?'matches':'open'),applicationRows(list,role),[],
  ({job})=>!recruiter&&!matches?candidateListCard(job,true):applicationCard(job,role),preferred,applicationResultList);
}
function applicationJobOptions(items,selected=''){
 return '<option value="">Alle Jobs</option>'+[...new Map(items.map(item=>[item.id,item.title]))].map(([id,title])=>
  `<option value="${E(id)}"${selected===id?' selected':''}>${E(title)}</option>`).join('');
}
function refreshApplicationList(){
 const role=state.me.profile.role;
 const matches=routeKey.split('/')[2]==='matches';
 const company=document.querySelector('#application-company-filter')?.value;
 const select=document.querySelector('#application-job-filter');
 if(select){
  const selected=select.value;
  select.innerHTML=applicationJobOptions(state.applications.filter(a=>(matches?a.state==='matched':a.state!=='matched')&&(!company||a.company_profile_id===company)),selected);
 }
 document.querySelector('#application-list').innerHTML=paintApplications(role,matches);
 expandDesktopDetails();
 loadListedJobMaps();
 observeMatchPictures(app);
}
function recruiterApplicationFilters(items,matches){
 const profiles=companyProfileFilter('application-company-filter');
 const jobs=`<label class="field"><span>Nach Job filtern</span><select id="application-job-filter"${matches?'':' tabindex="-1"'}>${applicationJobOptions(items,matches?'':routeKey.split('/')[4])}</select></label>`;
 if(matches)return `<div class="toolbar">${profiles}${jobs}${matchStatusFilter('recruiter')}</div>`;
 return `<div class="toolbar">${profiles}${jobs}</div>
  <label class="history-toggle"><input type="checkbox" id="application-history">Bearbeitete Bewerbungen einblenden</label>`;
}
async function applicationsPage(role,matches=false){state.applications=await api('applications');const subset=state.applications.filter(a=>matches?a.state==='matched':a.state!=='matched');return shell(role,matches?'matches':'applications',`<h1 class="page-title" data-page-title="${matches?'matches':'applications'}">${icon(matches?'match':'send')} ${matches?'Matches':role==='talent'?'Meine Bewerbungen':'Bewerbungen'}</h1><p class="intro">${matches?(role==='talent'?'Hier findest Du Deine Matches und die Kontaktdaten der Recruiter.':'Hier findest Du die Match-Profile und Kontaktdaten der Bewerber, deren Bewerbung Du angenommen hast.'):role==='talent'?'Bis zum Match sieht der Recruiter Deinen Vornamen, den ersten Buchstaben Deines Nachnamens, Deine Skills und Deinen Match-Score. Wenn Du unter „Über mich“ einen Kurztext hinterlegt hast, sieht er ihn bereits bei der Bewerbung. Nimmt er Deine Bewerbung an, entsteht ein Match. Dann sieht er Dein ganzes Match-Profil und Deine Kontaktdaten.':'Erst wenn Du eine Bewerbung annimmst, entsteht ein Match. Die 15 € je Match werden in der Testumgebung simuliert.'}</p>${role==='recruiter'?recruiterApplicationFilters(subset,matches):`<div class="toolbar">${matches?matchStatusFilter('talent'):candidateApplicationStatusFilter()}</div>`}<div id="application-list">${paintApplications(role,matches,routeKey.split('/')[3])}</div>`);}
function recruiterCompanyAccount(){
 const company=companyAccount();
 return `<section class="box"><h2>Unternehmenskonto</h2>
  ${company?`<strong>${E(company.legal_name)}</strong><p class="hint">${E(company.address)}<br>${E(company.postcode)} ${E(company.city)}</p>
   ${company.billing_address?`<p class="hint"><strong>Abweichende Rechnungsadresse</strong><br>${E(company.billing_address.address)}<br>${E(company.billing_address.postcode)} ${E(company.billing_address.city)}</p>`:''}
   <div class="company-account-actions"><a class="btn secondary small" href="#${E(companyRoute(company.id,'account'))}">Unternehmenskonto bearbeiten</a><a class="btn secondary small" href="#/recruiter/companies">Unternehmensprofile</a></div>`
   :'<a class="btn secondary small" href="#/recruiter/company/new">Unternehmenskonto anlegen</a>'}
 </section>`;
}
function profilePage(role){const p=state.me.profile;return shell(role,'',`<h1>${icon('user')} Mein Profil</h1><p class="intro">${role==='recruiter'?'Hier verwaltest Du Deinen Zugang, Dein Unternehmenskonto und die Unternehmensprofile, die Kandidaten sehen.':'Bei einem Match sieht der Recruiter Dein gesamtes Match-Profil und Deine Kontaktdaten, so könnt Ihr Euch direkt austauschen.'}</p><div data-desktop-tabs data-profile-tabs data-desktop-active="account"><div class="desktop-only">${role==='talent'?desktopTabs('profile',[['account','Konto'],['match-profile','Match-Profil']]):''}</div><div class="profile-sections"><form class="box" data-form="profile"><div class="row between"><h2>Konto</h2><div class="row">${actionButton('edit-profile','Bearbeiten','secondary small')}${role==='talent'?`<span class="desktop-profile-section" data-desktop-panel="account" data-desktop-current>${actionButton('open-password','Passwort ändern','secondary small')}</span>`:actionButton('open-password','Passwort ändern','secondary small')}</div></div>${role==='recruiter'?profilePicture():''}<fieldset class="profile-fields desktop-profile-section" data-desktop-panel="account" data-desktop-current disabled>${field('first_name','Vorname',{value:p.first_name})}${field('last_name','Nachname',{value:p.last_name})}${field('email','E-Mail',{type:'email',value:p.email,readonly:true})}${field('phone','Telefon',{type:'tel',value:p.phone,required:role==='recruiter',digitsOnly:role==='talent'})}</fieldset>${role==='talent'?`<div class="desktop-profile-section" data-desktop-panel="match-profile"><h2>Match-Profil</h2>${profilePicture()}<fieldset class="profile-fields" disabled><label class="field"><span>Über mich (optional)</span><textarea class="profile-summary" name="summary" maxlength="${PROFILE_SUMMARY_LIMIT}" aria-describedby="profile-summary-hint profile-summary-count">${E(p.extras?.summary||'')}</textarea><small id="profile-summary-count">${(p.extras?.summary||'').length}/${PROFILE_SUMMARY_LIMIT}</small></label><p class="hint" id="profile-summary-hint">Wenn Du hier einen Text hinterlegst, sieht ihn der Recruiter bereits bei Deiner Bewerbung.</p>${experienceEditor(p.extras?.experiences||[])}${field('links','Portfolio / Profil-Link',{value:p.extras?.links||'',required:false,placeholder:'https://…'})}</fieldset></div>`:''}<div class="form-error"></div><div class="form-actions" hidden data-profile-edit-only>${actionButton('cancel-profile-edit','Abbrechen','secondary')}<button type="submit" class="btn">Änderungen speichern</button></div></form><div${role==='talent'?' class="candidate-profile-side"':''}>${role==='talent'?`${jobFactsSetting()}<div class="box profile-skills"><h2>Deine Skills</h2>${selectedSkillList(state.me.candidate?.skills||[])}<a class="profile-skills-link" href="#/talent/filter">Skills im Job-Filter bearbeiten →</a></div><div class="box desktop-profile-section" data-desktop-panel="match-profile"><h2>CV, Zeugnisse & Nachweise</h2><p class="hint">Dein CV wird bei einem Match mit dem Recruiter geteilt.</p><p class="hint">Deine Zeugnisse und Nachweise werden bei einem Match mit dem Recruiter geteilt.</p><label class="field"><span>Dokument hinzufügen · max. 5 MB</span><input id="document-upload" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"></label><div id="document-list">${(state.me.documents||[]).map(d=>`<div class="document"><span>${E(d.name)}</span><div class="row">${actionButton('open-document','Öffnen','secondary small',`data-path="${E(d.path)}"`)}${actionButton('delete-document','×','danger small',`data-path="${E(d.path)}" aria-label="Dokument entfernen"`)}</div></div>`).join('')||'<p class="hint">Noch keine Dokumente hinterlegt.</p>'}</div></div>`:recruiterCompanyAccount()}<div class="box profile-logout">${actionButton('logout','Abmelden','secondary full')}<p class="hint">Zum Testen der anderen Rolle bitte zuerst abmelden.</p></div></div></div></div>`);}
function showModal(title,body,actions=''){modal.innerHTML=`<div class="modal-body"><div class="modal-head"><h2>${E(title)}</h2><button type="button" class="iconbtn" data-action="close-modal" aria-label="Schließen">×</button></div>${body}${actions?`<div class="modal-actions">${actions}</div>`:''}</div>`;if(!modal.open)modal.showModal();observeMatchPictures(modal);}
const hitCounterExplanation={
 talent:'Treffer zeigen Dir, wie viele neue Jobs zu Deinen Angaben im Job-Filter passen. Ein Match entsteht, wenn ein Recruiter Deine Bewerbung annimmt.',
 recruiter:'Treffer zeigen Dir, wie viele Kandidaten zu Deinen Angaben passen. Ein Match entsteht, wenn Du eine Bewerbung annimmst.'
};
let hitCounterObserver;
function observeHitCounters(){
 hitCounterObserver?.disconnect();
 hitCounterObserver=null;
 const profile=state.me?.profile;
 const owner=getSession()?.user?.id;
 if(!profile||!owner||modal.open)return;
 const key=`andtalents-hit-counter-notice:${profile.role}:${owner}`;
 const targets=app.querySelectorAll('[data-hit-counter]');
 if(!targets.length||localStorage.getItem(key))return;
 const observer=new IntersectionObserver(entries=>{
  if(observer!==hitCounterObserver||modal.open||getSession()?.user?.id!==owner)return;
  if(!entries.some(entry=>entry.intersectionRatio>=0.5&&app.contains(entry.target)&&entry.target.hasAttribute('data-hit-counter')))return;
  observer.disconnect();
  if(localStorage.getItem(key))return;
  localStorage.setItem(key,'1');
  showModal('Was sind Treffer?',`<p>${E(hitCounterExplanation[profile.role])}</p>`,actionButton('close-modal','Verstanden'));
 },{threshold:0.5});
 hitCounterObserver=observer;
 targets.forEach(target=>observer.observe(target));
}
modal.addEventListener('close',observeHitCounters);
function profilePicture(){
 return `<section class="profile-picture">
  <div class="profile-picture-layout">
   <div class="profile-picture-preview">
    <img alt="Dein Profilbild" hidden>
    <span data-picture-placeholder>${icon('user')}</span>
   </div>
   <div>
    <h3>Profilbild</h3>
    <div class="row profile-picture-actions">
     <input id="profile-picture-upload" type="file" accept="image/jpeg,image/png,image/webp" hidden>
     <button type="button" class="btn secondary small" data-action="choose-profile-picture" disabled>Bild hochladen</button>
     <button type="button" class="btn secondary small" data-action="remove-profile-picture" hidden>Bild entfernen</button>
    </div>
    <p class="hint">JPG, PNG oder WebP · max. 5 MB. Bei einem Match sieht die andere Person Dein Profilbild.</p>
    <div class="hint" data-picture-feedback aria-live="polite"></div>
   </div>
  </div>
 </section>`;
}
function paintProfilePicture(panel,picture){
 if(!panel.isConnected)return;
 const image=panel.querySelector('img');
 if(picture){
  const url=URL.createObjectURL(picture);
  const release=()=>URL.revokeObjectURL(url);
  image.onload=image.onerror=release;
  image.src=url;
 }else{
  image.removeAttribute('src');
 }
 image.hidden=!picture;
 panel.querySelector('[data-picture-feedback]').textContent='';
 panel.querySelector('[data-picture-placeholder]').hidden=!!picture;
 panel.querySelector('[data-action="choose-profile-picture"]').textContent=picture?'Bild ersetzen':'Bild hochladen';
 panel.querySelector('[data-action="remove-profile-picture"]').hidden=!picture;
}
async function loadProfilePicture(panel){
 try{
  paintProfilePicture(panel,await readProfilePicture());
 }catch{
  if(panel.isConnected)panel.querySelector('[data-picture-feedback]').textContent='Das Profilbild konnte nicht geladen werden.';
 }finally{
  if(panel.isConnected)panel.querySelector('[data-action="choose-profile-picture"]').disabled=false;
 }
}
function showPasswordForm(){
 if(isSharedDemo(state.me.profile.email)){
  showModal('Passwort ändern','<p>Dieses Demo-Konto wird gemeinsam genutzt. Du kannst Dein Passwort in einem eigenen Konto ändern.</p>',actionButton('close-modal','Schließen','secondary'));
  return;
 }
 showModal('Passwort ändern',`<form data-form="change-password">
  <label class="field"><span>Aktuelles Passwort *</span><input type="password" name="current_password" autocomplete="current-password" required autofocus></label>
  ${field('new_password','Neues Passwort',{type:'password'})}
  <p class="hint">Mindestens 8 Zeichen mit Groß- und Kleinbuchstaben, einer Zahl und einem Sonderzeichen.</p>
  ${field('repeat_password','Neues Passwort wiederholen',{type:'password'})}
  <div class="form-error" role="alert"></div>
  <div class="form-actions">${actionButton('close-modal','Abbrechen','secondary')}<button type="submit" class="btn orange">Passwort speichern</button></div>
 </form>`);
}
function recruiterPreviewContent(located){
 const sampleFactors=[1,0.7,0];
 const details=(located.skills||[]).map((skill,index)=>{
  const factor=sampleFactors[index]??1;
  return {...skill,factor,via:factor===1?skill.id:null,via_label:'Ähnlicher Beispiel-Skill',candidate_fire:factor===1&&Boolean(skill.fire)};
 });
 const match={score:86,details};
 const comparison=details.length?matchOverview(match)+skillList({...located,match}):'<p class="hint">Wähle Skills für Deinen Job, um den Vergleich in der Vorschau zu sehen.</p>';
 const hasSkills=details.length>0;
 const note=hasSkills?'Beispiel aus Kandidatensicht. Die 86 % und die Skill-Zuordnung sind exemplarisch.':'Beispiel aus Kandidatensicht.';
 const hasLocation=located.address||located.postcode||located.city;
 return `<p class="hint">${note}</p><div class="match-heading"><div><h3>${E(located.title?.trim()||'Offener Jobtitel')}</h3>${jobCompany(located.company,located.industry)}</div>${hasSkills?scoreWithInfo(match.score):''}</div>${jobFacts(located)}${comparison}${jobDescriptionBlock(located.description)}${hasLocation?locationBlock(located):''}`;
}
function jobPreviewData(form){
 const fields=Object.fromEntries(new FormData(form));
 const profile=state.me.company_profiles.find(item=>item.id===fields.company_profile_id);
 const {employment,travel}=readPrefs(form,true);
 return {...fields,employment,travel,company:profile?.public_name,industry:profile?.industry,properties:profile?.properties,skills:structuredClone(state.skills)};
}
async function showRecruiterJobPreview(job,closeLabel){
 const version=pageVersion;
 const located=/^\d{5}$/.test(job.postcode||job.preferences?.postcode||'')?await attachLocation(job):job;
 if(version!==pageVersion)return;
 showModal('Jobvorschau',recruiterPreviewContent(located),actionButton('close-modal',closeLabel,'secondary'));
}
function updateDesktopJobPreview(){
 const form=document.querySelector('[data-form="job"]');
 const preview=document.querySelector('[data-desktop-job-preview]');
 if(!form||!preview||!desktopViewport.matches)return;
 preview.innerHTML='<h2>Jobvorschau</h2>'+recruiterPreviewContent(jobPreviewData(form));
}
function applicationContact(application,role){
 if(application.state!=='matched')return '';
 const name=role==='talent'?application.recruiter_name:application.candidate_name;
 const phone=String(application.contact_phone??'').trim();
 return `<section class="profile-contacts match-contact-card">
  <h3>${role==='talent'?'Dein Ansprechpartner':'Kontakt'}</h3>
  <div class="match-contact-identity">
   <div class="match-contact-avatar" data-match-picture="${E(application.application_id)}">
    <img class="match-contact-picture" alt="${E(name?'Profilbild von '+name:'Profilbild')}" hidden>
    ${icon('user')}
   </div>
   <dl class="contact-details match-contact-name">
    <div><dt>Vorname und Nachname</dt><dd>${E(name)}</dd></div>
   </dl>
  </div>
  <dl class="contact-details match-contact-channels">
   <div><dt>E-Mail-Adresse</dt><dd><a href="mailto:${E(application.contact_email)}">${E(application.contact_email)}</a></dd></div>
   <div><dt>Telefonnummer</dt><dd>${phone?`<a href="tel:${E(phone)}">${E(phone)}</a>`:'nicht angegeben'}</dd></div>
  </dl>
 </section>`;
}
function observeMatchPictures(root){
 matchPictureObservers.get(root)?.disconnect();
 const targets=root.querySelectorAll('[data-match-picture]');
 if(!targets.length)return;
 const observer=new IntersectionObserver(entries=>{
  for(const entry of entries){
   if(!entry.isIntersecting)continue;
   observer.unobserve(entry.target);
   loadMatchPicture(entry.target);
  }
 });
 matchPictureObservers.set(root,observer);
 for(const target of targets)observer.observe(target);
}
async function loadMatchPicture(avatar){
 const owner=getSession()?.user?.id;
 try{
  const picture=await readMatchedProfilePicture(avatar.dataset.matchPicture);
  if(!picture||!avatar.isConnected||getSession()?.user?.id!==owner)return;
  const img=avatar.querySelector('img');
  const url=URL.createObjectURL(picture);
  try{
   img.src=url;
   await img.decode();
   img.hidden=false;
  }finally{URL.revokeObjectURL(url);}
 }catch{/* Contact details remain visible when an image is missing or cannot be loaded. */}
}
function showDetails(j,application=null,justAccepted=false){
 const role=state.me.profile.role;
 const recruiter=role==='recruiter';
 const contact=application?applicationContact(application,role):'';
 const candidate=application?.state==='matched'&&recruiter?candidateFullProfile(application):'';
 const skills=skillList(j,{candidateSkills:application?.candidate_skills||state.me.candidate?.skills||[]});
 const company=jobCompany(j.company,j.industry);
 const location=application?E([j.city,recruiter?optionLabel(j.properties?.office):'',optionLabel(j.language)].filter(Boolean).join(' · ')):'';
 const header=`<div class="match-heading"><div>${company}${application?`<div class="meta">${location}</div>`:''}</div>${scoreWithInfo(j.match.score)}</div>`;
 const status=application?`<p>${applicationStatus(application.state)}</p>`:'';
 const jobDetails=jobDescriptionBlock(j.description)+(recruiter?'':locationBlock(j));
 showModal(application&&recruiter?application.candidate_name:j.title,`
  ${header}${recruiter?'':jobFacts(j,showJobFacts())}${matchOverview(j.match)}${status}
  ${contact}${candidate}<div class="match-modal-skills">${skills}</div>${jobDetails}${matchExplanation()}`,
  justAccepted?'<a class="btn" href="#/recruiter/matches">Zu den Matches</a>':
   actionButton('close-modal','Zurück zur Übersicht','secondary'));
}
function safeLink(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}}
function candidateAbout(a){
 const summary=(a.candidate_extras?.summary??a.candidate_summary)?.trim();
 return summary?`<section class="recruiter-match-about"><h3>Über mich</h3><p>${E(summary)}</p></section>`:'';
}
const noCareerEntries='<p class="hint experience-empty">Keine Berufserfahrung angegeben.</p>';
function careerEntries(items){
 return Array.isArray(items)?items.filter(x=>[x?.title,x?.company,x?.start,x?.end,x?.description].some(value=>String(value??'').trim())):[];
}
function candidateCareer(items){
 const entries=careerEntries(items).map(x=>{
  const period=[month(x.start),x.current?'heute':month(x.end)].filter(Boolean).join(' – ');
  return `<article class="profile-experience">
   ${x.title?`<h4>${E(x.title)}</h4>`:''}
   ${x.company?`<strong>${E(x.company)}</strong>`:''}
   ${period?`<p>${E(period)}</p>`:''}
   ${x.description?`<p>${E(x.description)}</p>`:''}
  </article>`;
 }).join('');
 return `<section class="candidate-career"><h3>Berufserfahrung</h3>${entries||noCareerEntries}</section>`;
}
function candidateFullProfile(a,{showAbout=true}={}){
 const extras=a.candidate_extras||{};
 const link=safeLink(extras.links);
 const documents=(a.documents||[]).map(doc=>`<div class="document"><span>${E(doc.name)}</span>${actionButton('open-document','Öffnen','secondary small',`data-path="${E(doc.path)}"`)}</div>`).join('');
 return `<section class="details-section">
  <h3 class="match-section-title">Match-Profil</h3>
  ${showAbout?(candidateAbout(a)||'<p class="hint">Keine zusätzliche Beschreibung hinterlegt.</p>'):''}
  ${link?`<p><a href="${E(link)}" target="_blank" rel="noopener">Portfolio / Profil-Link ↗</a></p>`:''}
  ${candidateCareer(extras.experiences)}
  <section class="match-profile-documents">
   <h3>CV, Zeugnisse & Nachweise</h3>
   ${documents||'<p class="hint">Keine Dokumente hinterlegt.</p>'}
  </section>
 </section>`;
}
function experienceEditor(items){return `<section id="experience-editor"><h2>Berufserfahrung (optional)</h2><div id="experience-rows">${careerEntries(items).map(item=>experienceRow(item)).join('')}</div>${noCareerEntries}<div class="form-actions" hidden data-profile-edit-only>${actionButton('experience-entry','Berufserfahrung hinzufügen','secondary small','id="experience-entry"')}</div></section>`;}
function experienceRow(x={},editable=false){return `<article class="experience-row"><h3>Berufserfahrung</h3>${field('experience_title','Position',{value:x.title||'',required:false})}${field('experience_company','Unternehmen',{value:x.company||'',required:false})}<div class="cols">${field('experience_start','Von (MM.JJJJ)',{type:'month',value:x.start||'',required:false})}${field('experience_end','Bis (MM.JJJJ)',{type:'month',value:x.end||'',required:false})}</div><label class="current-job"><input type="checkbox" name="experience_current" ${x.current?'checked':''}>Bis heute</label><label class="field"><span>Beschreibung (optional)</span><textarea name="experience_description" maxlength="1500">${E(x.description||'')}</textarea></label>${actionButton('remove-experience','Eintrag entfernen','danger small','data-profile-edit-only'+(editable?'':' hidden'))}</article>`;}
function editProfile(button){
 const form=button.closest('form');
 form.querySelectorAll('.profile-fields').forEach(fields=>fields.disabled=false);
 if(state.me.profile.role==='talent')form.elements.phone.value=form.elements.phone.value.replace(/[^0-9]/g,'');
 button.hidden=true;
 form.querySelectorAll('[data-profile-edit-only]').forEach(control=>control.hidden=false);
 for(const checked of form.querySelectorAll('[name="experience_current"]:checked')){
  checked.closest('.experience-row').querySelector('[name="experience_end"]').disabled=true;
 }
 (form.querySelector('[data-desktop-panel="match-profile"][data-desktop-current] textarea')||form.elements.first_name).focus();
}
function cancelProfileEdit(form){
 if(state.busy)return;
 form.reset();
 const experience=form.querySelector('#experience-editor');
 if(experience)experience.outerHTML=experienceEditor(state.me.profile.extras?.experiences||[]);
 form.querySelectorAll('.profile-fields').forEach(fields=>fields.disabled=true);
 form.querySelector('.form-error').replaceChildren();
 form.querySelectorAll('[data-profile-edit-only]').forEach(control=>control.hidden=true);
 const edit=form.querySelector('[data-action="edit-profile"]');
 edit.hidden=false;
 resizeProfileSummary();
 edit.focus();
}
function updateExperienceButton(form){
 form.querySelector('#experience-entry').textContent=form.querySelector('[data-pending-experience]')?'Berufserfahrung speichern':'Berufserfahrung hinzufügen';
}
function toggleExperienceEntry(button){
 const form=button.closest('form');
 const pending=form.querySelector('[data-pending-experience]');
 if(pending){
  try{
   readExperiences(form);
   delete pending.dataset.pendingExperience;
   form.querySelector('.form-error').replaceChildren();
   toast('Eintrag übernommen. Bestätige ihn mit „Änderungen speichern“.');
  }catch(error){
   errorToForm(form,error);
  }
 }else{
  const rows=form.querySelector('#experience-rows');
  rows.insertAdjacentHTML('beforeend',experienceRow({},true));
  const entry=rows.lastElementChild;
  entry.dataset.pendingExperience='';
  entry.querySelector('[name="experience_title"]').focus();
 }
 updateExperienceButton(form);
}
function readExperiences(form){return [...form.querySelectorAll('.experience-row')].map(row=>{const get=n=>row.querySelector(`[name="experience_${n}"]`);const x={title:get('title').value.trim(),company:get('company').value.trim(),start:get('start').value,end:get('end').value,current:get('current').checked,description:get('description').value.trim()};if(!x.title||!x.company||!x.start||(!x.current&&!x.end))throw Error('Bitte Position, Unternehmen und Zeitraum jeder Berufserfahrung ausfüllen.');if(!x.current&&x.end<x.start)throw Error('Das Ende der Berufserfahrung darf nicht vor dem Beginn liegen.');if(x.current)x.end='';return x;});}
function saveDraft(){if(!state.me?.profile)return;const form=document.querySelector('form[data-count-form]');if(!form||form.dataset.committed)return;const f=Object.fromEntries(new FormData(form));if(form.dataset.form==='candidate'){state.draft.talentPrefs=readPrefs(form);state.draft.talentSkills=structuredClone(state.skills);}else if(form.dataset.form==='company'){const key=form.dataset.companyKey;const requestIds=state.draft.companyFields?.key===key?state.draft.companyFields.requestIds:undefined;state.draft.companyFields={...f,key,customName:form.dataset.customName==='true',requestIds};}else if(form.dataset.form==='job'){const key=form.dataset.draftKey;state.draft.jobEdits??={};state.draft.jobEdits[key]={...state.draft.job,baseline:form.jobBaseline,title:f.title,description:f.description,company_profile_id:f.company_profile_id,status:f.status,preferences:readPrefs(form,true),skills:structuredClone(state.skills)};}persistDraft();trackJobChanges();}
function persistDraft(){if(state.me?.profile)sessionStorage.setItem('andtalents-draft-'+state.me.profile.user_id,JSON.stringify(state.draft));}
function restoreDraft(){const uid=state.me?.profile?.user_id;if(!uid||state.draftOwner===uid)return;state.draftOwner=uid;try{state.draft=JSON.parse(sessionStorage.getItem('andtalents-draft-'+uid)||'{}');}catch{state.draft={};}}
function resetAccountView(){
 resources.invalidate();
 state.me=null;
 state.draft={};
 state.draftOwner=null;
 state.skills=[];
 state.jobs=[];
 state.applications=[];
 state.applicationStatus='';
 state.feed=[];
 state.saved=[];
 state.desktopProfileTab=null;
 state.recruiterDashboard=null;
 state.costs=null;
 sessionStorage.removeItem('onboarding-role');
}
function showExpiredSession(){
 if(getSession())return;
 const role=state.me?.profile?.role||routeKey.split('/')[1];
 rememberInterruptedJob();
 saveDraft();
 resetAccountView();
 const path=['talent','recruiter'].includes(role)?'/'+role+'/login':'/';
 history.replaceState(null,'','#'+path);
 render();
 toast('Deine Sitzung ist abgelaufen. Bitte melde Dich erneut an.');
}
window.addEventListener('andtalents-session-expired',()=>{
 if(state.me||!['/','/home'].includes(routeKey)&&!routeKey.endsWith('/login'))showExpiredSession();
});
function resumeJob(owner){
 let entry;
 try{entry=JSON.parse(sessionStorage.getItem(resumeJobKey)||'null');}catch{return false;}
 if(!entry||!owner||entry.owner!==owner||!/^\/recruiter\/(?:job\/(?:new|[a-f0-9-]+)|onboarding-job)$/.test(entry.path))return false;
 sessionStorage.removeItem(resumeJobKey);
 history.replaceState(entry.entry?{newJobEntry:entry.entry}:null,'','#'+entry.path);
 render();
 return true;
}
async function saveJobForm(form,status){
 const owner=getSession()?.user?.id;
 await form.workplacePending;
 if(!form.isConnected||getSession()?.user?.id!==owner)throw new SessionExpired();
 const f=Object.fromEntries(new FormData(form));
 const jobStatus=status||f.status;
 if(jobStatus!=='draft'){
  form.querySelector('.form-error').replaceChildren();
  if(!validateJobPublication(form,true,jobStatus==='published'))return null;
 }
 const result=await api('save_job',{id:state.draft.job?.id||null,title:f.title,description:f.description,company_profile_id:f.company_profile_id,status:jobStatus,preferences:readPrefs(form,true),skills:state.skills});
 resources.invalidate(jobCountKey(result.id));
 if(!form.isConnected||getSession()?.user?.id!==owner)throw new SessionExpired();
 form.dataset.committed='true';
 delete state.draft.jobEdits?.[form.dataset.draftKey];
 persistDraft();
 trackJobChanges();
 return result;
}
function validateJobPublication(form,announce=true,requireSkills=form.elements.status.value==='published'){
 const fields=form.elements;
 const requiredText=(name,message)=>fields[name].value.trim()?'':message;
 const choice=(name,message)=>fields[name].value?'':message;
 const postcode=fields.postcode.value.trim();
 const salary=fields.max_salary;
 const messages=[
  ['company_profile_id',requiredText('company_profile_id','Wähle ein Unternehmensprofil aus.')],
  ['title',requiredText('title','Gib einen Jobtitel ein.')],
  ['description',requiredText('description','Gib eine Kurzbeschreibung ein.')||(fields.description.value.length>240?'Kürze die Kurzbeschreibung auf höchstens 240 Zeichen.':'')],
  ['postcode',/^\d{5}$/.test(postcode)?'':'Gib eine fünfstellige PLZ ein.'],
  ['city',requiredText('city','Gib die Stadt des Arbeitsorts ein.')],
  ['travel',choice('travel','Wähle eine Reiseoption aus.')],
  ['employment',choice('employment','Wähle eine Beschäftigungsart aus.')],
  ['skills',!requireSkills||hasMinimumSkills(state.skills)&&state.skills.length<=10?'':'Wähle mindestens 5 und höchstens 10 Skills aus.'],
  ['experience',choice('experience','Wähle das erforderliche Erfahrungslevel aus.')],
  ['max_salary',salary.validity.valid&&Number(salary.value)<=10000000?'':'Gib ein gültiges maximales Jahresgehalt ein.'],
  ['leadership',choice('leadership','Wähle bei Mitarbeiterführung Ja oder Nein.')]
 ];
 for(const [name,message] of messages){
  const controls=[...form.querySelectorAll(`[name="${name}"]`)];
  const group=name==='skills'?form.querySelector('#selected-skills').closest('.group'):controls[0]?.closest('.group,.field');
  if(!group)continue;
  const id='job-error-'+name;
  group.querySelector('#'+id)?.remove();
  for(const control of controls){
   if(message){
    control.setAttribute('aria-invalid','true');
    control.setAttribute('aria-describedby',id);
   }else{
    control.removeAttribute('aria-invalid');
    if(control.getAttribute('aria-describedby')===id)control.removeAttribute('aria-describedby');
   }
  }
  if(message)group.insertAdjacentHTML('beforeend',`<small class="field-error" id="${id}">${E(message)}</small>`);
 }
 const errors=messages.filter(([,message])=>message);
 const summary=form.querySelector('.job-validation');
 summary.hidden=!errors.length;
 summary.innerHTML=errors.length?`<div class="error"><strong>Bitte ergänze oder korrigiere diese Angaben.</strong><ul>${errors.map(([,message])=>`<li>${E(message)}</li>`).join('')}</ul></div>`:'';
 if(errors.length&&announce)summary.focus();
 return !errors.length;
}
async function legalPage(){saveDraft();location.href='./legal/';}
function noticeFlags(){const uid=state.me?.profile?.user_id;let local={};try{local=JSON.parse(localStorage.getItem('andtalents-swipe-notices-'+uid)||'{}');}catch{}return {...state.me?.profile?.extras?.swipe_notices,...local};}
function markSwipeNotice(phase){const uid=state.me?.profile?.user_id;if(!uid)return;const flags={...noticeFlags(),[phase]:true};localStorage.setItem('andtalents-swipe-notices-'+uid,JSON.stringify(flags));state.me.profile.extras={...state.me.profile.extras,swipe_notices:flags};api('mark_swipe_notice',{phase}).catch(()=>{});}
function maybeSwipeNotice(){
 if(state.me?.profile?.role!=='talent'||modal.open||routeKey.includes('onboarding'))return;
 const jobsRoute=routeKey==='/talent/jobs'||routeKey.startsWith('/talent/jobs/');
 if(jobsRoute&&state.feed.length&&showSwipeIntro())return;
 const phase=noticePhase(jobsRoute?'/talent/jobs':routeKey,noticeFlags(),state.feed.length>0);
 if(!phase)return;
 showModal('Dein Match-Profil',`<p>Wenn Du Dich auf eine Stelle bewirbst und ein Recruiter Deine Bewerbung annimmt, sieht er automatisch Dein Match-Profil. Darin kannst Du Deine Berufserfahrung, eine kurze Beschreibung, Deinen CV und Zeugnisse ergänzen.</p><p>Diese Angaben bleiben freiwillig. Wenn Du einen Kurztext hinterlegst, sieht ihn der Recruiter bereits bei Deiner Bewerbung. Ohne freiwillige Angaben kommen bei einem Match nur Deine Kontaktdaten hinzu.</p>`,actionButton('notice-profile','Match-Profil ausfüllen','secondary')+actionButton('close-modal','Verstanden'));
 markSwipeNotice(phase);
}
async function render(){const version=++pageVersion;clearTimeout(countTimer);const route=(location.hash.slice(1)||'/').replace(/\/$/,'')||'/';if(route==='/talent/viewed'){location.replace('#/talent/dashboard');return;}routeKey=route;renderedLocation=location.href;renderedHistory=history.state;modal.close();app.innerHTML=header(route.split('/')[1]||state.me?.profile?.role)+
  (route.startsWith('/talent/jobs')||route==='/talent/dashboard'
   ? '<main class="page">'+loadPlaceholder('Wird geladen …')+'</main>'
   : '<main class="loading" aria-live="polite">Wird geladen …</main>');try{
 const [,entryRole,entryPage,entryStep]=route.split('/');
 if(['talent','recruiter'].includes(entryRole)){
  if(entryPage==='forgot-password'||entryPage==='reset-password'){app.innerHTML=passwordRecoveryPage(entryRole,entryPage==='reset-password');return;}
  if(entryPage==='onboarding'&&!entryStep){
   const registering=getSession();
   if(registering){
    const me=await readMe();
    if(version!==pageVersion||getSession()?.user?.id!==registering.user.id)return;
    state.me=me;
    app.innerHTML=sessionStorage.getItem('onboarding-role')===entryRole&&!me.profile?accountPage(entryRole):registrationSessionPage(entryRole);
   }else app.innerHTML=accountPage(entryRole);
   return;
  }
 }
 if(!getSession()){state.me=null;if(route==='/'||route==='/home')app.innerHTML=home();else{const [,role,page]=route.split('/');if(!['talent','recruiter'].includes(role)){go('/');return;}app.innerHTML=page==='login'?loginPage(role):role==='recruiter'&&page==='feedback'?recruiterFeedbackEntry():guestPage(role,page);}return;}
 const me=await readMe();if(version!==pageVersion||!me)return;state.me=me;restoreDraft();
 if(!state.me.profile){const role=sessionStorage.getItem('onboarding-role')||'talent';app.innerHTML=accountPage(role);return;}
 const role=state.me.profile.role;
 if(route==='/'||route==='/home'){app.innerHTML=home();return;}
 if(route==='/recruiter/feedback'&&role==='talent'){app.innerHTML=recruiterFeedbackEntry(true);return;}
 const [,requested,page,id]=route.split('/');if(requested!==role){app.innerHTML=narrow(errorBlock('Bitte melde Dich ab, um die andere Rolle zu verwenden.')+actionButton('logout','Abmelden','secondary'));return;}
 let content;
 if(page==='onboarding'){
  const profile=companyProfile(state.draft.companyProfile?.id)||state.me.company_profiles[0];
  const company=companyAccount();
  content=role==='talent'?candidateForm(true):companyForm('onboarding',company,profile);
 }
 else if(page==='filter'&&role==='talent')content=candidateForm();
 else if(page==='company'&&role==='recruiter')content=companiesPage(id,route.split('/')[4],route.split('/')[5]);
 else if(page==='companies'&&role==='recruiter')content=companiesPage();
 else if(page==='job'&&role==='recruiter'){
  if(!state.me.company_profiles.length){go('/recruiter/company/new');return;}
  if(id==='new')content=newJobForm();
  else {
   const jobs=await readRecruiterJobs(id);
   if(version!==pageVersion)return;
   const job=jobs.find(item=>item.id===id);
   if(!job)throw Error('Job nicht gefunden.');
   state.jobs=jobs;content=jobForm(job);
  }
 }
 else if(page==='onboarding-job'&&role==='recruiter'){
  if(!state.me.company_profiles.length){go('/recruiter/onboarding/company');return;}
  content=jobForm(null,true);
 }
 else if(page==='jobs')content=await jobsPage(role);
 else if(page==='costs'&&role==='recruiter')content=await costsPage(version);
 else if(page==='feedback'&&role==='recruiter')content=recruiterFeedbackPage();
 else if(page==='applications'||page==='matches')content=await applicationsPage(role,page==='matches');
 else if(page==='saved'&&role==='talent')content=await savedPage();
 else if(page==='profile')content=profilePage(role);
 else if(page==='login'){go('/'+role+'/dashboard');return;}
 else content=await dashboard(role);
 if(version!==pageVersion)return;
 app.innerHTML=content;
 observeRecruiterJobCounts();
 const profileTabs=app.querySelector('[data-profile-tabs]:has([data-desktop-tab])');
 if(profileTabs&&state.desktopProfileTab)activateDesktopTab(profileTabs,state.desktopProfileTab);
 const picturePanel=app.querySelector('.profile-picture');
 if(picturePanel)loadProfilePicture(picturePanel);
 observeMatchPictures(app);
 loadRecruiterDashboardFilter();
 loadTalentDashboard();
 expandDesktopDetails();
 if(role==='talent'&&['saved','applications','matches'].includes(page))loadListedJobMaps();
 updateDesktopJobPreview();
 if(route.startsWith('/talent/jobs')){loadActiveFeedCard();refreshCandidateFeed();}
 paintSkills();
 resizeJobDescription();
 resizeProfileSummary();
 const jobEditor=document.querySelector('[data-form="job"]');
 if(jobEditor){
  jobEditor.jobBaseline=state.draft.jobEdits?.[jobEditor.dataset.draftKey]?.baseline||jobSnapshot(jobEditor);
  jobEditor.workplacePending=loadWorkplaces(jobEditor);
 }
 trackJobChanges();
 const companyWorkplaceList=app.querySelector('[data-company-workplaces]');
 if(companyWorkplaceList)loadCompanyWorkplaces(companyWorkplaceList);
 const candidateEditor=document.querySelector('[data-form="candidate"]');
 if(candidateEditor&&candidateEditor.elements.postcode.value&&!candidateEditor.elements.city.value)lookupCandidatePostcode(candidateEditor);
 scheduleCount(0);
 if(!route.startsWith('/talent/jobs')||resources.peek('feed',feedFreshFor))maybeSwipeNotice();
 observeHitCounters();
 }catch(error){if(version!==pageVersion)return;if(error instanceof SessionExpired&&!getSession()){showExpiredSession();return;}app.innerHTML=narrow(errorBlock(error)+actionButton('retry','Erneut versuchen','secondary')+'<a class="back-link" href="#/">Zur Startseite</a>');}}
async function withButton(button,fn){if(state.busy)return;state.busy=true;if(button)button.disabled=true;try{await fn();}catch(error){if(error instanceof SessionExpired&&!getSession())showExpiredSession();else toast(error.message,true);}finally{state.busy=false;if(button?.isConnected)button.disabled=false;}}
function validateCompanyFields(form,scroll=true){
 const missing=[];
 for(const control of form.querySelectorAll('[required]')){
  if(control.matches(':disabled')){control.removeAttribute('data-company-invalid');continue;}
  const group=control.type==='radio'?control.closest('.group'):null;
  if(group&&control!==group.querySelector('input'))continue;
  const label=(group?.querySelector('label')||control.closest('.field')?.querySelector('span'))?.textContent?.replace(/\s*\*$/,'');
  const section=control.name.startsWith('site_')?' (Erster Standort)':control.name.startsWith('billing_')?' (Rechnungsadresse)':
   addressFields.includes(control.name)&&form.dataset.form==='company'?' (Unternehmenskonto)':'';
  const invalid=!control.validity.valid||!control.value.trim();
  (group||control).toggleAttribute('data-company-invalid',invalid);
  if(invalid&&label)missing.push(label+section+(control.validity.valueMissing||!control.value.trim()?' fehlt.':' ist ungültig.'));
 }
 const error=form.querySelector('.form-error');
 const message=missing.length?`<div class="error" role="alert"><strong>Bitte ergänze oder korrigiere diese Angaben:</strong><ul>${missing.map(item=>`<li>${E(item)}</li>`).join('')}</ul></div>`:'';
 if(error.innerHTML!==message)error.innerHTML=message;
 if(missing.length&&scroll)error.scrollIntoView({block:'nearest'});
 return !missing.length;
}

async function saveCompanyForm(form,fields){
 const mode=form.dataset.companyMode;
 const company=state.me.companies.find(item=>item.id===form.dataset.companyId);
 const profile=companyProfile(form.dataset.profileId);
 // Reuse identifiers when a request can have reached the server before timing out.
 const draft=state.draft.companyFields;
 const ids=(draft?.key===form.dataset.companyKey&&draft.requestIds)||{};
 if(!company)ids.company??=crypto.randomUUID();
 if(!profile&&mode!=='account')ids.profile??=crypto.randomUUID();
 saveDraft();
 state.draft.companyFields.requestIds=ids;
 persistDraft();
 const account=form.elements.legal_name?{
  id:company?.id||ids.company,legal_name:fields.legal_name.trim(),
  ...Object.fromEntries(addressFields.map(key=>[key,fields[key].trim()])),
  billing_address:fields.separate_billing==='on'?Object.fromEntries(addressFields.map(key=>[key,fields['billing_'+key].trim()])):null
 }:null;
 let accountId=company?.id,profileId=profile?.id;
 if(mode==='account'){
  accountId=(await api('save_company',account)).id;
 }else{
  const place=form.elements.site_name?{name:fields.site_name.trim(),...Object.fromEntries(addressFields.map(key=>[key,fields['site_'+key].trim()]))}:null;
  const result=await saveCompanySetup(account,{
   id:profile?.id||ids.profile,company_id:accountId||null,public_name:fields.public_name.trim(),
   industry:fields.industry,language:fields.language.trim(),properties:companyProperties(fields,profile?.properties)
  },place);
  accountId=result.company_id;
  profileId=result.profile_id;
  state.draft.company={id:accountId};
  state.draft.companyProfile={id:profileId};
 }
 form.dataset.committed='true';
 delete state.draft.companyFields;
 persistDraft();
 resources.invalidate('me');
 toast(mode==='account'?'Unternehmenskonto gespeichert.':'Unternehmensprofil gespeichert.');
 go(mode==='onboarding'?'/recruiter/onboarding-job':companyRoute(accountId,profileId));
}

document.addEventListener('submit',async event=>{const form=event.target;if(!form.dataset.form)return;event.preventDefault();const button=event.submitter||form.querySelector('button:not([type="button"])');await withButton(button,async()=>{try{const f=Object.fromEntries(new FormData(form));switch(form.dataset.form){
case 'request-password-reset':{
 const address=f.email.trim();
 if(address.toLowerCase().endsWith('@example.invalid'))throw Error('Testadressen mit @example.invalid haben kein Postfach. Verwende für diesen Test eine erreichbare E-Mail-Adresse.');
 await requestPasswordReset(address,form.dataset.role);
 if(form.isConnected)form.innerHTML='<p role="status">Wenn zu dieser E-Mail-Adresse ein Konto besteht, erhältst Du einen Link zum Zurücksetzen. Öffne ihn in diesem Browser.</p>';
 break;
}
case 'reset-password':{
 if(!recovery?.session)throw Error('Fordere bitte einen neuen Link zum Zurücksetzen an.');
 if(f.password!==f.repeat)throw Error('Die Passwörter stimmen nicht überein.');
 if(!validPassword(f.password))throw Error('Bitte erfülle alle Passwortregeln.');
 await finishPasswordReset(recovery.session,f.password);
 recovery=null;
 toast('Dein Passwort wurde geändert. Du kannst Dich jetzt anmelden.');
 go('/'+form.dataset.role+'/login');
 break;
}
case 'login':await login(f.email,f.password);resources.invalidate();{const me=await readMe();if(me.profile&&me.profile.role!==form.dataset.role){await logout();throw Error('Dieses Konto gehört zur anderen Rolle. Melde Dich im passenden Bereich an.');}if(!resumeJob(me.profile?.user_id))go('/'+form.dataset.role+'/dashboard');}break;
case 'account':{if(form.dataset.role==='recruiter'&&!validateCompanyFields(form))break;if(f.password!==f.repeat)throw Error('Die Passwörter stimmen nicht überein.');if(!validPassword(f.password))throw Error('Bitte alle fünf Passwortregeln erfüllen.');const role=form.dataset.role;sessionStorage.setItem('onboarding-role',role);if(!getSession())await signup(f.email,f.password);await api('save_account',{role,first_name:f.first_name,last_name:f.last_name,phone:f.phone||''});resources.invalidate();state.me=await readMe();go('/'+role+'/onboarding/'+(role==='talent'?'filter':'company'));break;}
case 'candidate':{requireMinimumSkills();const preferences=readPrefs(form);if(!preferences.travel.length)throw Error('Bitte mindestens eine Reiseoption auswählen.');await api('save_candidate',{preferences,skills:state.skills});resources.invalidate();form.dataset.committed="true";delete state.draft.talentPrefs;delete state.draft.talentSkills;persistDraft();toast('Job-Filter gespeichert.');go('/talent/jobs');break;}
case 'company':if(validateCompanyFields(form))await saveCompanyForm(form,f);break;
case 'cost-period':{
 const reset=event.submitter?.value==='reset';
 const from=reset?null:f.from||null, to=reset?null:f.to||null;
 if(from&&to&&form.elements.from.valueAsNumber>form.elements.to.valueAsNumber)throw Error('Das Bis-Datum muss am oder nach dem Von-Datum liegen.');
 const costs=await api('recruiter_costs',{p_from:from,p_to:to});
 if(form.isConnected){
  state.costs=costs;
  filterCosts();
  if(reset)form.reset();
  form.querySelector('.form-error').replaceChildren();
 }
 break;
}
case 'recruiter-feedback':{
 const rating=Number(f.rating);
 if(!Number.isInteger(rating)||rating<1||rating>10)throw Error('Bitte wählen Sie eine Einschätzung von 1 bis 10.');
 const submission_id=form.dataset.feedbackSubmission??=crypto.randomUUID();
 const payload={submission_id,rating,contact_name:f.contact_name.trim(),contact_email:f.contact_email.trim(),
  friction:f.friction.trim(),decision:f.decision.trim(),use_case:f.use_case.trim()};
 await request('/rest/v1/rpc/app_recruiter_feedback',{body:{p_feedback:payload}});
 if(form.isConnected){
  form.removeAttribute('data-form');
  form.innerHTML='<p role="status">Vielen Dank. Ihr Feedback wurde gespeichert.</p><a href="#/recruiter/dashboard" class="btn secondary">Zum Dashboard</a>';
 }
 break;
}
case 'job':{const publishedNow=form.elements.status.value==='published'&&state.draft.job?.status!=='published';const job=await saveJobForm(form);if(!job)break;toast(publishedNow?'Job veröffentlicht.':'Job gespeichert.');go('/recruiter/jobs'+(desktopViewport.matches&&job.id?'/'+job.id:''));break;}
case 'workplace':{
 const {profile_id,id,name,address,postcode,city}=f;
 const places=await profileWorkplaces(profile_id,{id,name,address,postcode,city,is_primary:f.is_primary==='on'});
 const editor=form.jobEditor;
 if(editor?.isConnected&&editor.dataset.workplaceProfile===profile_id){
  editor.workplaceLoad=null;
  editor.workplaces=places;
  paintWorkplacePicker(editor);
  const saved=places.find(place=>addressKey(place)===addressKey({address,postcode,city}));
  if(saved&&form.isConnected&&modal.open){
   fillJobAddress(editor,saved);
   saveDraft();
   scheduleCount();
   updateDesktopJobPreview();
  }
 }
 const overview=document.querySelector('[data-company-workplaces]');
 if(overview?.dataset.companyWorkplaces===profile_id)paintCompanyWorkplaces(overview,places);
 if(form.isConnected&&modal.open)modal.close();
 toast('Standort gespeichert.');
 break;
}
case 'change-password':{
 const p=state.me?.profile;
 if(!p||isSharedDemo(p.email))break;
 if(f.new_password!==f.repeat_password)throw Error('Die neuen Passwörter stimmen nicht überein.');
 if(!validPassword(f.new_password))throw Error('Das neue Passwort erfüllt noch nicht alle Passwortregeln.');
 if(f.current_password===f.new_password)throw Error('Wähle ein anderes Passwort als Dein aktuelles.');
 await changePassword(f.current_password,f.new_password);
 if(form.isConnected&&modal.open)modal.close();
 toast('Passwort geändert.');
 break;
}
case 'profile':{
 if(form.querySelector('.profile-fields').disabled)break;
 const {role,extras}=state.me.profile;
 if(role==='talent'&&f.summary.length>PROFILE_SUMMARY_LIMIT&&f.summary!==form.elements.summary.defaultValue){
  throw Error(`Kürze den Text unter „Über mich“ auf höchstens ${PROFILE_SUMMARY_LIMIT} Zeichen.`);
 }
 const originalPhone=form.elements.phone.defaultValue;
 const phone=role==='talent'&&f.phone===originalPhone.replace(/[^0-9]/g,'')?originalPhone:f.phone;
 await api('save_account',{role,first_name:f.first_name,last_name:f.last_name,phone,extras:role==='talent'?{...extras,summary:f.summary||'',links:f.links||'',experiences:readExperiences(form)}:extras});
 resources.invalidate('me');toast('Profil gespeichert.');await render();break;
}
}}catch(error){if(error instanceof SessionExpired&&!getSession())showExpiredSession();else if(form.isConnected)errorToForm(form,error);}});});
modal.addEventListener('close',()=>{if(!modal.open)modal.querySelector('[data-form="change-password"]')?.reset();});
document.addEventListener('click',async event=>{
 const row=event.target.closest('[data-desktop-select]');
 if(row){
  if(state.busy)return;
  const selection=selectDesktopItem(row);
  if(selection?.key==='talent-feed'){
   resetDrag();
   document.querySelector('#swipe-stack').innerHTML=swipeCard();
   loadActiveFeedCard();
  }
  return;
 }
 const tab=event.target.closest('[data-desktop-tab]');
 if(tab){
  const group=tab.closest('[data-desktop-tabs]');
  activateDesktopTab(group,tab.dataset.desktopTab);
  if(group.hasAttribute('data-profile-tabs'))state.desktopProfileTab=tab.dataset.desktopTab;
  if(tab.dataset.desktopTab==='match-profile')resizeProfileSummary();
  return;
 }
 const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action,id=button.dataset.id;if(action==='toggle-password'){const password=document.querySelector('#login-password');const showing=password.type==='password';password.type=showing?'text':'password';button.textContent=showing?'Verbergen':'Anzeigen';return;}if(action==='close-modal'){modal.close();return;}if(action==='notice-profile'){modal.close();go('/talent/profile');return;}if(action==='legal'){await legalPage(button.dataset.role);return;}if(action==='edit-profile'){editProfile(button);return;}if(action==='cancel-profile-edit'){cancelProfileEdit(button.form);return;}if(action==='experience-entry'){toggleExperienceEntry(button);return;}if(action==='remove-experience'){const form=button.closest('form');button.closest('.experience-row').remove();updateExperienceButton(form);return;}if(action==='save-draft'){await withButton(button,async()=>{const job=await saveJobForm(document.querySelector('#matching-form'),'draft');toast('Entwurf gespeichert.');go('/recruiter/jobs'+(desktopViewport.matches&&job?.id?'/'+job.id:''));});return;}if(action==='retry'){render();return;}if(action==='retry-feed-detail'){loadActiveFeedCard();return;}
if(action==='choose-profile-picture'){
 button.closest('.profile-picture').querySelector('input[type="file"]').click();
 return;
}
if(action==='remove-profile-picture'){
 const panel=button.closest('.profile-picture');
 await withButton(button,async()=>{
  await removeProfilePicture();
  paintProfilePicture(panel,null);
  toast('Profilbild entfernt.');
 });
 return;
}
if(action==='explain-match-score'){
 const panel=button.closest('dialog .modal-body');
 if(panel){
  let explanation=panel.querySelector('.match-score-dialog-help');
  if(!explanation){
   const anchor=button.closest('.match-heading');
   anchor.insertAdjacentHTML('afterend','<div class="match-score-dialog-help" tabindex="-1">'+matchExplanationBody+'</div>');
   explanation=panel.querySelector('.match-score-dialog-help');
  }else explanation.hidden=!explanation.hidden;
  if(!explanation.hidden)explanation.focus();
  button.setAttribute('aria-expanded',String(!explanation.hidden));
 }else showModal(matchExplanationTitle,matchExplanationBody,actionButton('close-modal','Verstanden'));
 return;
}
if(action==='toggle-mobile-details'){
 const expanded=button.getAttribute('aria-expanded')==='true';
 const content=document.getElementById(button.getAttribute('aria-controls'));
 if(!content)return;
 content.classList.toggle('is-expanded',!expanded);
 button.setAttribute('aria-expanded',String(!expanded));
 button.textContent=expanded?button.textContent.replace('ausblenden','einblenden'):button.textContent.replace('einblenden','ausblenden');
 return;
}
if(action==='import-job-link'||action==='import-job-text'){await importJob(button,action==='import-job-link');return;}
if(action==='use-imported-job-title'){const title=button.closest('[data-job-import-results]').importedTitle;const field=button.form.elements.title;if(title){field.value=title;field.dispatchEvent(new Event('input',{bubbles:true}));updateDesktopJobPreview();field.focus();}return;}
if(['fire','remove-skill','toggle-skill','add-package'].includes(action)){updateSkillSelection(button,action,id);return;}
if(action==='occupation'){await withButton(button,async()=>{const origin=pageVersion;const items=await api('catalog',{kind:'package',id:Number(id)});if(origin!==pageVersion||!document.querySelector('#occupation-results'))return;state.package=items;items.forEach(s=>state.catalog.set(s.id,s));document.querySelector('#occupation-results').innerHTML=actionButton('add-package','Bis zu 10 Vorschläge übernehmen','secondary small')+items.map(skillResult).join('');});return;}
if(action==='confirm-reject'){showModal('Bewerbung ablehnen?','<p>Die Bewerbung erscheint im Verlauf mit dem Status „Abgelehnt“. Es entstehen keine Kosten.</p>',actionButton('close-modal','Abbrechen','secondary')+actionButton('reject','Ablehnen','danger',`data-id="${id}"`));return;}if(action==='confirm-match'){const a=state.applications.find(a=>a.application_id===id);showModal('Bewerbung annehmen?',`<p>Bitte bestätige, dass Du die Bewerbung von <strong>${E(a.candidate_name)}</strong> für <strong>${E(a.title)}</strong> annimmst.</p><p>Danach stellen wir Dir die hinterlegten Kontaktdaten und das Match-Profil von <strong>${E(a.candidate_name)}</strong> bereit.</p><div class="notice orange"><strong>15 € simulierte Matchkosten</strong><br>Testmodus: Es wird kein Geld berechnet.</div>`,actionButton('close-modal','Abbrechen','secondary')+actionButton('accept','Annehmen','',`data-id="${id}"`));return;}
if(action==='confirm-withdraw-application'){
 const application=state.applications.find(item=>item.application_id===id&&item.state==='pending');
 if(state.me?.profile?.role!=='talent'||!application)return;
 showModal('Bewerbung zurückziehen?',`<p>Möchtest Du Deine Bewerbung für <strong>${E(application.title)}</strong> zurückziehen?</p>`,
  actionButton('close-modal','Abbrechen','secondary')+actionButton('withdraw-application','Bewerbung zurückziehen','danger',`data-id="${E(id)}"`));
 return;
}
await withButton(button,async()=>{switch(action){
case 'logout':
case 'logout-for-registration':
 await logout();
 resetAccountView();
 go(action==='logout-for-registration'?'/'+id+'/onboarding':'/');
 break;
case 'open-workplace':{
 const editor=button.closest('form');
 if(!editor)break;
 await editor.workplacePending;
 if(!editor.isConnected)break;
 const place=jobAddress(editor);
 const stored=editor.workplaceChoices?.some(item=>addressKey(item)===addressKey(place));
 showWorkplaceForm(editor.dataset.workplaceProfile,stored?{}:place,editor);
 break;
}
case 'cancel-company-account':{
 const form=button.form;
 if(form?.dataset.companyMode!=='account')break;
 form.dataset.committed='true';
 if(state.draft.companyFields?.key===form.dataset.companyKey){
  delete state.draft.companyFields;
  persistDraft();
 }
 go('/recruiter/companies');
 break;
}
case 'copy-company-address':{
 const form=button.form;
 const company=state.me.companies.find(item=>item.id===form.dataset.companyId)||{};
 for(const key of addressFields)form.elements['site_'+key].value=form.elements[key]?.value??company[key]??'';
 if(!form.elements.site_name.value&&form.elements.site_city.value)form.elements.site_name.value=form.elements.site_city.value+' · Zentrale';
 if(form.querySelector('[data-company-invalid]'))validateCompanyFields(form,false);
 saveDraft();
 scheduleCount();
 break;
}
case 'company-tab':{
 const overview=button.closest('.company-overview');
 overview.querySelector('.company-profile-columns').dataset.companyTab=id;
 overview.querySelectorAll('[data-action="company-tab"]').forEach(tab=>tab.setAttribute('aria-pressed',String(tab===button)));
 break;
}
case 'toggle-company-workplaces':{
 const container=button.closest('[data-company-workplaces]');
 paintCompanyWorkplaces(container,container.places,button.getAttribute('aria-pressed')!=='true');
 container.querySelector('[data-action="toggle-company-workplaces"]').focus();
 break;
}
case 'add-company-workplace':showWorkplaceForm(id);break;
case 'edit-company-workplace':{
 const container=button.closest('[data-company-workplaces]');
 const place=container.places.find(item=>item.id===id);
 if(place)showWorkplaceForm(container.dataset.companyWorkplaces,place);
 break;
}
case 'open-password':if(state.me?.profile)showPasswordForm();break;
case 'demo':{
 await login(button.dataset.email,'Demo!Talents2026');
 resetAccountView();
 if(!resumeJob(getSession()?.user?.id))go('/'+button.dataset.role+'/dashboard');
 break;
}
case 'apply':case 'skip':case 'bookmark':{const job=activeFeedJob(),feed=state.feed,card=document.querySelector('.swipe-card'),owner=getSession()?.user?.id;if(!job||!card)return;card.classList.add('pending');try{await api('job_action',{job_id:job.id,decision:action});if(getSession()?.user?.id!==owner)return;invalidateCandidateFeed(job.id,true);if(!card.isConnected||state.feed!==feed)return;card.dataset.leaving=action;card.style.transform='';card.classList.add('leaving');await new Promise(resolve=>setTimeout(resolve,240));if(!card.isConnected||state.feed!==feed)return;if(!noticeFlags().started)markSwipeNotice('started');state.feed.splice(state.feed.indexOf(job),1);paintCandidateFeed();maybeSwipeNotice();}catch(error){card.classList.remove('pending','dragging','leaving');card.style.transform='';card.querySelector('.swipe-feedback').textContent='';throw error;}toast(action==='apply'?applicationSent:action==='bookmark'?'Job gemerkt.':'Job abgelehnt.');break;}
case 'apply-saved':case 'unsave':await api('job_action',{job_id:id,decision:action==='apply-saved'?'apply':'unsave'});invalidateCandidateFeed(id,action==='apply-saved');toast(action==='apply-saved'?applicationSent:'Job entfernt.');await render();break;
case 'delete-job':case 'confirm-job-lifecycle':{
 const job=state.jobs.find(item=>item.id===id);
 if(job)await changeJobLifecycle(job,action==='delete-job'?'delete':button.dataset.operation,
  action==='confirm-job-lifecycle'?Number(button.dataset.pendingCount):null);
 break;
}
case 'full-profile':case 'application-detail':{const a=state.applications.find(a=>a.application_id===id);if(a)showDetails(a,a);break;}
case 'accept':case 'reject':const result=await api('decide',{application_id:id,decision:action});modal.close();if(result.changed===false){toast('Die Bewerbung wurde bereits bearbeitet.',true);await render();break;}toast(action==='accept'?'Bewerbung angenommen. Ihr habt ein Match und seht Eure Kontaktdaten.':'Abgelehnt.');await render();if(action==='accept'){const accepted=state.applications.find(a=>a.application_id===id);if(accepted)showDetails(accepted,accepted,true);}break;
case 'withdraw-application':{
 const result=await api('withdraw_application',{application_id:id});
 modal.close();
 toast(result.state==='withdrawn'?'Bewerbung zurückgezogen.':'Die Bewerbung wurde bereits bearbeitet.',result.state!=='withdrawn');
 await render();
 break;
}
case 'decline-saved':{
 const result=await api('decline_saved_job',{job_id:id});
 invalidateCandidateFeed(id,true);
 toast(result.changed?'Job abgelehnt.':'Der Job ist nicht mehr gespeichert.',!result.changed);
 await render();
 break;
}
case 'open-document':{const tab=window.open('about:blank','_blank');try{const url=await documentUrl(button.dataset.path);if(tab){tab.opener=null;tab.location=url;}else location.href=url;}catch(error){tab?.close();throw error;}break;}
case 'delete-document':showModal('Dokument entfernen?','<p>Die Datei wird aus Deinen Unterlagen entfernt und steht auch Matches nicht mehr zur Verfügung.</p>',actionButton('close-modal','Abbrechen','secondary')+actionButton('delete-document-confirm','Entfernen','danger',`data-path="${E(button.dataset.path)}"`));break;
case 'delete-document-confirm':await deleteDocument(button.dataset.path);resources.invalidate('me');modal.close();toast('Datei entfernt.');await render();break;
case 'own-preview':{
 const job=state.jobs.find(item=>item.id===id);
 const profile=companyProfile(job.company_profile_id);
 await showRecruiterJobPreview({...job,...job.preferences,industry:jobIndustry(job),properties:profile?.properties},'Schließen');
 break;
}
case 'preview-job':{
 await showRecruiterJobPreview(jobPreviewData(button.form),'Zurück zum Formular');
 break;
}
}});});
// Guard keystrokes and pasted text before insertion. Restore the last valid
// value when a browser delivers a non-cancelable edit (for example autofill).
const lastAcceptedInput=new WeakMap();
function invalidInputCharacters(input){
 if(input.matches('input[data-digits]'))return /[^0-9]/;
 if(input.matches('input[data-phone]'))return /[^0-9+() .\/-]/;
}
document.addEventListener('focusin',event=>{
 if(invalidInputCharacters(event.target))lastAcceptedInput.set(event.target,event.target.value);
});
document.addEventListener('beforeinput',event=>{
 if(invalidInputCharacters(event.target)?.test(event.data||''))event.preventDefault();
});
document.addEventListener('paste',event=>{
 if(invalidInputCharacters(event.target)?.test(event.clipboardData?.getData('text/plain')||''))event.preventDefault();
});
document.addEventListener('input',event=>{
 const input=event.target;
 const invalid=invalidInputCharacters(input);
 if(!invalid)return;
 if(invalid.test(input.value))input.value=lastAcceptedInput.get(input)??input.defaultValue;
 else lastAcceptedInput.set(input,input.value);
},true);
const formatCount=value=>new Intl.NumberFormat('de-DE').format(value);
function availabilityCounter(role){return `<aside class="counter" aria-live="polite" aria-atomic="true" hidden>${icon('target',true)}<strong id="live-count">…</strong><small>Treffer</small></aside>`;}
function countPayload(form){
 const fields=new FormData(form);
 if(form.dataset.form==='company'){
  const {office,size,type,culture}=companyProperties(Object.fromEntries(fields));
  const postcode=fields.get('site_postcode')||fields.get('postcode');
  return {preferences:{postcode},skills:[],properties:{office,size,type,culture}};
 }
 const {city,address,...preferences}=readPrefs(form,form.dataset.form==='job');
 if(form.dataset.form==='candidate'&&preferences.radius==='de')delete preferences.postcode;
 if(preferences.postcode&&!/^\d{5}$/.test(preferences.postcode))delete preferences.postcode;
 return {
  preferences,
  skills:structuredClone(state.skills),
  company_profile_id:fields.get('company_profile_id')
 };
}
function countIsReady(kind,{preferences,properties,skills,company_profile_id}){
 const validPostcode=/^\d{5}$/.test(preferences.postcode);
 if(kind==='company')return validPostcode&&Object.values(properties).every(Boolean);
 if(!hasMinimumSkills(skills)||!preferences.employment.length||!preferences.experience.length||!preferences.leadership.length)return false;
 if(kind==='job')return Boolean(company_profile_id)&&validPostcode&&
  Number.isInteger(preferences.travel)&&preferences.travel>=0&&preferences.max_salary>0;
 return (validPostcode||preferences.radius==='de')&&preferences.travel.length>0&&preferences.min_salary>0;
}
function scheduleCount(delay=250){
 const form=document.querySelector('[data-count-form]'),out=document.querySelector('#live-count');
 if(!form||!out)return;
 const payload=countPayload(form);
 const counter=out.parentElement;
 if(!countIsReady(form.dataset.form,payload)){
  clearTimeout(countTimer);
  ++countVersion;
  delete out._countKey;
  counter.hidden=true;
  counter.removeAttribute('aria-busy');
  counter.removeAttribute('data-hit-counter');
  return;
 }
 const key=JSON.stringify(payload);
 if(key===out._countKey)return;
 out._countKey=key;
 clearTimeout(countTimer);
 const request=++countVersion,version=pageVersion;
 const isCurrent=()=>request===countVersion&&version===pageVersion&&out.isConnected;
 counter.hidden=false;
 out.textContent='…';
 out.parentElement.removeAttribute('data-hit-counter');
 out.parentElement.setAttribute('aria-busy','true');
 countTimer=setTimeout(async()=>{
  try{
   const result=await api('preview_count',payload);
   if(isCurrent()){
    out.textContent=formatCount(result.count);
    out.parentElement.removeAttribute('title');
    out.parentElement.toggleAttribute('data-hit-counter',Number.isFinite(result.count));
    observeHitCounters();
   }
  }catch{
   if(isCurrent()){
    delete out._countKey;
    out.textContent='–';
    out.parentElement.title='Die Anzahl konnte nicht geladen werden.';
   }
  }finally{
   if(isCurrent())out.parentElement.removeAttribute('aria-busy');
  }
 },delay);
}
function syncCandidatePostcodeRequired(form){
 const postcode=form.elements.postcode;
 postcode.required=form.elements.radius.value!=='de';
 postcode.labels[0].querySelector('span').textContent=postcode.required?'PLZ *':'PLZ';
}
async function lookupCandidatePostcode(form){
 const {postcode,city}=form.elements;
 const display=form.querySelector('#candidate-city');
 const hint=form.querySelector('#postcode-hint');
 const value=postcode.value;
 postcode.setCustomValidity('');
 city.value='';
 display.value='–';
 hint.textContent='';
 if(!/^\d{5}$/.test(value))return;
 try{
  const result=await api('postcode',{postcode:value});
  if(!form.isConnected||postcode.value!==value)return;
  city.value=result?.city||'';
  display.value=city.value||'–';
  const error=result?'':'PLZ nicht gefunden.';
  postcode.setCustomValidity(error);
  hint.textContent=error;
  saveDraft();
 }catch{}
}
document.addEventListener('input',event=>{const input=event.target;const form=input.form;if(input.name==='separate_billing'&&form?.dataset.form==='company'){const billing=form.querySelector('#billing-address-fields');billing.hidden=billing.disabled=!input.checked;}if(form?.dataset.companyMode==='onboarding'){if(input.name==='public_name')form.dataset.customName='true';if(input.name==='legal_name'&&form.dataset.customName==='false')form.elements.public_name.value=input.value;}if(input.name==='postcode'&&input.form?.dataset.form==='candidate')lookupCandidatePostcode(input.form);if(input.form?.dataset.form==='job'&&addressFields.includes(input.name))syncWorkplaceChoice(input.form);if(form?.querySelector('[data-company-invalid]'))validateCompanyFields(form,false);else form?.querySelector('.form-error')?.replaceChildren();if(input.closest('[data-count-form]')&&!input.dataset.search)saveDraft();if(input.matches('.profile-summary'))resizeProfileSummary();if(input.name==='password'){const p=input.value;const flags=[p.length>=8,/[A-Z]/.test(p),/[a-z]/.test(p),/\d/.test(p),/[\W_]/.test(p)];document.querySelectorAll('#password-rules li').forEach((li,i)=>li.classList.toggle('valid',flags[i]));}if(input.matches('textarea[name="description"]')){resizeJobDescription(input);const counter=document.querySelector('#description-count');if(counter)counter.textContent=input.value.length+'/240';}if(input.closest('[data-count-form]')&&!input.dataset.search)scheduleCount();if(input.dataset.search){clearTimeout(input._searchTimer);const kind=input.dataset.search;const request=++searchVersion;input._searchTimer=setTimeout(async()=>{const container=document.querySelector('#'+kind+'-results');if(input.value.trim().length<2){if(container)container.innerHTML='';return;}try{const data=await api('catalog',{kind,q:input.value});if(request!==searchVersion||!container?.isConnected)return;data.forEach(s=>state.catalog.set(s.id,s));container.innerHTML=data.length?data.map(s=>kind==='occupation'?`<button type="button" class="result" data-action="occupation" data-id="${s.id}">${E(s.label)}</button>`:skillResult(s)).join(''):'<div class="result muted">Keine passenden Einträge gefunden.</div>';}catch(error){if(container?.isConnected)container.innerHTML=`<div class="result inline-error">${E(error.message)}</div>`;}},250);}});
document.addEventListener('change',async event=>{const el=event.target;if(el.id==='profile-picture-upload'){
 const file=el.files[0];
 el.value='';
 if(!file)return;
 const panel=el.closest('.profile-picture');
 await withButton(panel.querySelector('[data-action="choose-profile-picture"]'),async()=>{
  const picture=await saveProfilePicture(file);
  paintProfilePicture(panel,picture);
  toast('Profilbild gespeichert.');
 });
 return;
}
if(el.id==='candidate-application-status-filter'){
 state.applicationStatus=el.value;
 refreshApplicationList();
 return;
}
if(el.id==='show-job-facts'){localStorage.setItem(jobFactsPreferenceKey(),el.checked?'on':'off');return;}if(el.matches('select[data-match-status]')){await saveMatchStatus(el);return;}if(el.id==='dashboard-profile-filter'){filterRecruiterDashboard(el.value);return;}if(el.form?.dataset.form==='job'&&['company_profile_id','workplace'].includes(el.name)){changeWorkplace(el);return;}if(el.id==='cost-profile-filter'||el.id==='cost-job-filter'){filterCosts();return;}if(el.dataset.jobStatus){await changeRecruiterJobStatus(el);return;}if(el.name==='experience_current'){const end=el.closest('.experience-row').querySelector('[name=experience_end]');end.disabled=el.checked;if(el.checked)end.value='';}if(el.name==='radius'&&el.form?.dataset.form==='candidate')syncCandidatePostcodeRequired(el.form);if(el.closest('[data-count-form]')){saveDraft();scheduleCount();}if(el.id==='job-company-filter'||el.id==='job-status-filter'){const profile=document.querySelector('#job-company-filter').value,status=document.querySelector('#job-status-filter').value;const jobs=state.jobs.filter(j=>(!profile||j.company_profile_id===profile)&&(!status||j.status===status));document.querySelector('#own-jobs').innerHTML=ownJobDetails(jobs);observeRecruiterJobCounts();}if(['application-company-filter','application-job-filter','application-history','match-status-filter'].includes(el.id))refreshApplicationList();if(el.id==='document-upload'&&el.files[0])await withButton(null,async()=>{toast('Datei wird hochgeladen …');await upload(el.files[0]);resources.invalidate('me');toast('Datei sicher gespeichert.');await render();});if(el.name==='postcode'&&el.form?.dataset.form!=='candidate'&&/^\d{5}$/.test(el.value)&&getSession()){try{const postcode=el.value;const loc=await api('postcode',{postcode});if(!el.isConnected||el.value!==postcode)return;const hint=el.form?.querySelector('#postcode-hint');if(hint)hint.textContent=loc?loc.city:'PLZ nicht gefunden.';const city=el.form?.elements.city;if(city&&!city.value&&loc){city.value=loc.city;if(el.form.dataset.form==='job'){syncWorkplaceChoice(el.form);saveDraft();}}}catch{}}});
let pointer;
function resetDrag(){if(!pointer)return;const card=pointer.card;pointer=null;card.classList.remove('dragging');card.style.transform='';card.querySelector('.swipe-feedback').textContent='';card.removeAttribute('data-direction');}
document.addEventListener('pointerdown',e=>{const card=e.target.closest('.swipe-card');if(pointer||e.isPrimary===false||!card||state.busy||e.button!==0||e.target.closest('button,a,iframe,input'))return;pointer={id:e.pointerId,card,x:e.clientX,y:e.clientY,dx:0,dy:0,vertical:!!e.target.closest('.swipe-grab')};});
document.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;const p=pointer;p.dx=e.clientX-p.x;p.dy=e.clientY-p.y;if(!p.vertical&&Math.abs(p.dy)>Math.abs(p.dx)&&!p.card.classList.contains('dragging')){resetDrag();return;}if(Math.max(Math.abs(p.dx),Math.abs(p.dy))<8)return;if(!p.card.hasPointerCapture(e.pointerId))p.card.setPointerCapture(e.pointerId);p.card.classList.add('dragging');const down=p.vertical&&p.dy>Math.abs(p.dx);p.card.dataset.direction=down?'bookmark':p.dx>0?'apply':'skip';p.card.querySelector('.swipe-feedback').textContent=down?'MERKEN':p.dx>0?'BEWERBEN':'ABLEHNEN';p.card.style.transform=`translate(${down?p.dx*.2:p.dx}px,${down?p.dy:p.dy*.15}px) rotate(${down?0:p.dx/22}deg)`;});
document.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;const p=pointer;const action=p.vertical&&p.dy>100&&p.dy>Math.abs(p.dx)?'bookmark':Math.abs(p.dx)>Math.min(100,p.card.offsetWidth*.27)&&Math.abs(p.dx)>Math.abs(p.dy)?p.dx>0?'apply':'skip':null;resetDrag();if(action)p.card.querySelector(`[data-action="${action}"]`)?.click();});
document.addEventListener('pointercancel',e=>{if(pointer?.id===e.pointerId)resetDrag();});
document.addEventListener('lostpointercapture',event=>{
 // Touch starts with implicit capture on the touched element. Moving it to the card is part of the gesture.
 if(pointer?.id===event.pointerId&&event.target===pointer.card)resetDrag();
});

document.addEventListener('click',event=>{
 const link=event.target.closest('a[href^="#/"]');
 if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.target||link.href===location.href)return;
 if(!confirmJobDeparture())event.preventDefault();
},true);
window.addEventListener('hashchange',()=>{
 if(renderedLocation===location.href)return;
 if(!confirmJobDeparture()){
  history.replaceState(renderedHistory,'',renderedLocation);
  return;
 }
 resetDrag();
 mapObserver?.disconnect();
 mapTargets.clear();
 saveDraft();
 window.scrollTo(0,0);
 render();
});
function refreshJobValidation(form){
 if(form?.dataset.form==='job'&&!form.querySelector('.job-validation').hidden)validateJobPublication(form,false);
}
document.addEventListener('input',event=>{
 if(!event.target.dataset.search)refreshJobValidation(event.target.form);
});
document.addEventListener('click',event=>{
 if(event.target.closest('[data-action="toggle-skill"],[data-action="add-package"],[data-action="remove-skill"]')){
  refreshJobValidation(app.querySelector('[data-form="job"]'));
 }
});
window.addEventListener('resize',()=>{
 resizeJobDescription();
 resizeProfileSummary();
});
desktopViewport.addEventListener('change',()=>{
 loadRecruiterDashboardFilter();
 loadTalentDashboard();
 if(document.querySelector('#application-company-filter')?.value)refreshApplicationList();
 if(!desktopViewport.matches&&document.querySelector('#dashboard-profile-filter')?.value){
  document.querySelector('#dashboard-profile-filter').value='';
  filterRecruiterDashboard('');
 }
 expandDesktopDetails();
 updateDesktopJobPreview();
 const feed=document.querySelector('#candidate-feed');
 if(feed&&!state.busy){resetDrag();paintCandidateFeed();}
});
document.addEventListener('input',event=>{
 if(event.target.form?.dataset.form==='job')updateDesktopJobPreview();
});
document.addEventListener('change',event=>{
 if(event.target.form?.dataset.form==='job')updateDesktopJobPreview();
});
window.addEventListener('storage',event=>{
 if(!syncSession(event))return;
 rememberInterruptedJob();
 saveDraft();
 const role=state.me?.profile?.role;
 resetAccountView();
 if(!getSession()&&['talent','recruiter'].includes(role))history.replaceState(null,'','#/'+role+'/login');
 render();
});
async function start(){
 const url=new URL(location.href);
 const pending=pendingRecovery();
 const code=url.searchParams.get('code');
 if(code||(pending&&url.searchParams.has('error'))){
  history.replaceState(null,'',url.pathname+'#/'+(pending?.role||'talent')+'/reset-password');
  if(code&&pending){
   try{recovery={session:await exchangeRecovery(code,pending)};}catch{/* Invalid links can be requested again. */}
  }
 }
 render();
}
start();

// Pair native validation messages with their inputs for assistive technology.
document.addEventListener('invalid',event=>{const input=event.target;if(!input.form)return;
 if(input.name==='rating'&&input.form.dataset.form==='recruiter-feedback'){
  const error=input.form.querySelector('.form-error');
  if(!error.hasChildNodes())error.innerHTML=errorBlock('Bitte wählen Sie eine Einschätzung von 1 bis 10.');
  return;
 }
 const panel=input.closest('[data-desktop-panel]');
 const tabs=panel?.closest('[data-desktop-tabs]');
 if(desktopViewport.matches&&tabs&&Array.from(input.form.elements).find(control=>control.willValidate&&!control.validity.valid)===input){
  activateDesktopTab(tabs,panel.dataset.desktopPanel);
 }
 input.setAttribute('aria-invalid','true');const id='field-error-'+(input.name||'input');let out=input.parentElement.querySelector('.field-error');if(!out){out=document.createElement('small');out.className='field-error';out.id=id;input.after(out);}out.textContent=input.validationMessage;input.setAttribute('aria-describedby',id);},true);
document.addEventListener('input',event=>{const input=event.target;if(input.getAttribute('aria-invalid')==='true'&&input.validity.valid){input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');input.parentElement.querySelector('.field-error')?.remove();}});
