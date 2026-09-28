export const STUDY_INTERVALS = [
  {label:'24 horas',hours:24}, {label:'7 dias',days:7}, {label:'30 dias',days:30},
  {label:'6 meses',months:6}, {label:'1 ano',months:12}, {label:'3 anos',months:36}
];

export function studyPeriods(item) {
  return STUDY_INTERVALS.map((_,index)=>item.study_periods?.[index]||{status:item.study_reviews?.[index]?'completed':'pending',comment:'',completed_at:item.study_reviews?.[index]||null});
}

export function studySchedule(item,now=Date.now()) {
  if(!item.studied_at)return [];
  const base=new Date(item.studied_at);
  if(!Number.isFinite(base.getTime()))return [];
  return STUDY_INTERVALS.map((interval,index)=>{
    const date=new Date(base);
    if(interval.hours)date.setTime(date.getTime()+interval.hours*3600000);
    if(interval.days)date.setDate(date.getDate()+interval.days);
    if(interval.months){
      const day=date.getDate();date.setDate(1);date.setMonth(date.getMonth()+interval.months);
      date.setDate(Math.min(day,new Date(date.getFullYear(),date.getMonth()+1,0).getDate()));
    }
    const period=studyPeriods(item)[index];
    return {index,label:interval.label,due_at:date.toISOString(),...period,overdue:period.status==='pending'&&date.getTime()<=Number(now)};
  });
}

export const nextStudyReview=(item,now=Date.now())=>studySchedule(item,now).find(stage=>stage.status==='pending')||null;

export function localStudyTime(value=new Date()) {
  const date=new Date(value),pad=n=>String(n).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function studyMatchesStatus(item,status,now=Date.now()) {
  const next=nextStudyReview(item,now);
  return status==='all'||(status==='due'&&!!next?.overdue)||(status==='scheduled'&&!!next&&!next.overdue)||(status==='finished'&&!!item.studied_at&&!next)||(status==='unstarted'&&!item.studied_at);
}

export function studyAgenda(items,tabs,now=Date.now()) {
  return items.flatMap(item=>{
    const tab=tabs.find(tab=>tab.id===item.tab_id);
    if(tab?.layout!=='studies'||item.status!=='active')return [];
    const next=nextStudyReview(item,now);
    return next?.overdue?[{title:item.title,date:localStudyTime(next.due_at),page:'personal',label:`Revisão de ${next.label} · ${tab.name}`}]:[];
  });
}
