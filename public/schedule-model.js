export const WEEKDAY_NAMES=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
export const weekdayOf=date=>new Date(`${date}T12:00:00Z`).getUTCDay();
export const minutesOf=time=>Number(time.slice(0,2))*60+Number(time.slice(3));
export const timeOf=minutes=>`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
export const sortedBlocks=blocks=>[...blocks].sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end)||a.id.localeCompare(b.id));
export const sameBlock=(a,b)=>!!a&&!!b&&['id','title','start','end','color','notes'].every(key=>a[key]===b[key]);
export function samePlan(a,b){const left=sortedBlocks(a),right=sortedBlocks(b);return left.length===right.length&&left.every((block,index)=>sameBlock(block,right[index]));}
export function scheduleDay(items,tabId,date){
  const records=items.filter(item=>item.tab_id===tabId&&item.schedule_kind);
  const template=records.find(item=>item.schedule_kind==='template'&&item.weekday===weekdayOf(date));
  const exception=records.find(item=>item.schedule_kind==='exception'&&item.schedule_date===date);
  const blocks=sortedBlocks(exception?.blocks??template?.blocks??[]);
  return {template,exception,blocks,modified:!!exception&&!samePlan(exception.blocks,template?.blocks??[])};
}
export function swapScheduleTimes(blocks,firstId,secondId){
  const first=blocks.find(block=>block.id===firstId),second=blocks.find(block=>block.id===secondId);
  if(!first||!second||firstId===secondId)return blocks;
  return blocks.map(block=>block.id===firstId?{...block,start:second.start,end:second.end}:block.id===secondId?{...block,start:first.start,end:first.end}:block);
}
export function moveScheduleTime(blocks,id,start){
  const original=blocks.find(block=>block.id===id);if(!original)return blocks;
  const end=minutesOf(start)+minutesOf(original.end)-minutesOf(original.start);
  if(end>1439||minutesOf(start)<0)throw new Error('O compromisso precisa terminar até 23:59. Escolha outro horário.');
  return blocks.map(block=>block.id===id?{...block,start,end:timeOf(end)}:block);
}
