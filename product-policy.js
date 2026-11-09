export const MIN_SKILLS=5;
export const MATCH_MIN=50;
export const TRAVEL_LABELS=['keine Reisen','1-5 Tage pro Monat','50% plus'];

// Existing scalar values represented a maximum; new arrays represent exact choices.
export function selectedTravel(value,job=false){
  if(Array.isArray(value))return [...new Set(value.filter(n=>Number.isInteger(n)&&n>=0&&n<=2))].sort();
  if(Number.isInteger(value)&&value>=0&&value<=2)return job?[value]:Array.from({length:value+1},(_,i)=>i);
  return [];
}
export function hasMinimumSkills(skills){return Array.isArray(skills)&&skills.length>=MIN_SKILLS;}
export function meetsMatchPolicy(match,required,available){return Number(match?.score)>=MATCH_MIN&&hasMinimumSkills(required)&&hasMinimumSkills(available);}
export function mayShowNavigation(role,me,route,hasSession){
  if(!hasSession||!me?.profile||me.profile.role!==role||route.includes('/onboarding'))return false;
  return role==='talent'?hasMinimumSkills(me.candidate?.skills):role==='recruiter'&&Boolean(me.company_profiles?.length);
}
export function noticePhase(route,flags,hasJobs){
  if(route==='/talent/jobs'&&flags.started&&!flags.after&&!hasJobs)return 'after';
  return null;
}
