// All views consume the same server result. No score is recalculated in the UI.
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const E=escapeHtml;
export const skillsHeading='<h3 class="match-section-title">Skills</h3>';
export function topSkillIcon(filled=false,label=''){
  const accessibility=label?`role="img" aria-label="${E(label)}"`:'aria-hidden="true"';
  return `<svg class="match-star${filled?' filled':''}" ${accessibility} viewBox="0 0 24 24"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1Z"/></svg>`;
}
export function topSkillMark(job,candidate){
  if(!job&&!candidate)return '';
  return topSkillIcon(job&&candidate,job&&candidate?'Top Skill auf beiden Seiten':job?'Top Skill des Jobs':'Top Skill im Profil');
}
const skillGroups=details=>[
  details.filter(skill=>skill.factor===1),
  details.filter(skill=>skill.factor>0&&skill.factor<1),
  details.filter(skill=>!skill.factor)
];
export function scorePill(score,{showInfo=false}={}){
  const n=Math.max(0,Math.min(100,Number(score)||0));
  const badge=`<strong class="match-score" aria-label="Match-Score ${n} Prozent">${n} %</strong>`;
  const info=showInfo?'<span class="swipe-info-icon" aria-hidden="true">i</span>':'';
  return `<span class="match-score-wrap">${badge}<span class="match-score-label">Match-Score${info}</span></span>`;
}
export function matchOverview(match){
  const groups=skillGroups(match?.details||[]);
  const ordered=groups.flat();
  const counts=groups.map(group=>group.length);
  const statuses=[['pass','passend'],['close','ähnlich'],['open','offen']];
  const summary=statuses.map(([,label],index)=>`${counts[index]} ${label}`).join(', ');
  const legend=statuses.map(([style,label],index)=>`<span class="match-count ${style}"><b>${counts[index]}</b> ${label}</span>`).join('');
  return `<div class="match-overview"><div class="match-coverage" style="--skill-columns:${Math.max(1,ordered.length)}" aria-label="${summary}">${ordered.map(x=>{const [style,label]=statuses[x.factor===1?0:x.factor>0?1:2];return `<span class="match-unit ${style}" title="${E(x.label)} · ${label}"><span class="match-bar-star">${topSkillMark(x.fire,x.candidate_fire)}</span></span>`;}).join('')}</div><div class="match-counts">${legend}</div></div>`;
}
export function skillList(job,{candidateSkills=[]}={}){
  const d=job.match?.details||[];
  const used=new Set(d.filter(x=>x.factor>0).map(x=>Number(x.via)));
  const extras=candidateSkills.filter(x=>!used.has(Number(x.id))&&!d.some(y=>Number(y.id)===Number(x.id)));
  const comparison=x=>{
    if(x.factor<=0||!x.via_label||Number(x.via)===Number(x.id))return '';
    const skill=E(x.via_label);
    return `<div class="match-via">${x.factor===1?`Passend (über ${skill})`:skill}</div>`;
  };
  const rows=items=>items.map(x=>`<li class="match-row ${x.factor===1?'pass':x.factor>0?'close':'open'}"><div class="match-skill-name"><span>${E(x.label)}</span>${topSkillMark(x.fire,x.candidate_fire)}</div>${comparison(x)}<span class="sr-only">${x.factor===1?'Passend':x.factor>0?'Ähnlich':'Offen'}</span></li>`).join('');
  const extraRows=extras.map(x=>`<li class="match-row extra"><div class="match-skill-name"><span>${E(x.label)}</span>${topSkillMark(false,x.fire)}</div><span class="sr-only">Zusätzlich im Profil</span></li>`).join('');
  const additional=extraRows?`<h4 class="match-section-title match-extra-title">Zusätzliche Skills</h4><ul class="match-list">${extraRows}</ul>`:'';
  return `<div class="match-comparison">${skillsHeading}<ul class="match-list">${rows(skillGroups(d).flat())}</ul>${additional}${!d.length?'<p class="hint">Der individuelle Skillvergleich erscheint nach Auswahl eines Kandidaten.</p>':''}</div>`;
}
export function plainSkillList(skills=[],own=false){return `<ul class="match-list">${skills.map(s=>`<li class="match-row extra"><div class="match-skill-name"><span>${E(s.label)}</span>${topSkillMark(own?false:s.fire,own?s.fire:false)}</div></li>`).join('')}</ul>`;}
