export function scheduleInput(raw,{str,date,AppError}){
  const schedule_kind=raw.schedule_kind,weekday=raw.weekday,schedule_date=date(raw.schedule_date);
  if(!['template','exception'].includes(schedule_kind)||!Number.isInteger(weekday)||weekday<0||weekday>6)throw new AppError('Dia da semana inválido.');
  if(schedule_kind==='template'&&schedule_date!==null||schedule_kind==='exception'&&(!schedule_date||new Date(`${schedule_date}T12:00:00Z`).getUTCDay()!==weekday))throw new AppError('Data do cronograma inválida.');
  if(!Array.isArray(raw.blocks))throw new AppError('Lista de horários inválida.');
  const ids=new Set(),clock=value=>{if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw new AppError('Horário inválido.');return value;};
  const blocks=raw.blocks.map(block=>{
    if(!block||typeof block.id!=='string'||!/^[\w-]{1,80}$/.test(block.id)||ids.has(block.id))throw new AppError('Identificador do horário inválido ou repetido.');ids.add(block.id);
    const start=clock(block.start),end=clock(block.end);if(end<=start)throw new AppError('O término deve ser depois do início, no mesmo dia.');
    if(typeof block.color!=='string'||!/^#[\da-fA-F]{6}$/.test(block.color))throw new AppError('Cor inválida.');
    return {id:block.id,title:str(block.title,120,true),start,end,color:block.color.toLowerCase(),notes:str(block.notes??'',10000)};
  });
  const schedule_revision=raw.schedule_revision??1;
  if(!Number.isSafeInteger(schedule_revision)||schedule_revision<1)throw new AppError('Versão do cronograma inválida.');
  return {schedule_kind,weekday,schedule_date,blocks,schedule_revision};
}

export const scheduleKey=item=>`${item.tab_id}:${item.schedule_kind}:${item.schedule_kind==='template'?item.weekday:item.schedule_date}`;
