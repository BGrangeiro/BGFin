export const shiftDay=(date,delta)=>{const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+delta);return value.toISOString().slice(0,10);};
export const weekDays=date=>{
  const start=shiftDay(date,-((new Date(`${date}T12:00:00Z`).getUTCDay()+6)%7));
  return Array.from({length:7},(_,index)=>shiftDay(start,index));
};
export const dayAllowed=day=>day>='2000-01-01'&&day<='2099-12-31';
