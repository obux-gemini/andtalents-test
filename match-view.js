// All views consume the same server result. No score is recalculated in the UI.
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const E=escapeHtml;
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
export function scorePill(score){
  const n=Math.max(0,Math.min(100,Number(score)||0));
  const badge=`<strong class="match-score" aria-label="Match-Score ${n} Prozent">${n} %</strong>`;
  return `<span class="match-score-wrap">${badge}<span class="match-score-label">Match-Score</span></span>`;
}
export function matchOverview(match){
  const groups=skillGroups(match?.details||[]);
  const ordered=groups.flat();
  const counts=groups.map(group=>group.length);
  return `<div class="match-overview"><div class="match-coverage" style="--skill-columns:${Math.max(1,ordered.length)}" aria-label="${counts[0]} passend, ${counts[1]} ähnlich, ${counts[2]} offen">${ordered.map(x=>`<span class="match-unit ${x.factor===1?'pass':x.factor>0?'close':'open'}" title="${E(x.label)}"><span class="match-bar-star">${topSkillMark(x.fire,x.candidate_fire)}</span></span>`).join('')}</div><div class="match-counts"><span><b>${counts[0]}</b> passend</span><span><b>${counts[1]}</b> ähnlich</span><span><b>${counts[2]}</b> offen</span></div></div>`;
}
export function skillList(job,{candidateSkills=[],perspective='talent',swipe=false}={}){
  const d=job.match?.details||[];
  const used=new Set(d.filter(x=>x.factor>0).map(x=>Number(x.via)));
  const extras=candidateSkills.filter(x=>!used.has(Number(x.id))&&!d.some(y=>Number(y.id)===Number(x.id)));
  const comparison=x=>{
    if(x.factor<=0||!x.via_label||Number(x.via)===Number(x.id))return '';
    const skill=E(x.via_label);
    const label=swipe&&x.factor<1?skill:`${perspective==='recruiter'?'Bewerber':'Profil'}: ${skill}`;
    return `<div class="match-via">${label}</div>`;
  };
  const rows=items=>items.map(x=>`<li class="match-row ${x.factor===1?'pass':x.factor>0?'close':'open'}"><div class="match-skill-name"><span>${E(x.label)}</span>${topSkillMark(x.fire,x.candidate_fire)}</div>${comparison(x)}<span class="sr-only">${x.factor===1?'Passend':x.factor>0?'Ähnlich':'Offen'}</span></li>`).join('');
  const extraRows=extras.map(x=>`<li class="match-row extra"><div class="match-skill-name"><span>${E(x.label)}</span>${topSkillMark(false,x.fire)}</div><span class="sr-only">Zusätzlich im Profil</span></li>`).join('');
  return `<div class="match-comparison"><ul class="match-list">${rows(skillGroups(d).flat())}${extraRows}</ul>${!d.length?'<p class="hint">Der individuelle Skillvergleich erscheint nach Auswahl eines Kandidaten.</p>':''}</div>`;
}
export function plainSkillList(skills=[],own=false){return `<ul class="match-list">${skills.map(s=>`<li class="match-row extra"><div class="match-skill-name"><span>${E(s.label)}</span>${topSkillMark(own?false:s.fire,own?s.fire:false)}</div></li>`).join('')}</ul>`;}
