const relevant = /^(?:(?:ihre|deine|die|unsere|dein|ihr|das|dein neues|ihr neues) )?(?:aufgaben(?:bereich|gebiete?)?|tätigkeiten|verantwortlichkeiten|anforderungen|qualifikationen|(?:wunsch)?profil|anforderungsprofil|fachliche voraussetzungen|voraussetzungen|deine rolle und aufgaben|aufgaben und verantwortlichkeiten|anforderungen und qualifikationen|kenntnisse|erforderliche kenntnisse|erforderliche qualifikationen|erforderliche skills|gewünschte qualifikationen|gewünschte kenntnisse|kenntnisse und fähigkeiten|kompetenzen|skills|dein beitrag|ihr beitrag)$|^(?:was (?:tragen (?:sie|du) bei|bringen (?:sie|du) mit|du (?:mitbringst|bei uns machst|bei uns bewegst|bewegst|tust|machst)|sie (?:mitbringen|bei uns bewegen)|dich erwartet|sie erwartet|wir (?:von dir|von ihnen) erwarten)|das (?:bringst du|bringen sie) mit|das erwartet (?:dich|sie)|damit (?:überzeugst du uns|überzeugen sie uns)|so (?:gestaltest du mit|bringen sie sich ein))$|^(?:(?:your |key |main |core )?(?:tasks|responsibilities|duties)|your (?:profile|contribution(?: to something big)?)|what (?:you(?: will| ll) (?:do|bring)|you bring(?: to the table)?|we (?:are| re) looking for|distinguishes you|you need(?: to succeed)?)|(?:minimum |basic |required |preferred |desired )?qualifications|(?:job |minimum |basic )?requirements|(?:required |mandatory |preferred |desired |technical )?skills|skills and experience|experience(?: know how)?|education)$/u;

const excluded = /^(?:(?:(?:deine|ihre|unsere|unser) )?(?:benefits|vorteile|angebote?|leistungen|zusatzleistungen)|(?:was (?:bieten wir(?: (?:ihnen|dir))?|wir (?:dir|ihnen) bieten|du (?:von uns )?bekommst)|das bieten wir(?: (?:ihnen|dir))?|darauf (?:kannst du dich|können sie sich) freuen|wie (?:treten sie mit uns in kontakt|du dich bewirbst)|(?:über|wer) wir(?: sind)?|über uns|unternehmensbeschreibung|stellenbeschreibung|die stelle|über (?:die|diese) stelle|bewerbung(?:sprozess)?|kontakt|so (?:bewirbst du dich|bewerben sie sich)|wichtiger hinweis)|(?:about (?:us|the company|the role|the job)|company (?:description|overview|information)|job (?:description|location|overview|summary)|(?:your role|(?:role|position) (?:overview|summary))|additional information|other information|(?:our |employee |perks and )?benefits|perks|what (?:we offer|you(?: will| ll) get)|why (?:join us|work with us)|how to apply|application(?: process)?|contact|work likeabosch means|compensation(?: and benefits)?|salary(?: and benefits)?|vergütung(?: und benefits)?))$/u;

const normalizeHeading = value => value.normalize('NFKC').toLocaleLowerCase('de')
 .replace(/^[\s•*#\-–—>]+/u,'')
 .replace(/[^\p{L}\p{N}]+/gu,' ').trim();

function headingKind(value){
 const heading=normalizeHeading(value);
 if(excluded.test(heading))return 'excluded';
 if(relevant.test(heading.replace(/ (?:im überblick|bei uns|must have|nice to have)$/u,'')))return 'relevant';
 return '';
}

export function jobSkillSections(input){
 let level=0;
 const sections=[];
 for(const line of input.split(/\r?\n/u)){
  const trimmed=line.trim();
  if(!trimmed)continue;
  const tagged=trimmed.match(/^@heading:([1-6])@(.+)$/u);
  const content=tagged?tagged[2].trim():trimmed;
  const separator=content.search(/[:?]/u);
  const lead=separator===-1?'':content.slice(0,separator);
  const kind=headingKind(content)||headingKind(lead);
  if(kind==='excluded'){
   level=0;
  }else if(kind==='relevant'){
   level=tagged?Number(tagged[1]):6;
   const inline=separator<0?'':content.slice(separator+1).trim();
   if(inline)sections.push(inline);
  }else if(tagged){
   if(level&&Number(tagged[1])<=level)level=0;
  }else if(level){
   sections.push(content);
  }
 }
 return sections.join('\n');
}
