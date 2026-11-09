import {MIN_SKILLS,MATCH_MIN,TRAVEL_LABELS,selectedTravel,hasMinimumSkills,meetsMatchPolicy,mayShowNavigation,noticePhase} from './product-policy.js?v=0.9.2';
import {scorePill,matchOverview,skillList,topSkillIcon} from './match-view.js?v=0.9.3';
import {api,login,signup,logout,changePassword,getSession,upload,documentUrl,deleteDocument,companyWorkplaces} from './backend.js?v=0.10.9';
import {initializeTheme} from './theme-preferences.js?v=0.10.1';
initializeTheme();
const app=document.querySelector('#app'),modal=document.querySelector('#modal');
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
const applicationSent='Bewerbung gesendet. Nimmt der Recruiter sie an, habt Ihr ein Match.';
const state={me:null,draft:{},skills:[],catalog:new Map(),jobs:[],applications:[],feed:[],saved:[],busy:false};
let pageVersion=0,searchVersion=0,countTimer,countVersion=0,toastTimer,routeKey='';
const go=path=>{if(location.hash==='#'+path)render();else location.hash=path;};
function toast(text,error=false){const el=document.querySelector('#toast');el.textContent=text;el.className='show'+(error?' error-toast':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className='',5000);}
function errorBlock(error){return `<div class="error" role="alert">${E(error.message||error)}</div>`;}
function field(name,label,{type='text',value='',placeholder='',required=true,maxlength='',readonly=false,digitsOnly=false}={}){
 const postalCode=name==='postcode';
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
function header(role){const navigation=mayShowNavigation(role,state.me,routeKey,!!getSession());return `<header class="header ${getSession()?'':'guest-header'}">${navigation?`<a class="iconbtn" href="#/${role}/dashboard" aria-label="Dashboard">${icon('home')}</a>`:'<span></span>'}<a class="brand" href="#/"><img class="logo" src="./logo.jpg" alt="&TALENTS Logo"><span class="app-version">Version 0.10.10</span></a><div class="header-actions">${navigation?`<a class="iconbtn" href="#/${role}/profile" aria-label="Mein Profil">${icon('user')}</a>`:''}</div></header>`;}
function nav(role,current){if(!mayShowNavigation(role,state.me,routeKey,!!getSession()))return '';const links=role==='talent'?[['filter','edit','Job-Filter'],['jobs','cards','Jobs'],['applications','send','Bewerbungen'],['matches','match','Matches'],['saved','bookmark','Gespeicherte Jobs']]:[['jobs','cards','Jobs'],['applications','send','Bewerbungen'],['matches','match','Matches']];return `<nav class="nav" aria-label="Hauptnavigation">${links.map(([path,glyph,title])=>`<a href="#/${role}/${path}" aria-label="${title}" title="${title}" ${current===path?'aria-current="page"':''} class="${current===path?'active':''}">${icon(glyph)}</a>`).join('')}</nav>`;}
function shell(role,current,content,counterRole=null){return header(role)+(counterRole?`<div class="availability-rail" aria-label="Aktuelle Trefferzahl">${availabilityCounter(counterRole)}</div>`:'')+`<main class="page ${current==='jobs'&&role==='talent'?'swipe-page':''} ${counterRole?'page-with-counter':''}">${content}</main>`+nav(role,current);}
function narrow(content,role=routeKey.split('/')[1]||state.me?.profile?.role){role=['talent','recruiter'].includes(role)?role:null;return header(role)+`<main class="narrow ${role==='recruiter'?'onboarding-recruiter':''}">${content}</main>`+(role?nav(role,''):'');}
function steps(current,total,text){return `<div class="steps">${Array.from({length:total},(_,i)=>`${i?'<span class="step-line"></span>':''}<span class="step ${i+1===current?'active':i+1<current?'done':''}">${i+1<current?'✓':i+1}</span>`).join('')}</div><div class="step-caption">Schritt ${current} von ${total}: ${text}</div>`;}
function empty(title,text,link=''){return `<div class="empty"><div class="empty-icon">◇</div><h2>${E(title)}</h2><p>${E(text)}</p>${link}</div>`;}
function scoreBadge(score,kind='chart'){const n=Math.max(0,Math.min(100,Number(score)||0));return `<span class="score" aria-label="Skill-Match ${n} Prozent"><span class="score-fill" style="width:${n} %"></span><span class="score-value">${icon(kind,true)} ${n} %</span></span>`;}
function skillsWidget(job=false){return `<div class="group"><label>Skills * <span id="skill-count">(${state.skills.length}/10)</span></label><p class="hint">${job?'Wähle bis zu 10 Skills, die für diesen Job wichtig sind. Je genauer die Auswahl, desto passender die Kandidaten. Für die Veröffentlichung brauchst Du mindestens 5 Skills.':'Wähle mindestens 5 und höchstens 10 Skills. Du kannst nach einem Beruf oder direkt nach einzelnen Skills suchen.'}</p><label class="field skill-search"><span>Suche nach Deinem Beruf</span><input name="occupation-search" data-search="occupation" placeholder="z. B. Programmierer, Buchhalter, Designer" autocomplete="off"></label><div class="search-results" id="occupation-results"></div><label class="field skill-search"><span>Oder suche direkt nach Skills</span><input name="skill-search" data-search="skill" placeholder="z. B. Python, SAP, Schweißen" autocomplete="off"></label><div class="search-results" id="skill-results"></div><div id="selected-skills" class="skill-area"></div><p class="hint">Markiere bis zu 3 Skills mit ${topSkillIcon()} als Top Skills – ${job?'die Anforderungen, die Dir am wichtigsten sind':'Deine größten Stärken'}. Sie zählen beim Matching stärker.</p></div>`;}
function skillResult(s){const selected=state.skills.some(x=>Number(x.id)===Number(s.id));return `<button type="button" class="result${selected?' selected':''}" data-action="add-skill" data-id="${s.id}" data-label="${E(s.label)}" aria-pressed="${selected}" ${selected?'disabled':''}>${selected?'✓':'＋'} ${E(s.label)}${selected?' · Ausgewählt':''}</button>`;}
function markSkillResults(){document.querySelectorAll('.search-results [data-action="add-skill"]').forEach(button=>{const selected=state.skills.some(s=>String(s.id)===button.dataset.id);button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));button.disabled=selected;button.textContent=(selected?'✓ ':'＋ ')+button.dataset.label+(selected?' · Ausgewählt':'');});}
function selectedSkillList(skills,editable=false){
 const rows=skills.map(s=>editable?`<li class="selected-skill-row"><button type="button" class="top-skill-toggle" data-action="fire" data-id="${s.id}" aria-label="Top Skill ${E(s.label)}" aria-pressed="${!!s.fire}">${topSkillIcon(s.fire)}</button><span>${E(s.label)}</span><button type="button" class="remove-skill" data-action="remove-skill" data-id="${s.id}" aria-label="${E(s.label)} entfernen">×</button></li>`:`<li class="selected-skill-row"><span class="selected-skill-marker">${s.fire?topSkillIcon(true,'Top Skill'):''}</span><span>${E(s.label)}</span></li>`).join('');
 return rows?`<ul class="selected-skill-list${editable?'':' static-skill-list'}">${rows}</ul>`:'<p class="hint">Noch keine Skills ausgewählt.</p>';
}
function paintSkills(){const el=document.querySelector('#selected-skills');if(!el)return;el.innerHTML=`<div class="skill-title">Ausgewählte Skills (${state.skills.length}/10):</div>${selectedSkillList(state.skills,true)}`;document.querySelector('#skill-count').textContent=`(${state.skills.length}/10)`;markSkillResults();}
function prefsForm(p={},job=false){return `<div class="section-label">Notwendige Angaben</div><section class="filter-group">${job?`<h2>Arbeitsort</h2><p class="hint">Die Unternehmensadresse ist vorbelegt. Du kannst die Adresse für diesen Job ändern.</p><div id="workplace-picker"></div>${field('address','Straße & Hausnummer',{value:p.address||'',required:false})}`:'<h2>Suchort</h2>'}<div class="cols${job?'':' candidate-location'}">${field('postcode','PLZ',{value:p.postcode||'',placeholder:'z. B. 10115',required:job||(p.radius||'de')!=='de'})}${job?field('city','Stadt',{value:p.city||'',placeholder:'z. B. Berlin'}):`<label class="field"><span>Stadt / Stadtteil</span><output class="city-display" id="candidate-city">${E(p.city||'–')}</output><input type="hidden" name="city" value="${E(p.city||'')}"></label>`}</div><div id="postcode-hint" class="hint" aria-live="polite"></div>${job?actionButton('open-workplace','Arbeitsort benennen und speichern','secondary small'):'' }${job?'':pills('radius',['10','25','50','100','de'],p.radius||'de',{single:true,caption:'Umkreis'})}</section>${pills('travel',TRAVEL_LABELS,selectedTravel(p.travel,job).map(i=>TRAVEL_LABELS[i]),{single:job,required:true,caption:'Reisebereitschaft'})}${!job?'<p class="hint">Mehrfachauswahl möglich. Nur die gewählten Reiseoptionen passen zu Deinem Filter.</p>':''}${pills('employment',job?[...choices.employment,'Vollzeit oder Teilzeit']:choices.employment,job&&p.employment?.length===2?['Vollzeit oder Teilzeit']:p.employment||[],{required:true,single:job})}${skillsWidget(job)}${pills('experience',choices.experience,p.experience||[],{required:true,single:job,caption:job?'Erforderliches Erfahrungslevel':'Erfahrungslevel'})}<section class="filter-group">${field(job?'max_salary':'min_salary',job?'Maximales Gehalt (brutto/Jahr)':'Mindestgehalt (brutto/Jahr)',{type:'number',value:p[job?'max_salary':'min_salary']||'',placeholder:'z. B. 45000'})}<p class="hint">${job?'Kandidaten sehen das maximale Gehalt nicht. Wir nutzen es ausschließlich für das Matching.':'Dein Mindestgehalt sieht niemand, weder der Recruiter noch der Arbeitgeber. Wir nutzen es und den Gehaltsrahmen des Jobs ausschließlich für das Matching.'}</p></section>${pills('leadership',choices.leadership,p.leadership||[],{required:true,single:job})}${!job?`<div class="section-label">Optionale Angaben</div><p class="hint">Verfeinere Deine Treffer. Mehrfachauswahl möglich.</p>${['office','size','type','culture'].map(k=>pills(k,choices[k],p[k]||[])).join('')}`:''}`;}
function readPrefs(form,job=false){const f=new FormData(form);const get=name=>f.getAll(name);return {postcode:String(f.get('postcode')||''),city:String(f.get('city')||''),address:String(f.get('address')||''),radius:String(f.get('radius')||'de'),travel:job?(f.has('travel')?TRAVEL_LABELS.indexOf(f.get('travel')):null):get('travel').map(x=>TRAVEL_LABELS.indexOf(x)),employment:get('employment').includes('Vollzeit oder Teilzeit')?['Vollzeit','Teilzeit']:get('employment'),leadership:get('leadership'),experience:get('experience'),[job?'max_salary':'min_salary']:Number(f.get(job?'max_salary':'min_salary')), ...Object.fromEntries(['office','size','type','culture'].map(k=>[k,get(k)]))};}
function errorToForm(form,error){const el=form.querySelector('.form-error');if(el){el.innerHTML=errorBlock(error);el.scrollIntoView({behavior:'smooth',block:'center'});}else toast(error.message,true);}
function validPassword(p){return p.length>=8&&/[A-Z]/.test(p)&&/[a-z]/.test(p)&&/\d/.test(p)&&/[\W_]/.test(p);}
const recruiterDemoEmails={
 recruiter:'recruiter001@example.invalid',
 headhunter:'demo-headhunter-01@example.invalid'
};
const isRecruiterDemo=email=>Object.values(recruiterDemoEmails).includes(email?.toLowerCase());
function home(){return narrow(`<section class="welcome"><h1>Dein nächster Schritt.<br>Dein passendes Match.</h1><p class="intro">Echte Skills. Klare Anforderungen.<br>Finde heraus, wer wirklich zusammenpasst.</p><div class="role-cards"><a class="role-card" href="#/talent/onboarding" data-new-registration="talent"><span class="symbol">${icon('user')}</span><strong>Für Kandidaten</strong><small>Profil anlegen und passende Jobs entdecken</small></a><a class="role-card" href="#/recruiter/onboarding" data-new-registration="recruiter"><span class="symbol">${icon('cards')}</span><strong>Für Recruiter</strong><small>Unternehmensprofil und Jobs anlegen</small></a></div><div class="row" style="justify-content:center"><a href="#/talent/login">Anmelden für Kandidaten</a><span class="muted">·</span><a href="#/recruiter/login">Anmelden für Recruiter</a></div></section><div class="box"><h3>Mit Testdaten ausprobieren</h3><p class="hint">Wähle ein Testkonto und probiere den Ablauf vom Treffer über die Bewerbung bis zum Match aus.</p><div class="demo-list">${actionButton('demo','<span>Miriam · Recruiter</span><span>→</span>','secondary','data-email="'+recruiterDemoEmails.recruiter+'" data-role="recruiter"')}${actionButton('demo','<span>Robin · Headhunter</span><span>→</span>','secondary','data-email="'+recruiterDemoEmails.headhunter+'" data-role="recruiter"')}${actionButton('demo','<span>Lena · Backend-Entwicklerin</span><span>→</span>','secondary','data-email="candidate001@example.invalid" data-role="talent"')}${actionButton('demo','<span>Amir · Datenanalyst</span><span>→</span>','secondary','data-email="candidate002@example.invalid" data-role="talent"')}</div></div><p class="footer-note">&TALENTS · Online-Testumgebung<br>Nur fiktive Angaben verwenden. Alle Matchkosten sind simuliert.</p>`);}
function guestPage(role,page){const titles={jobs:'Deine Jobs',filter:'Dein Job-Filter',applications:'Deine Bewerbungen',matches:'Deine Matches',saved:'Gespeicherte Jobs',profile:'Dein Profil'};return shell(role,page,`<h1>${titles[page]||'Willkommen'}</h1>${empty('Dein Profil ist noch nicht angelegt','Lege zuerst Dein Konto an. Anschließend kannst Du Deinen Job-Filter einrichten und passende Jobs entdecken.',`<a class="btn orange" href="#/${role}/onboarding">Profil anlegen</a><a class="back-link" href="#/${role}/login">Bereits registriert? Anmelden</a>`)}`);}
const testEnvironmentNote='<p class="hint login-test-note"><strong>Hinweis für die Testumgebung</strong><br>Neue Adressen mit @example.invalid benötigen keine E-Mail-Bestätigung. Es entstehen keine echten Matchkosten.</p>';
function loginPage(role){return narrow(`<h1>Anmelden für ${role==='talent'?'Kandidaten':'Recruiter'}</h1><p class="intro">Melde Dich mit Deiner E-Mail-Adresse und Deinem Passwort an.</p><form data-form="login" data-role="${role}" class="box">${field('email','E-Mail',{type:'email',placeholder:'Deine E-Mail-Adresse'})}${testEnvironmentNote}<div class="field"><label for="login-password">Passwort *</label><div class="password-entry"><input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Dein Passwort" required>${actionButton('toggle-password','Anzeigen','secondary small','aria-controls="login-password"')}</div></div><div class="form-error"></div><button class="btn full">Anmelden →</button></form><p class="hint" style="text-align:center">Noch kein Konto? <a href="#/${role}/onboarding">Jetzt registrieren</a></p><a class="back-link" href="#/">← Zur Startseite</a>`);}
function accountPage(role){
 return narrow(`${steps(1,role==='talent'?2:3,role==='talent'?'Profil anlegen':'Konto anlegen')}<h1>${role==='talent'?'Profil anlegen':'Konto für Recruiter'}</h1><p class="intro">${role==='talent'?'Zunächst benötigen wir ein paar Angaben zu Dir. Danach richtest Du Deinen Job-Filter ein und kannst direkt mit dem Swipen beginnen.':'Lege zunächst Dein persönliches Konto für Recruiter an. Diese Angaben dienen der Benutzerverwaltung und der Kommunikation innerhalb Deines Unternehmenskontos.'}</p><form data-form="account" data-role="${role}" class="box" autocomplete="off">${field('first_name','Vorname',{placeholder:role==='talent'?'Dein Vorname':'Max'})}${field('last_name','Nachname',{placeholder:role==='talent'?'Dein Nachname':'Mustermann'})}${role==='recruiter'?field('phone','Telefon',{type:'tel',placeholder:'+49 123 456789'})+'<h3>Anmeldedaten</h3>':''}${field('email','E-Mail',{type:'email',placeholder:role==='talent'?'deine@email.de':'max@muster-gmbh.de'})}${testEnvironmentNote}${field('password','Passwort',{type:'password',placeholder:'Dein Passwort'})}<ul class="password-rules" id="password-rules">${['Mindestens 8 Zeichen','Mindestens 1 Großbuchstabe','Mindestens 1 Kleinbuchstabe','Mindestens 1 Zahl','Mindestens 1 Sonderzeichen'].map(x=>`<li>${x}</li>`).join('')}</ul><div class="spacer"></div>${field('repeat','Passwort wiederholen',{type:'password',placeholder:'Passwort wiederholen'})}<p class="hint">Mit dem Speichern stimmst Du unseren <a class="text-link" href="./legal/">Nutzungsbedingungen</a> zu. <a href="./legal/">Datenschutz</a> · <a href="./legal/">Impressum</a></p><div class="form-error"></div><div class="spacer"></div><button class="btn orange full">Weiter →</button></form><a class="back-link" href="#/${role}/login">Bereits registriert? Anmelden</a>`);
}
function candidateForm(onboarding=false){const c=state.me?.candidate;const p=state.draft.talentPrefs||c?.preferences||{};state.skills=structuredClone(state.draft.talentSkills||c?.skills||[]);const form=`${onboarding?steps(2,2,'Job-Filter einrichten'):''}<h1>Dein Job-Filter</h1><p class="intro">Alle Angaben in Deinem Job-Filter beeinflussen Deine persönlichen Treffer.</p><form data-form="candidate" data-count-form id="matching-form" class="box">${prefsForm(p)}<div class="form-error"></div><button class="btn orange full">${onboarding?'Job-Filter speichern & Swipen starten':'Job-Filter speichern'} →</button></form>`;return shell('talent','filter',form,'talent');}
function companyForm(onboarding=false,id='',profileId=''){const me=state.me;if(onboarding&&!id)id=state.draft.company?.id||me?.companies?.[0]?.id||'';if(onboarding&&!profileId)profileId=state.draft.companyProfile?.id||'';const company=me?.companies?.find(c=>c.id===id)||{};const profile=(profileId==='new'?null:me?.company_profiles?.find(p=>p.company_id===company.id&&(!profileId||p.id===profileId)))||{};state.draft.company=company;state.draft.companyProfile=profile;const stored=state.draft.companyFields;const f=stored&&stored.company_id===(company.id||'new')?stored:{};const props=profile.properties||{};const value=(key,fallback='')=>f[key]??fallback;const content=`${onboarding?steps(2,3,'Unternehmenskonto & Unternehmensprofil anlegen'):''}<h1>${onboarding?'Unternehmensprofil':'Unternehmen verwalten'}</h1><p class="intro">Lege Dein Unternehmenskonto und das öffentliche Profil für Deine Jobs an.</p><form data-form="company" data-count-form class="box"><h2>Unternehmenskonto</h2><p class="hint">Diese Angaben dienen der Abrechnung, Benutzerverwaltung und Administration.</p>${field('legal_name','Firmenname',{value:value('legal_name',company.legal_name||''),placeholder:'Muster GmbH'})}${field('address','Straße & Hausnummer',{value:value('address',company.address||'')})}<div class="cols">${field('postcode','PLZ',{value:value('postcode',company.postcode||'')})}${field('city','Stadt',{value:value('city',company.city||'')})}</div><div class="divider"></div><h2>Unternehmensprofil</h2><p class="hint">Diese Angaben sehen Kandidaten bei Deinen Jobs.</p>${company.id?`<label class="field"><span>Öffentliches Unternehmensprofil</span><select tabindex="-1" id="company-profile-select">${me.company_profiles.filter(p=>p.company_id===company.id).map(p=>`<option value="${p.id}" ${p.id===profile.id?'selected':''}>${E(p.public_name)}</option>`).join('')}<option value="new" ${profileId==='new'?'selected':''}>+ Neues Unternehmensprofil</option></select></label>`:''}${field('public_name','Firmenname für Kandidaten',{value:value('public_name',profile.public_name||'')})}${industryField(value('industry',profile.industry||''))}${field('language','Arbeitssprache',{value:optionLabel(value('language',profile.language||'Deutsch'))})}${['office','size','type','culture'].map(k=>pills(k,choices[k],value(k,props[k]||''),{single:true,required:true})).join('')}<div class="form-error"></div><button class="btn orange full">${onboarding?'Weiter zum Job':'Unternehmensprofil speichern'} →</button></form>`;return shell('recruiter','',content,'recruiter');}
function editorStatus(value){return `<div class="editor-status"><label for="job-status-bottom">Status</label><select tabindex="-1" id="job-status-bottom" name="status">${[['published','Veröffentlicht'],['draft','Entwurf'],['closed','Pausiert']].map(([v,l])=>`<option value="${v}" ${value===v?'selected':''}>${l}</option>`).join('')}</select></div>`;}
function resizeJobDescription(input=document.querySelector('[data-form="job"] textarea[name="description"]')){
 if(!input)return;
 input.style.height='auto';
 input.style.height=(input.scrollHeight+input.offsetHeight-input.clientHeight)+'px';
}
function requireMinimumSkills(){if(!hasMinimumSkills(state.skills))throw Error('Bitte wähle mindestens 5 und höchstens 10 Skills aus.');}
function jobForm(job=null,onboarding=false){const key=job?.id||(onboarding?'new':'new-job');job=state.draft.jobEdits?.[key]||job;state.draft.job=job||{};state.skills=structuredClone(job?.skills||[]);const cps=state.me.company_profiles;const selected=job?.company_profile_id||state.draft.companyProfile?.id||cps[0]?.id;const cp=cps.find(c=>c.id===selected)||cps[0];const company=state.me.companies.find(c=>c.id===cp?.company_id)||{};const p=job?.preferences||company;const content=`${onboarding?steps(3,3,'Job anlegen'):''}<h1>${job?.id?'Job bearbeiten':'Neuer Job'}</h1><p class="intro">Lege die Anforderungen für Deinen Job fest. Der Zähler zeigt Dir, wie viele Kandidaten dazu passen.</p><form data-form="job" data-workplace-company="${E(company.id)}" data-draft-key="${E(key)}" data-count-form id="matching-form" class="box"><label class="field"><span>Unternehmensprofil *</span><select tabindex="-1" name="company_profile_id" required>${cps.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${E(c.public_name)}</option>`).join('')}</select></label><div class="job-count">${availabilityCounter('recruiter')}</div>${field('title','Jobtitel',{value:job?.title||'',placeholder:'z. B. Softwareentwickler/in'})}<label class="field"><span>Kurzbeschreibung *</span><textarea name="description" maxlength="240" required placeholder="Beschreibe den Job in maximal 240 Zeichen.">${E(job?.description||'')}</textarea><small id="description-count">${(job?.description||'').length}/240</small></label>${prefsForm(p,true)}${onboarding?'<input type="hidden" name="status" value="published">':editorStatus(job?.status||'published')}<div class="form-error"></div><div class="form-actions">${actionButton('preview-job','Vorschau','secondary')}${actionButton('save-draft','Als Entwurf speichern','secondary')}<button type="submit" class="btn orange">${job?.id?'Änderungen speichern →':'Veröffentlichen'}</button></div></form><a class="form-back" href="${onboarding?'#/recruiter/onboarding/company':'#/recruiter/jobs'}">← ${onboarding?'Zurück zum Unternehmensprofil':'Zur Jobübersicht'}</a>`;return shell('recruiter','jobs',content);}
const addressFields=['address','postcode','city'];
const addressKey=place=>JSON.stringify(addressFields.map(key=>String(place[key]??'').trim().toLowerCase()));
const jobAddress=form=>Object.fromEntries(addressFields.map(key=>[key,form.elements[key].value.trim()]));
const workplaceCompany=id=>state.me.companies.find(company=>company.id===id);

function paintWorkplacePicker(form){
 const picker=form.querySelector('#workplace-picker');
 const company=workplaceCompany(form.dataset.workplaceCompany);
 if(!company){picker.replaceChildren();return;}
 const primary={...company,name:'Unternehmensadresse'};
 const legacy=state.me.company_profiles.filter(profile=>profile.company_id===company.id).map(profile=>({
  ...profile.properties,name:`Standort ${profile.public_name}`
 }));
 const choices=[primary];
 const addresses=new Set([addressKey(primary)]);
 for(const place of [...(form.workplaces||[]),...legacy]){
  const key=addressKey(place);
  if(!addressFields.every(field=>place[field])||addresses.has(key))continue;
  addresses.add(key);
  choices.push(place);
 }
 form.workplaceChoices=choices;
 picker.innerHTML=choices.length<2?'':`<label class="field"><span>Gespeicherten Arbeitsort auswählen</span><select tabindex="-1" name="workplace"><option value="" disabled>Individuelle Adresse</option>${choices.map((place,index)=>`<option value="${index}">${E(place.name)} · ${E(place.city)}</option>`).join('')}</select></label>`;
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

async function loadWorkplaces(form){
 const companyId=form.dataset.workplaceCompany;
 const load=Symbol();
 form.workplaceLoad=load;
 form.workplaces=[];
 paintWorkplacePicker(form);
 if(!companyId)return;
 try{
  const places=await companyWorkplaces(companyId);
  if(!form.isConnected||form.workplaceLoad!==load)return;
  form.workplaces=places;
  paintWorkplacePicker(form);
 }catch{
  if(form.isConnected&&form.workplaceLoad===load)toast('Gespeicherte Arbeitsorte konnten nicht geladen werden.',true);
 }
}

function changeWorkplace(control){
 const form=control.form;
 if(control.name==='workplace'){
  const place=form.workplaceChoices[Number(control.value)];
  if(control.value!==''&&place)fillJobAddress(form,place);
 }else{
  const profile=state.me.company_profiles.find(profile=>profile.id===control.value);
  const company=workplaceCompany(profile?.company_id);
  if(company&&company.id!==form.dataset.workplaceCompany){
   form.dataset.workplaceCompany=company.id;
   fillJobAddress(form,company);
   loadWorkplaces(form);
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

function showWorkplaceForm(editor){
 if(!editor)return;
 const company=workplaceCompany(editor.dataset.workplaceCompany);
 if(!company)return;
 if(!addressFields.every(key=>editor.elements[key].reportValidity()))return;
 const place=jobAddress(editor);
 if(!addressFields.every(key=>place[key]))throw Error('Bitte gib zuerst Straße, Hausnummer, PLZ und Stadt ein.');
 if(editor.workplaceChoices?.some(item=>addressKey(item)===addressKey(place)))throw Error('Diese Adresse ist bereits als Arbeitsort hinterlegt.');
 showModal('Arbeitsort speichern',`<form data-form="workplace">
  <p class="hint">${E(`${place.address}, ${place.postcode} ${place.city}`)}</p>
  <input type="hidden" name="company_id" value="${E(company.id)}">
  ${addressFields.map(key=>`<input type="hidden" name="${key}" value="${E(place[key])}">`).join('')}
  ${field('name','Name des Arbeitsorts',{placeholder:'z. B. Büro Berlin',maxlength:80})}
  <div class="form-error" role="alert"></div>
  <div class="form-actions">${actionButton('close-modal','Abbrechen','secondary')}<button type="submit" class="btn orange">Arbeitsort speichern</button></div>
 </form>`);
}

function newJobForm(){
 const entry=history.state?.newJobEntry;
 if(!entry||entry!==state.draft.newJobEntry){
  state.draft.newJobEntry=crypto.randomUUID();
  history.replaceState({...history.state,newJobEntry:state.draft.newJobEntry},'');
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
async function dashboard(role){if(role==='talent'&&!state.me.candidate){go('/talent/onboarding/filter');return '';}if(role==='recruiter'&&!state.me.company_profiles.length){go('/recruiter/onboarding/company');return '';}const [stats,feed]=await Promise.all([api('stats'),role==='talent'&&state.me.candidate?api('feed'):Promise.resolve(null)]);const name=state.me.profile.first_name;return shell(role,'',`<h1>Hallo ${E(name)}!</h1><p class="intro">${role==='talent'?'Hier findest Du Deine Jobs, Bewerbungen und Matches.':'Hier findest Du Deine Jobs, Bewerbungen und Matches.'}</p><div class="stats" aria-label="Deine Übersicht">${role==='recruiter'?stat(stats.jobs,'Aktive Jobs','cards','#/recruiter/jobs')+stat(stats.pending,'Neue Bewerbungen','send','#/recruiter/applications')+stat(stats.matches,'Matches','match','#/recruiter/matches')+stat(money(stats.test_cents/100),'Kosten','expense','#/recruiter/costs'):stat(feed?.items.length??0,'Neue Jobs','cards','#/talent/jobs')+stat(stats.pending,'Offene Bewerbungen','send','#/talent/applications')+stat(stats.matches,'Matches','match','#/talent/matches')+stat(stats.saved,'Gespeicherte Jobs','bookmark','#/talent/saved')}</div><div class="cards"><div class="box" style="margin:0"><h2>${role==='talent'?'Dein nächster Job':'Deine Jobs'}</h2><p class="intro">${role==='talent'?'Entdecke die Jobs, die zu Deinen Skills und Wünschen passen.':'Lege Jobs an und stelle die entscheidenden Anforderungen zusammen.'}</p><div class="dashboard-actions"><a class="btn" href="#/${role}/jobs">${role==='talent'?'Jetzt entdecken':'Jobs verwalten →'}</a>${role==='recruiter'?'<a class="btn secondary" href="#/recruiter/job/new">+ neuer Job</a>':''}</div></div><div class="box" style="margin:0"><h2>${role==='talent'?'Dein Job-Filter':'Neue Bewerbungen'}</h2><p class="intro">${role==='talent'?'Passe Deine Skills und Präferenzen an und sieh, wie sich Deine Treffer verändern.':'Prüfe die fachliche Passung und entscheide, mit wem Du in Kontakt treten möchtest.'}</p><a class="btn secondary" href="#/${role}/${role==='talent'?'filter':'applications'}">${role==='talent'?'Filter bearbeiten':'Bewerbungen prüfen'} →</a></div></div>${role==='recruiter'?'<p class="settings-note">In der Testumgebung simulieren wir 15 € je Match.</p>':''}`);}
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
 return shell('recruiter','',`<h1>Kosten</h1><p class="intro">Hier siehst Du die Kosten Deiner Matches im Zeitverlauf.</p><div class="toolbar"><label class="field"><span>Unternehmensprofil</span><select tabindex="-1" id="cost-profile-filter"><option value="">Alle Unternehmensprofile</option>${profiles.map(profile=>`<option value="${E(profile.id)}">${E(profile.public_name)}</option>`).join('')}</select></label><label class="field"><span>Job</span><select tabindex="-1" id="cost-job-filter">${costJobOptions(costs.jobs)}</select></label></div><section class="box cost-summary" id="cost-summary" aria-live="polite">${costHistory(costs,costs.jobs)}</section><p class="settings-note">Die Kosten werden in der Testumgebung simuliert. Es erfolgen keine echten Zahlungen.</p><a class="form-back" href="#/recruiter/dashboard">← Zum Dashboard</a>`);
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
}
function jobCompany(name,industry){
  return `<div class="company">${E(name)}</div>${industry?`<div class="meta">${E(industry)}</div>`:''}`;
}
function jobCard(j){
 const statuses=[['published','Veröffentlicht'],['draft','Entwurf'],['closed','Pausiert']];
 const options=statuses.map(([value,label])=>`<option value="${value}" ${j.status===value?'selected':''}>${label}</option>`).join('');
 const warning=hasMinimumSkills(j.skills)?'':'<p class="minimum-warning">Vor der Veröffentlichung bitte mindestens 5 Skills auswählen.</p>';
 return `<article class="job-card"><label class="job-state-row"><span>Status</span><select tabindex="-1" data-job-status="${j.id}" aria-label="Status von ${E(j.title)}">${options}</select></label><div class="match-heading"><div><h3>${E(j.title)}</h3><div class="company">${E(j.company)}</div><div class="meta">${E(j.city||j.preferences?.city)}${j.industry?' · '+E(j.industry):''}</div></div></div>${warning}<p class="job-status">${E(statuses.find(([value])=>value===j.status)?.[1])} · ${formatCount(j.candidate_count)} Treffer</p>${selectedSkillList(j.skills??[])}<p class="match-description">${E(j.description)}</p><div class="card-footer"><small>Bearbeitet am ${date(j.updated_at)}</small><div class="row"><a href="#/recruiter/job/${j.id}" class="btn secondary small">Bearbeiten</a>${actionButton('own-preview','Vorschau','secondary small',`data-id="${j.id}"`)}</div></div></article>`;
}
async function jobsPage(role){if(role==='talent'){if(!hasMinimumSkills(state.me.candidate?.skills)){toast('Bitte ergänze Deinen Job-Filter auf mindestens 5 Skills.',true);go('/talent/filter');return '';}const f=await api('feed');state.feed=f.items;return shell(role,'jobs',`<h1 class="sr-only">Deine Jobs</h1><span id="stack-count" class="sr-only" aria-live="polite">${state.feed.length} Jobs</span><div id="swipe-stack" class="swipe-container">${swipeCard()}</div>`);}state.jobs=await api('jobs');return shell(role,'jobs',`<div class="row between"><div><h1>Deine Jobs</h1><p class="intro">${state.jobs.filter(j=>j.status==='published').length} Jobs veröffentlicht</p></div><a class="btn orange" href="#/recruiter/job/new">+ Neuer Job</a></div><div class="toolbar"><label class="field"><span>Unternehmensprofil</span><select tabindex="-1" id="job-company-filter"><option value="">Alle Unternehmensprofile</option>${state.me.company_profiles.map(profile=>`<option value="${profile.id}">${E(profile.public_name)}</option>`).join('')}</select></label><label class="field"><span>Status</span><select tabindex="-1" id="job-status-filter"><option value="">Alle</option><option value="published">Veröffentlicht</option><option value="draft">Entwurf</option><option value="closed">Pausiert</option></select></label></div><div class="cards" id="own-jobs">${state.jobs.length?state.jobs.map(j=>jobCard(j)).join(''):empty('Noch keine Jobs','Lege Deinen ersten Job an.')}</div>`);}
async function attachLocation(job){
 if(job.location)return job;
 state.mapLocations??=fetch('./postcode-centroids.json').then(response=>response.json()).catch(()=>null);
 const locations=await state.mapLocations;
 if(!locations)state.mapLocations=null;
 const point=locations?.[job.postcode||job.preferences?.postcode];
 return point?{...job,location:{lat:point[0],lon:point[1]}}:job;
}
function locationBlock(j){const location=j.location;let map='';if(location?.lat&&location?.lon)map=`<iframe title="Arbeitsort ${E(j.city)}" src="https://www.openstreetmap.org/export/embed.html?bbox=${location.lon-.015},${location.lat-.015},${location.lon+.015},${location.lat+.015}&amp;layer=mapnik&amp;marker=${location.lat},${location.lon}" loading="lazy" referrerpolicy="no-referrer"></iframe>`;return `<section class="location-section"><div class="location-heading"><h3>Arbeitsort</h3><address>${E([j.address,j.postcode,j.city].filter(Boolean).join(', '))}</address></div>${map?`<div class="location-map">${map}</div>`:''}</section>`;}
function swipeCard(){const j=state.feed[0];if(!j)return empty('Keine weiteren passenden Jobs','Mit Deinem aktuellen Filter gibt es keine weiteren Jobs. Du kannst Deine Auswahl anpassen oder später wiederkommen.','<a class="btn secondary" href="#/talent/filter">Job-Filter bearbeiten</a>');return `<article class="swipe-card" data-job="${j.id}" aria-label="${E(j.title)}"><div class="swipe-feedback" aria-hidden="true"></div><div class="candidate-fixed-header swipe-grab" title="Nach links ablehnen, nach rechts bewerben, nach unten merken"><div class="match-heading"><div><h2>${E(j.title)}</h2><div class="swipe-company">${[j.company,j.industry].filter(Boolean).map(E).join(' · ')}</div></div>${scorePill(j.match.score)}</div>${matchOverview(j.match)}</div><div class="card-scroll">${candidateJobContent(j,state.me.candidate?.skills,true)}</div><div class="swipe-actions"><button type="button" class="skip" data-action="skip" aria-label="Job ablehnen" title="Ablehnen">${icon('close',true)}</button><button type="button" class="bookmark" data-action="bookmark" aria-label="Job merken" title="Job merken">${icon('bookmark')}</button><button type="button" class="apply" data-action="apply" aria-label="Auf diesen Job bewerben" title="Bewerben">${icon('send')}</button></div></article>`;}
const matchExplanation=()=>`<details class="match-explanation"><summary>Wie wird der Match-Score berechnet?</summary><p>Der Match-Score zeigt beiden Seiten, wie gut die Skills die Anforderungen des Jobs erfüllen. Top Skills zählen beim Matching stärker. Ein ausgefüllter Stern zeigt, dass beide Seiten den Skill markiert haben. Eine Kontur zeigt eine einseitige Markierung. Zusätzliche Skills senken den Score nicht.</p></details>`;
function candidateJobContent(job,candidateSkills,swipe=false){
 return `${skillList(job,{candidateSkills,swipe})}<h3 class="job-description-title">Kurzbeschreibung</h3><p class="match-description">${E(job.description)}</p><div class="candidate-job-location">${locationBlock(job)}</div>`;
}
function candidateListCard(job,application=false){
 const candidateSkills=application?job.candidate_skills:state.me.candidate?.skills;
 const status=application?`<div class="result-dates"><span>Beworben am ${date(job.applied_at)}</span><span class="status-pill ${job.state}">${E(statuses[job.state])}</span></div>`:'';
 const id=`data-id="${E(job.id)}"`;
 const canApply=!application&&job.status==='published'&&meetsMatchPolicy(job.match,job.skills,candidateSkills);
 const actions=application?'':`<div class="card-footer">${canApply?actionButton('apply-saved','Bewerben','small',id):''}${actionButton('unsave','Entfernen','secondary small',id)}</div>`;
 return `<article class="job-card candidate-list-card"><div class="match-heading"><div><h3>${E(job.title)}</h3>${jobCompany(job.company,job.industry)}</div>${scorePill(job.match.score)}</div>${matchOverview(job.match)}${status}<details class="job-list-details" data-job-id="${E(job.id)}"><summary>Skills und Jobdetails</summary>${candidateJobContent(job,candidateSkills)}${matchExplanation()}${actions}</details></article>`;
}
async function loadCandidateJobMap(container,job){
 const target=container?.querySelector('.candidate-job-location');
 if(!target||!job?.postcode||target.querySelector('iframe'))return;
 const located=await attachLocation(job);
 if(target.isConnected&&located.location&&!target.querySelector('iframe'))target.innerHTML=locationBlock(located);
}
function loadSwipeMap(){
 loadCandidateJobMap(document.querySelector('#swipe-stack'),state.feed[0]);
}
document.addEventListener('toggle',event=>{
 const details=event.target;
 if(!details.matches('.job-list-details')||!details.open)return;
 const jobs=routeKey==='/talent/saved'?state.saved:state.applications;
 loadCandidateJobMap(details,jobs.find(job=>job.id===details.dataset.jobId));
},true);
async function savedPage(){state.saved=await api('saved');return shell('talent','saved',`<h1>Gespeicherte Jobs</h1><p class="intro">Diese Jobs hast Du Dir für später gespeichert.</p><div class="cards">${state.saved.length?state.saved.map(j=>candidateListCard(j)).join(''):empty('Noch keine gespeicherten Jobs','Wische einen Job nach unten, um ihn für später zu speichern.')}</div>`);}
const statuses={pending:'Offen',matched:'Match',rejected:'Abgelehnt',withdrawn:'Zurückgezogen',closed:'Match aufgelöst'};
function applicationCard(a,role){const title=role==='talent'?a.title:a.candidate_name;return `<article class="application-card">${role==='recruiter'?`<header class="application-job-context"><small>Bewerbung auf</small><h3>${E(a.title)}</h3><div class="meta">${E(a.company)}${a.city?' · Arbeitsort: '+E(a.city):''}</div></header>`:''}<div class="application-main"><div class="match-heading"><div><h3><button type="button" class="result-title" data-action="application-detail" data-id="${a.application_id}">${E(title)}</button></h3><div class="meta">${E(role==='talent'?a.company:a.candidate_city?'Suchort: '+a.candidate_city:'')}</div></div>${scorePill(a.match.score)}</div>${matchOverview(a.match)}${skillList(a,{candidateSkills:a.candidate_skills||[],perspective:role})}<div class="result-dates"><span>Beworben am ${date(a.applied_at)}</span><span class="status-pill ${a.state}">${E(statuses[a.state])}</span></div>${a.state==='matched'?actionButton('full-profile',role==='recruiter'?'Match-Profil anzeigen':'Kontakt zum Recruiter anzeigen','secondary match-profile-button',`data-id="${a.application_id}"`):''}</div>${role==='recruiter'&&a.state==='pending'?`<div class="application-actions">${actionButton('confirm-reject','Ablehnen','danger',`data-id="${a.application_id}"`)}${meetsMatchPolicy(a.match,a.skills,a.candidate_skills)?actionButton('confirm-match','Annehmen · 15 €','',`data-id="${a.application_id}"`):'<span class="hint">Du kannst die Bewerbung ab 50 % Match-Score annehmen, wenn beide Seiten mindestens 5 Skills haben.</span>'}</div>`:''}</article>`;}
function applicationSubset(role,matches=false){const id=document.querySelector('#application-job-filter')?.value||'';const history=document.querySelector('#application-history')?.checked;return state.applications.filter(a=>(matches?a.state==='matched':role==='talent'?a.state!=='matched':history?a.state!=='matched':a.state==='pending')&&(!id||a.id===id)).sort((a,b)=>b.match.score-a.match.score||String(a.applied_at).localeCompare(String(b.applied_at)));}
function paintApplications(role,matches=false){const list=applicationSubset(role,matches);return list.length?list.map(a=>role==='talent'&&!matches?candidateListCard(a,true):applicationCard(a,role)).join(''):empty(matches?'Noch keine Matches':'Keine Bewerbungen in dieser Auswahl',matches?(role==='talent'?'Sobald ein Recruiter Deine Bewerbung annimmt, erscheint das Match hier.':'Nimm eine Bewerbung an, um ein Match zu erhalten.'):'Passe die Auswahl an oder entdecke passende Jobs.');}
async function applicationsPage(role,matches=false){state.applications=await api('applications');const subset=state.applications.filter(a=>matches?a.state==='matched':a.state!=='matched');return shell(role,matches?'matches':'applications',`<h1 class="page-title">${icon(matches?'match':'send')} ${matches?'Matches':role==='talent'?'Meine Bewerbungen':'Bewerbungen'}</h1><p class="intro">${matches?(role==='talent'?'Hier findest Du Deine Matches und die Kontaktdaten der Recruiter.':'Hier findest Du die Match-Profile und Kontaktdaten der Bewerber, deren Bewerbung Du angenommen hast.'):role==='talent'?'Bis zum Match sieht der Recruiter Deinen Vornamen, den ersten Buchstaben Deines Nachnamens, Deine Skills und Deinen Suchort. Er sieht auch den Match-Score. Nimmt er Deine Bewerbung an, entsteht ein Match. Dann sieht er Dein ganzes Match-Profil und Deine Kontaktdaten.':'Erst wenn Du eine Bewerbung annimmst, entsteht ein Match. Die 15 € je Match werden in der Testumgebung simuliert.'}</p>${role==='recruiter'&&!matches?`<div class="toolbar"><label class="field"><span>Nach Job filtern</span><select tabindex="-1" id="application-job-filter"><option value="">Alle Jobs</option>${[...new Map(subset.map(a=>[a.id,a.title]))].map(([id,title])=>`<option value="${id}">${E(title)}</option>`).join('')}</select></label></div><label class="history-toggle"><input type="checkbox" id="application-history">Bearbeitete Bewerbungen einblenden</label>`:''}<div class="cards" id="application-list">${paintApplications(role,matches)}</div>`);}
function profilePage(role){const p=state.me.profile;return shell(role,'',`<h1>Mein Profil</h1><p class="intro">${role==='recruiter'?'Hier verwaltest Du Dein Konto, Deine Unternehmenskonten und die Unternehmensprofile, die Kandidaten sehen.':'Bei einem Match sieht der Recruiter Dein gesamtes Match-Profil und Deine Kontaktdaten, so könnt Ihr Euch direkt austauschen.'}</p><div class="profile-sections"><form class="box" data-form="profile"><div class="row between"><h2>Konto</h2>${role==='talent'?actionButton('edit-profile','Bearbeiten','secondary small'):!isRecruiterDemo(p.email)?actionButton('open-password','Passwort ändern','secondary small'):''}</div><fieldset class="profile-fields" ${role==='talent'?'disabled':''}>${field('first_name','Vorname',{value:p.first_name})}${field('last_name','Nachname',{value:p.last_name})}${field('email','E-Mail',{type:'email',value:p.email,readonly:true})}${field('phone','Telefon',{type:'tel',value:p.phone,required:role==='recruiter',digitsOnly:role==='talent'})}${role==='talent'?`<h2>Match-Profil</h2><label class="field"><span>Über mich (optional)</span><textarea name="summary" maxlength="1500">${E(p.extras?.summary||'')}</textarea></label>${experienceEditor(p.extras?.experiences||[])}${field('links','Portfolio / Profil-Link',{value:p.extras?.links||'',required:false,placeholder:'https://…'})}`:''}</fieldset><div class="form-error"></div><button type="submit" class="btn" ${role==='talent'?'hidden data-profile-edit-only':''}>Änderungen speichern</button></form><div>${role==='talent'?`<div class="box profile-skills"><h2>Deine Skills</h2>${selectedSkillList(state.me.candidate?.skills||[])}<a class="profile-skills-link" href="#/talent/filter">Skills im Job-Filter bearbeiten →</a></div><div class="box"><h2>CV, Zeugnisse & Nachweise</h2><p class="hint">Dein CV wird bei einem Match mit dem Recruiter geteilt.</p><p class="hint">Deine Zeugnisse und Nachweise werden bei einem Match mit dem Recruiter geteilt.</p><label class="field"><span>Dokument hinzufügen · max. 5 MB</span><input id="document-upload" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"></label><div id="document-list">${(state.me.documents||[]).map(d=>`<div class="document"><span>${E(d.name)}</span><div class="row">${actionButton('open-document','Öffnen','secondary small',`data-path="${E(d.path)}"`)}${actionButton('delete-document','×','danger small',`data-path="${E(d.path)}" aria-label="Dokument entfernen"`)}</div></div>`).join('')||'<p class="hint">Noch keine Dokumente hinterlegt.</p>'}</div></div>`:`<div class="box"><div class="row between"><h2>Unternehmensprofile</h2><a class="btn secondary small" href="#/recruiter/company/new">+ Neu</a></div>${state.me.companies.map(c=>`<div class="document"><div><strong>${E(c.legal_name)}</strong><p class="hint">${E(c.address)}<br>${E(c.postcode)} ${E(c.city)}</p>${state.me.company_profiles.filter(x=>x.company_id===c.id).map(x=>`<span class="badge">${E(x.public_name)}</span>`).join(' ')}</div><a class="btn secondary small" href="#/recruiter/company/${c.id}">Bearbeiten</a></div>`).join('')||'<p class="hint">Noch kein Unternehmenskonto angelegt.</p>'}</div>`}<div class="box">${actionButton('logout','Abmelden','secondary full')}<p class="hint">Zum Testen der anderen Rolle bitte zuerst abmelden.</p></div></div></div>`);}
function showModal(title,body,actions=''){modal.innerHTML=`<div class="modal-body"><div class="modal-head"><h2>${E(title)}</h2><button type="button" class="iconbtn" data-action="close-modal" aria-label="Schließen">×</button></div>${body}${actions?`<div class="modal-actions">${actions}</div>`:''}</div>`;if(!modal.open)modal.showModal();}
function showPasswordForm(){
 showModal('Passwort ändern',`<form data-form="change-password">
  <label class="field"><span>Aktuelles Passwort *</span><input type="password" name="current_password" autocomplete="current-password" required autofocus></label>
  ${field('new_password','Neues Passwort',{type:'password'})}
  <p class="hint">Mindestens 8 Zeichen mit Groß- und Kleinbuchstaben, einer Zahl und einem Sonderzeichen.</p>
  ${field('repeat_password','Neues Passwort wiederholen',{type:'password'})}
  <div class="form-error" role="alert"></div>
  <div class="form-actions">${actionButton('close-modal','Abbrechen','secondary')}<button type="submit" class="btn orange">Passwort speichern</button></div>
 </form>`);
}
async function showRecruiterJobPreview(job,closeLabel){
 const version=pageVersion;
 const located=await attachLocation(job);
 if(version!==pageVersion)return;
 const sampleFactors=[1,0.7,0];
 const details=(located.skills||[]).map((skill,index)=>{
  const factor=sampleFactors[index]??1;
  return {...skill,factor,via:factor===1?skill.id:null,via_label:'Ähnlicher Beispiel-Skill',candidate_fire:factor===1&&Boolean(skill.fire)};
 });
 const match={score:86,details};
 const comparison=details.length?matchOverview(match)+skillList({...located,match}):'<p class="hint">Wähle Skills für Deinen Job, um den Vergleich in der Vorschau zu sehen.</p>';
 showModal('Jobvorschau',`<p class="hint">Beispiel aus Kandidatensicht. Die 86 % und die Skill-Zuordnung sind exemplarisch.</p><div class="match-heading"><div><h3>${E(located.title)}</h3>${jobCompany(located.company,located.industry)}</div>${scorePill(match.score)}</div>${comparison}<p class="match-description">${E(located.description)}</p>${locationBlock(located)}`,actionButton('close-modal',closeLabel,'secondary'));
}
function showDetails(j,application=null){const role=state.me.profile.role;const contact=application?.state==='matched'?`<section class="profile-contacts"><h3>${role==='talent'?'Dein Ansprechpartner':'Kontakt'}</h3><strong>${E(role==='talent'?application.recruiter_name:application.candidate_name)}</strong><p><a href="mailto:${E(application.contact_email)}">${E(application.contact_email)}</a>${application.contact_phone?`<br><a href="tel:${E(application.contact_phone)}">${E(application.contact_phone)}</a>`:''}</p></section>`:'';const candidate=application?.state==='matched'&&role==='recruiter'?candidateFullProfile(application):'';showModal(application&&role==='recruiter'?application.candidate_name:j.title,`<div class="match-heading"><div>${application?`<div class="company">${E(j.company)}</div><div class="meta">${E(j.city)} · ${E(optionLabel(j.properties?.office))}${j.language?' · '+E(optionLabel(j.language)):''}</div>`:jobCompany(j.company,j.industry)}</div>${scorePill(j.match.score)}</div>${matchOverview(j.match)}${application?`<p><span class="status-pill ${application.state}">${E(statuses[application.state])}</span></p>`:''}${contact}${candidate}${skillList(j,{candidateSkills:application?.candidate_skills||state.me.candidate?.skills||[],perspective:role})}<p class="match-description">${E(j.description)}</p>${role==='talent'?locationBlock(j):''}${matchExplanation()}`,`${role==='talent'&&application?.state==='matched'?actionButton('close-match','Match auflösen','danger',`data-id="${application.application_id}"`):''}${actionButton('close-modal','Zurück zur Übersicht','secondary')}`);}
function safeLink(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}}
function candidateFullProfile(a){const extras=a.candidate_extras||{};const link=safeLink(extras.links);return `<section class="details-section"><h3>Match-Profil</h3>${extras.summary?`<p>${E(extras.summary).replace(/\n/g,'<br>')}</p>`:'<p class="hint">Keine zusätzliche Beschreibung hinterlegt.</p>'}${link?`<p><a href="${E(link)}" target="_blank" rel="noopener">Portfolio / Profil-Link ↗</a></p>`:''}${(extras.experiences||[]).map(x=>`<article class="profile-experience"><h3>${E(x.title)}</h3><strong>${E(x.company)}</strong><p>${E(month(x.start))} – ${x.current?'heute':E(month(x.end))}</p>${x.description?`<p>${E(x.description)}</p>`:''}</article>`).join('')}<h3>CV, Zeugnisse & Nachweise</h3>${(a.documents||[]).map(doc=>`<div class="document"><span>${E(doc.name)}</span>${actionButton('open-document','Öffnen','secondary small',`data-path="${E(doc.path)}"`)}</div>`).join('')||'<p class="hint">Keine Dokumente hinterlegt.</p>'}</section>`;}
function experienceEditor(items){return `<section id="experience-editor"><h2>Berufserfahrung (optional)</h2><div id="experience-rows">${items.map(item=>experienceRow(item)).join('')}</div><div class="form-actions" hidden data-profile-edit-only>${actionButton('experience-entry','Berufserfahrung hinzufügen','secondary small','id="experience-entry"')}</div></section>`;}
function experienceRow(x={},editable=false){return `<article class="experience-row"><h3>Berufserfahrung</h3>${field('experience_title','Position',{value:x.title||'',required:false})}${field('experience_company','Unternehmen',{value:x.company||'',required:false})}<div class="cols">${field('experience_start','Von (MM.JJJJ)',{type:'month',value:x.start||'',required:false})}${field('experience_end','Bis (MM.JJJJ)',{type:'month',value:x.end||'',required:false})}</div><label class="current-job"><input type="checkbox" name="experience_current" ${x.current?'checked':''}>Bis heute</label><label class="field"><span>Beschreibung (optional)</span><textarea name="experience_description" maxlength="1500">${E(x.description||'')}</textarea></label>${actionButton('remove-experience','Eintrag entfernen','danger small','data-profile-edit-only'+(editable?'':' hidden'))}</article>`;}
function editTalentProfile(button){
 const form=button.closest('form');
 form.querySelector('.profile-fields').disabled=false;
 form.elements.phone.value=form.elements.phone.value.replace(/[^0-9]/g,'');
 button.hidden=true;
 form.querySelectorAll('[data-profile-edit-only]').forEach(control=>control.hidden=false);
 for(const checked of form.querySelectorAll('[name="experience_current"]:checked')){
  checked.closest('.experience-row').querySelector('[name="experience_end"]').disabled=true;
 }
 form.elements.first_name.focus();
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
function saveDraft(){if(!state.me?.profile)return;const form=document.querySelector('form[data-count-form]');if(!form||form.dataset.committed)return;const f=Object.fromEntries(new FormData(form));if(form.dataset.form==='candidate'){state.draft.talentPrefs=readPrefs(form);state.draft.talentSkills=structuredClone(state.skills);}else if(form.dataset.form==='company'){state.draft.companyFields={...f,company_id:state.draft.company?.id||'new'};}else if(form.dataset.form==='job'){const key=form.dataset.draftKey;state.draft.jobEdits??={};state.draft.jobEdits[key]={...state.draft.job,title:f.title,description:f.description,company_profile_id:f.company_profile_id,status:f.status,preferences:readPrefs(form,true),skills:structuredClone(state.skills)};}persistDraft();}
function persistDraft(){if(state.me?.profile)sessionStorage.setItem('andtalents-draft-'+state.me.profile.user_id,JSON.stringify(state.draft));}
function restoreDraft(){const uid=state.me?.profile?.user_id;if(!uid||state.draftOwner===uid)return;state.draftOwner=uid;try{state.draft=JSON.parse(sessionStorage.getItem('andtalents-draft-'+uid)||'{}');}catch{state.draft={};}}
async function saveJobForm(form,status){const f=Object.fromEntries(new FormData(form));if((status||f.status)==='published')requireMinimumSkills();const result=await api('save_job',{id:state.draft.job?.id||null,title:f.title,description:f.description,company_profile_id:f.company_profile_id,status:status||f.status,preferences:readPrefs(form,true),skills:state.skills});form.dataset.committed="true";delete state.draft.jobEdits?.[form.dataset.draftKey];persistDraft();return result;}
async function legalPage(){saveDraft();location.href='./legal/';}
function noticeFlags(){const uid=state.me?.profile?.user_id;let local={};try{local=JSON.parse(localStorage.getItem('andtalents-swipe-notices-'+uid)||'{}');}catch{}return {...state.me?.profile?.extras?.swipe_notices,...local};}
function markSwipeNotice(phase){const uid=state.me?.profile?.user_id;if(!uid)return;const flags={...noticeFlags(),[phase]:true};localStorage.setItem('andtalents-swipe-notices-'+uid,JSON.stringify(flags));state.me.profile.extras={...state.me.profile.extras,swipe_notices:flags};api('mark_swipe_notice',{phase}).catch(()=>{});}
function maybeSwipeNotice(){
 if(state.me?.profile?.role!=='talent'||modal.open||routeKey.includes('onboarding'))return;
 const phase=noticePhase(routeKey,noticeFlags(),state.feed.length>0);
 if(!phase)return;
 showModal('Dein Match-Profil',`<p>Wenn Du Dich auf eine Stelle bewirbst und ein Recruiter Deine Bewerbung annimmt, sieht er automatisch Dein Match-Profil. Darin kannst Du Deine Berufserfahrung, eine kurze Beschreibung, Deinen CV und Zeugnisse ergänzen.</p><p>Diese Angaben bleiben freiwillig. Ohne freiwillige Angaben kommen bei einem Match nur Deine Kontaktdaten hinzu.</p>`,actionButton('notice-profile','Match-Profil ausfüllen','secondary')+actionButton('close-modal','Verstanden'));
 markSwipeNotice(phase);
}
async function render(){const version=++pageVersion;clearTimeout(countTimer);const route=(location.hash.slice(1)||'/').replace(/\/$/,'')||'/';if(route==='/talent/viewed'){location.replace('#/talent/dashboard');return;}routeKey=route;modal.close();app.innerHTML=header(route.split('/')[1]||state.me?.profile?.role)+ '<main class="loading" aria-live="polite">Wird geladen …</main>';try{
 const [,entryRole,entryPage,entryStep]=route.split('/');
 if(entryPage==='onboarding'&&!entryStep&&['talent','recruiter'].includes(entryRole)){if(getSession()){await logout();toast('Für die neue Registrierung bist Du jetzt abgemeldet.');}if(version!==pageVersion)return;state.me=null;state.draft={};state.draftOwner=null;state.skills=[];sessionStorage.removeItem('onboarding-role');app.innerHTML=accountPage(entryRole);return;}
 if(!getSession()){state.me=null;if(route==='/'||route==='/home')app.innerHTML=home();else{const [,role,page]=route.split('/');if(!['talent','recruiter'].includes(role)){go('/');return;}app.innerHTML=page==='login'?loginPage(role):guestPage(role,page);}return;}
 const me=await api('me');if(version!==pageVersion)return;state.me=me;restoreDraft();
 if(!state.me.profile){const role=sessionStorage.getItem('onboarding-role')||'talent';app.innerHTML=accountPage(role);return;}
 const role=state.me.profile.role;
 if(route==='/'){app.innerHTML=home();return;}
 const [,requested,page,id]=route.split('/');if(requested!==role){app.innerHTML=narrow(errorBlock('Bitte melde Dich ab, um die andere Rolle zu verwenden.')+actionButton('logout','Abmelden','secondary'));return;}
 let content;
 if(page==='onboarding')content=role==='talent'?candidateForm(true):companyForm(true);
 else if(page==='filter'&&role==='talent')content=candidateForm();
 else if(page==='company'&&role==='recruiter')content=companyForm(false,id==='new'?'':id);
 else if(page==='job'&&role==='recruiter'){
  if(!state.me.company_profiles.length){go('/recruiter/company/new');return;}
  if(id==='new')content=newJobForm();
  else {
   const jobs=await api('jobs');
   if(version!==pageVersion)return;
   const job=jobs.find(item=>item.id===id);
   if(!job)throw Error('Job nicht gefunden.');
   state.jobs=jobs;content=jobForm(job);
  }
 }
 else if(page==='onboarding-job'&&role==='recruiter')content=jobForm(null,true);
 else if(page==='jobs')content=await jobsPage(role);
 else if(page==='costs'&&role==='recruiter')content=await costsPage(version);
 else if(page==='applications'||page==='matches')content=await applicationsPage(role,page==='matches');
 else if(page==='saved'&&role==='talent')content=await savedPage();
 else if(page==='profile')content=profilePage(role);
 else if(page==='login'){go('/'+role+'/dashboard');return;}
 else content=await dashboard(role);
 if(version!==pageVersion)return;
 app.innerHTML=content;
 if(route==='/talent/jobs')loadSwipeMap();
 paintSkills();
 resizeJobDescription();
 const jobEditor=document.querySelector('[data-form="job"]');
 if(jobEditor)loadWorkplaces(jobEditor);
 const candidateEditor=document.querySelector('[data-form="candidate"]');
 if(candidateEditor&&candidateEditor.elements.postcode.value&&!candidateEditor.elements.city.value)lookupCandidatePostcode(candidateEditor);
 scheduleCount(0);
 maybeSwipeNotice();
 }catch(error){if(version===pageVersion)app.innerHTML=narrow(errorBlock(error)+actionButton('retry','Erneut versuchen','secondary')+'<a class="back-link" href="#/">Zur Startseite</a>');}}
async function withButton(button,fn){if(state.busy)return;state.busy=true;if(button)button.disabled=true;try{await fn();}catch(error){toast(error.message,true);}finally{state.busy=false;if(button?.isConnected)button.disabled=false;}}
document.addEventListener('submit',async event=>{const form=event.target;if(!form.dataset.form)return;event.preventDefault();const button=form.querySelector('button:not([type="button"])');await withButton(button,async()=>{try{const f=Object.fromEntries(new FormData(form));switch(form.dataset.form){
case 'login':await login(f.email,f.password);{const me=await api('me');if(me.profile&&me.profile.role!==form.dataset.role){await logout();throw Error('Dieses Konto gehört zur anderen Rolle. Melde Dich im passenden Bereich an.');}go('/'+form.dataset.role+'/dashboard');}break;
case 'account':{if(f.password!==f.repeat)throw Error('Die Passwörter stimmen nicht überein.');if(!validPassword(f.password))throw Error('Bitte alle fünf Passwortregeln erfüllen.');const role=form.dataset.role;sessionStorage.setItem('onboarding-role',role);if(!getSession())await signup(f.email,f.password);await api('save_account',{role,first_name:f.first_name,last_name:f.last_name,phone:f.phone||''});state.me=await api('me');go('/'+role+'/onboarding/'+(role==='talent'?'filter':'company'));break;}
case 'candidate':{requireMinimumSkills();const preferences=readPrefs(form);if(!preferences.travel.length)throw Error('Bitte mindestens eine Reiseoption auswählen.');await api('save_candidate',{preferences,skills:state.skills});form.dataset.committed="true";delete state.draft.talentPrefs;delete state.draft.talentSkills;persistDraft();toast('Job-Filter gespeichert.');go('/talent/jobs');break;}
case 'company':{const company=await api('save_company',{...f,id:state.draft.company?.id||null});const properties=companyProperties(f,state.draft.companyProfile?.properties);const cp=await api('save_company_profile',{id:state.draft.companyProfile?.id||null,company_id:company.id,public_name:f.public_name,industry:f.industry,language:f.language,properties});form.dataset.committed="true";delete state.draft.companyFields;state.draft.company={id:company.id};state.draft.companyProfile={id:cp.id};persistDraft();state.me=await api('me');toast('Unternehmensprofil gespeichert.');go(routeKey.includes('onboarding')?'/recruiter/onboarding-job':'/recruiter/profile');break;}
case 'job':{await saveJobForm(form);toast('Job gespeichert.');go('/recruiter/jobs');break;}
case 'workplace':{
 const {company_id,name,address,postcode,city}=f;
 const places=await companyWorkplaces(company_id,{name,address,postcode,city});
 const editor=document.querySelector('[data-form="job"]');
 if(editor?.dataset.workplaceCompany===company_id){
  editor.workplaceLoad=null;
  editor.workplaces=places;
  paintWorkplacePicker(editor);
 }
 if(form.isConnected&&modal.open)modal.close();
 toast('Arbeitsort gespeichert.');
 break;
}
case 'change-password':{
 const p=state.me?.profile;
 if(p?.role!=='recruiter'||isRecruiterDemo(p.email))break;
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
 const originalPhone=form.elements.phone.defaultValue;
 const phone=role==='talent'&&f.phone===originalPhone.replace(/[^0-9]/g,'')?originalPhone:f.phone;
 await api('save_account',{role,first_name:f.first_name,last_name:f.last_name,phone,extras:{...extras,summary:f.summary||'',links:f.links||'',...(role==='talent'?{experiences:readExperiences(form)}:{})}});
 toast('Profil gespeichert.');await render();break;
}
}}catch(error){errorToForm(form,error);}});});
modal.addEventListener('close',()=>{if(!modal.open)modal.querySelector('[data-form="change-password"]')?.reset();});
document.addEventListener('click',async event=>{const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action,id=button.dataset.id;if(action==='toggle-password'){const password=document.querySelector('#login-password');const showing=password.type==='password';password.type=showing?'text':'password';button.textContent=showing?'Verbergen':'Anzeigen';return;}if(action==='close-modal'){modal.close();return;}if(action==='notice-profile'){modal.close();go('/talent/profile');return;}if(action==='legal'){await legalPage(button.dataset.role);return;}if(action==='edit-profile'){editTalentProfile(button);return;}if(action==='experience-entry'){toggleExperienceEntry(button);return;}if(action==='remove-experience'){const form=button.closest('form');button.closest('.experience-row').remove();updateExperienceButton(form);return;}if(action==='save-draft'){await withButton(button,async()=>{await saveJobForm(document.querySelector('#matching-form'),'draft');toast('Entwurf gespeichert.');go('/recruiter/jobs');});return;}if(action==='retry'){render();return;}
if(['fire','remove-skill','add-skill','add-package'].includes(action)){if(action==='fire'){const skill=state.skills.find(x=>String(x.id)===id);if(!skill.fire&&state.skills.filter(s=>s.fire).length>=3){toast('Maximum von 3 Top Skills erreicht.',true);return;}skill.fire=!skill.fire;}else if(action==='remove-skill')state.skills=state.skills.filter(x=>String(x.id)!==id);else{const incoming=action==='add-package'?state.package||[]:[state.catalog.get(Number(id))];for(const skill of incoming){if(!skill||state.skills.some(x=>x.id===skill.id))continue;if(state.skills.length>=10){toast('Maximum von 10 Skills erreicht.',true);break;}state.skills.push({id:skill.id,label:skill.label,fire:false});}}paintSkills();saveDraft();scheduleCount();return;}
if(action==='occupation'){await withButton(button,async()=>{const origin=pageVersion;const items=await api('catalog',{kind:'package',id:Number(id)});if(origin!==pageVersion||!document.querySelector('#occupation-results'))return;state.package=items;items.forEach(s=>state.catalog.set(s.id,s));document.querySelector('#occupation-results').innerHTML=actionButton('add-package','Bis zu 10 Vorschläge übernehmen','secondary small')+items.map(skillResult).join('');});return;}
if(action==='confirm-reject'){showModal('Bewerbung ablehnen?','<p>Die Bewerbung erscheint im Verlauf mit dem Status „Abgelehnt“. Es entstehen keine Kosten.</p>',actionButton('close-modal','Abbrechen','secondary')+actionButton('reject','Ablehnen','danger',`data-id="${id}"`));return;}if(action==='confirm-match'){const a=state.applications.find(a=>a.application_id===id);showModal('Bewerbung annehmen?',`<p>Bitte bestätige, dass Du die Bewerbung von <strong>${E(a.candidate_name)}</strong> für <strong>${E(a.title)}</strong> annimmst.</p><p>Danach stellen wir Dir die hinterlegten Kontaktdaten und das Match-Profil von <strong>${E(a.candidate_name)}</strong> bereit.</p><div class="notice orange"><strong>15 € simulierte Matchkosten</strong><br>Testmodus: Es wird kein Geld berechnet.</div>`,actionButton('close-modal','Abbrechen','secondary')+actionButton('accept','Annehmen','',`data-id="${id}"`));return;}
if(action==='close-match'){if(state.me?.profile?.role!=='talent')return;showModal('Match auflösen?',`<p>Das Match wird aufgelöst. Damit endet der Zugriff auf die Kontaktdaten und das Match-Profil.</p><p class="hint">Es handelt sich ausschließlich um einen Test-Match.</p>`,actionButton('close-modal','Abbrechen','secondary')+actionButton('close-match-confirm','Auflösen','danger',`data-id="${id}"`));return;}
await withButton(button,async()=>{switch(action){
case 'logout':await logout();state.me=null;state.draft={};state.draftOwner=null;state.skills=[];sessionStorage.removeItem('onboarding-role');go('/');break;
case 'open-workplace':showWorkplaceForm(button.closest('form'));break;
case 'open-password':if(state.me?.profile?.role==='recruiter'&&!isRecruiterDemo(state.me.profile.email))showPasswordForm();break;
case 'demo':if(getSession())await logout();state.draft={};state.skills=[];await login(button.dataset.email,'Demo!Talents2026');go('/'+button.dataset.role+'/dashboard');break;
case 'apply':case 'skip':case 'bookmark':{const job=state.feed[0],feed=state.feed,card=document.querySelector('.swipe-card');if(!job||!card)return;card.classList.add('pending');try{await api('job_action',{job_id:job.id,decision:action});if(!card.isConnected||state.feed!==feed)return;card.dataset.leaving=action;card.style.transform='';card.classList.add('leaving');await new Promise(resolve=>setTimeout(resolve,240));if(!card.isConnected||state.feed!==feed)return;if(!noticeFlags().started)markSwipeNotice('started');state.feed.shift();document.querySelector('#swipe-stack').innerHTML=swipeCard();loadSwipeMap();document.querySelector('#stack-count').textContent=state.feed.length+' Jobs';maybeSwipeNotice();}catch(error){card.classList.remove('pending','dragging','leaving');card.style.transform='';card.querySelector('.swipe-feedback').textContent='';throw error;}toast(action==='apply'?applicationSent:action==='bookmark'?'Job gemerkt.':'Job abgelehnt.');break;}
case 'apply-saved':case 'unsave':await api('job_action',{job_id:id,decision:action==='apply-saved'?'apply':'unsave'});toast(action==='apply-saved'?applicationSent:'Job entfernt.');await render();break;
case 'full-profile':case 'application-detail':{const a=state.applications.find(a=>a.application_id===id);if(a)showDetails(a,a);break;}
case 'accept':case 'reject':await api('decide',{application_id:id,decision:action});modal.close();toast(action==='accept'?'Bewerbung angenommen. Ihr habt ein Match und seht Eure Kontaktdaten.':'Abgelehnt.');await render();if(action==='accept'){const accepted=state.applications.find(a=>a.application_id===id);if(accepted)showDetails(accepted,accepted);}break;
case 'close-match-confirm':if(state.me?.profile?.role!=='talent')break;await api('close_match',{application_id:id});modal.close();toast('Match aufgelöst.');await render();break;
case 'open-document':{const tab=window.open('about:blank','_blank');try{const url=await documentUrl(button.dataset.path);if(tab){tab.opener=null;tab.location=url;}else location.href=url;}catch(error){tab?.close();throw error;}break;}
case 'delete-document':showModal('Dokument entfernen?','<p>Die Datei wird aus Deinen Unterlagen entfernt und steht auch Matches nicht mehr zur Verfügung.</p>',actionButton('close-modal','Abbrechen','secondary')+actionButton('delete-document-confirm','Entfernen','danger',`data-path="${E(button.dataset.path)}"`));break;
case 'delete-document-confirm':await deleteDocument(button.dataset.path);modal.close();toast('Datei entfernt.');await render();break;
case 'own-preview':{
 const job=state.jobs.find(item=>item.id===id);
 const profile=state.me.company_profiles.find(item=>item.id===job.company_profile_id);
 await showRecruiterJobPreview({...job,...job.preferences,industry:profile?.industry},'Schließen');
 break;
}
case 'preview-job':{
 const form=document.querySelector('#matching-form');
 if(!form.reportValidity())return;
 const fields=Object.fromEntries(new FormData(form));
 const profile=state.me.company_profiles.find(item=>item.id===fields.company_profile_id);
 await showRecruiterJobPreview({...fields,company:profile.public_name,industry:profile.industry,skills:structuredClone(state.skills)},'Zurück zum Formular');
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
function availabilityCounter(role){return `<aside class="counter" aria-live="polite" aria-atomic="true">${icon('target',true)}<strong id="live-count">…</strong><small>Treffer</small></aside>`;}
function countPayload(form){
 const fields=new FormData(form);
 if(form.dataset.form==='company'){
  const {office,size,type,culture}=companyProperties(Object.fromEntries(fields));
  const postcode=fields.get('postcode');
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
function scheduleCount(delay=250){
 const form=document.querySelector('[data-count-form]'),out=document.querySelector('#live-count');
 if(!form||!out)return;
 const payload=countPayload(form);
 const key=JSON.stringify(payload);
 if(key===out._countKey)return;
 out._countKey=key;
 clearTimeout(countTimer);
 const request=++countVersion,version=pageVersion;
 const isCurrent=()=>request===countVersion&&version===pageVersion&&out.isConnected;
 out.textContent='…';
 out.parentElement.setAttribute('aria-busy','true');
 countTimer=setTimeout(async()=>{
  try{
   const result=await api('preview_count',payload);
   if(isCurrent()){
    out.textContent=formatCount(result.count);
    out.parentElement.removeAttribute('title');
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
document.addEventListener('input',event=>{const input=event.target;if(input.name==='postcode'&&input.form?.dataset.form==='candidate')lookupCandidatePostcode(input.form);if(input.form?.dataset.form==='job'&&addressFields.includes(input.name))syncWorkplaceChoice(input.form);if(input.closest('form'))input.form.querySelector('.form-error')?.replaceChildren();if(input.closest('[data-count-form]')&&!input.dataset.search)saveDraft();if(input.name==='password'){const p=input.value;const flags=[p.length>=8,/[A-Z]/.test(p),/[a-z]/.test(p),/\d/.test(p),/[\W_]/.test(p)];document.querySelectorAll('#password-rules li').forEach((li,i)=>li.classList.toggle('valid',flags[i]));}if(input.matches('textarea[name="description"]')){resizeJobDescription(input);const counter=document.querySelector('#description-count');if(counter)counter.textContent=input.value.length+'/240';}if(input.closest('[data-count-form]')&&!input.dataset.search)scheduleCount();if(input.dataset.search){clearTimeout(input._searchTimer);const kind=input.dataset.search;const request=++searchVersion;input._searchTimer=setTimeout(async()=>{const container=document.querySelector('#'+kind+'-results');if(input.value.trim().length<2){if(container)container.innerHTML='';return;}try{const data=await api('catalog',{kind,q:input.value});if(request!==searchVersion||!container?.isConnected)return;data.forEach(s=>state.catalog.set(s.id,s));container.innerHTML=data.length?data.map(s=>kind==='occupation'?`<button type="button" class="result" data-action="occupation" data-id="${s.id}">${E(s.label)}</button>`:skillResult(s)).join(''):'<div class="result muted">Keine passenden Einträge gefunden.</div>';}catch(error){if(container?.isConnected)container.innerHTML=`<div class="result inline-error">${E(error.message)}</div>`;}},250);}});
document.addEventListener('change',async event=>{const el=event.target;if(el.form?.dataset.form==='job'&&['company_profile_id','workplace'].includes(el.name)){changeWorkplace(el);return;}if(el.id==='cost-profile-filter'||el.id==='cost-job-filter'){filterCosts();return;}if(el.dataset.jobStatus){const id=el.dataset.jobStatus,value=el.value;await withButton(el,async()=>{const j=state.jobs.find(j=>j.id===id),controls=[...document.querySelectorAll('[data-job-status]')].filter(c=>c.dataset.jobStatus===id);controls.forEach(c=>{c.value=value;c.disabled=true;});try{await api('save_job',{...j,status:value});toast('Status gespeichert.');await render();}catch(error){controls.forEach(c=>c.value=j.status);throw error;}finally{controls.forEach(c=>c.disabled=false);}});return;}if(el.name==='experience_current'){const end=el.closest('.experience-row').querySelector('[name=experience_end]');end.disabled=el.checked;if(el.checked)end.value='';}if(el.id==='company-profile-select'){delete state.draft.companyFields;app.innerHTML=companyForm(false,state.draft.company.id,el.value);scheduleCount();return;}if(el.name==='radius'&&el.form?.dataset.form==='candidate')syncCandidatePostcodeRequired(el.form);if(el.closest('[data-count-form]')){saveDraft();scheduleCount();}if(el.id==='job-company-filter'||el.id==='job-status-filter'){const profile=document.querySelector('#job-company-filter').value,status=document.querySelector('#job-status-filter').value;const jobs=state.jobs.filter(j=>(!profile||j.company_profile_id===profile)&&(!status||j.status===status));document.querySelector('#own-jobs').innerHTML=jobs.map(j=>jobCard(j)).join('')||empty('Keine Jobs in dieser Auswahl','Passe die Filter an.');}if(el.id==='application-job-filter'||el.id==='application-history'){document.querySelector('#application-list').innerHTML=paintApplications(state.me.profile.role);}if(el.id==='document-upload'&&el.files[0])await withButton(null,async()=>{toast('Datei wird hochgeladen …');await upload(el.files[0]);toast('Datei sicher gespeichert.');await render();});if(el.name==='postcode'&&el.form?.dataset.form!=='candidate'&&/^\d{5}$/.test(el.value)&&getSession()){try{const postcode=el.value;const loc=await api('postcode',{postcode});if(!el.isConnected||el.value!==postcode)return;const hint=el.form?.querySelector('#postcode-hint');if(hint)hint.textContent=loc?loc.city:'PLZ nicht gefunden.';const city=el.form?.elements.city;if(city&&!city.value&&loc){city.value=loc.city;if(el.form.dataset.form==='job'){syncWorkplaceChoice(el.form);saveDraft();}}}catch{}}});
let pointer;
function resetDrag(){if(!pointer)return;const card=pointer.card;pointer=null;card.classList.remove('dragging');card.style.transform='';card.querySelector('.swipe-feedback').textContent='';card.removeAttribute('data-direction');}
document.addEventListener('pointerdown',e=>{const card=e.target.closest('.swipe-card');if(pointer||e.isPrimary===false||!card||state.busy||e.button!==0||e.target.closest('button,a,iframe,input'))return;pointer={id:e.pointerId,card,x:e.clientX,y:e.clientY,dx:0,dy:0,vertical:!!e.target.closest('.swipe-grab')};});
document.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;const p=pointer;p.dx=e.clientX-p.x;p.dy=e.clientY-p.y;if(!p.vertical&&Math.abs(p.dy)>Math.abs(p.dx)&&!p.card.classList.contains('dragging')){resetDrag();return;}if(Math.max(Math.abs(p.dx),Math.abs(p.dy))<8)return;if(!p.card.hasPointerCapture(e.pointerId))p.card.setPointerCapture(e.pointerId);p.card.classList.add('dragging');const down=p.vertical&&p.dy>Math.abs(p.dx);p.card.dataset.direction=down?'bookmark':p.dx>0?'apply':'skip';p.card.querySelector('.swipe-feedback').textContent=down?'MERKEN':p.dx>0?'BEWERBEN':'ABLEHNEN';p.card.style.transform=`translate(${down?p.dx*.2:p.dx}px,${down?p.dy:p.dy*.15}px) rotate(${down?0:p.dx/22}deg)`;});
document.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;const p=pointer;const action=p.vertical&&p.dy>100&&p.dy>Math.abs(p.dx)?'bookmark':Math.abs(p.dx)>Math.min(100,p.card.offsetWidth*.27)&&Math.abs(p.dx)>Math.abs(p.dy)?p.dx>0?'apply':'skip':null;resetDrag();if(action)p.card.querySelector(`[data-action="${action}"]`)?.click();});
document.addEventListener('pointercancel',e=>{if(pointer?.id===e.pointerId)resetDrag();});
document.addEventListener('lostpointercapture',e=>{if(pointer?.id===e.pointerId)resetDrag();});

window.addEventListener('hashchange',()=>{resetDrag();saveDraft();window.scrollTo(0,0);render();});
window.addEventListener('resize',()=>resizeJobDescription());
window.addEventListener('storage',e=>{if(e.key==='andtalents-test-session-v1')location.reload();});
render();

// Pair native validation messages with their inputs for assistive technology.
document.addEventListener('invalid',event=>{const input=event.target;if(!input.form)return;input.setAttribute('aria-invalid','true');const id='field-error-'+(input.name||'input');let out=input.parentElement.querySelector('.field-error');if(!out){out=document.createElement('small');out.className='field-error';out.id=id;input.after(out);}out.textContent=input.validationMessage;input.setAttribute('aria-describedby',id);},true);
document.addEventListener('input',event=>{const input=event.target;if(input.getAttribute('aria-invalid')==='true'&&input.validity.valid){input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');input.parentElement.querySelector('.field-error')?.remove();}});
