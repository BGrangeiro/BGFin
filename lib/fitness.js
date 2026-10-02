import { nutritionInput } from './nutrition.js';
export function fitnessInput(raw, {str,date,AppError}) {
  if (!['workout','meal'].includes(raw.record_type)) throw new AppError('Escolha treino ou alimentação.');
  if (!date(raw.due_date)) throw new AppError('Informe o dia do registro.');
  const completed=raw.completed??false;
  if (typeof completed!=='boolean') throw new AppError('Presença no treino inválida.');
  const meal_time=raw.meal_time??'';
  if (typeof meal_time!=='string'||(meal_time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(meal_time))) throw new AppError('Informe um horário válido.');
  const exercises=raw.exercises??[];
  if (!Array.isArray(exercises)) throw new AppError('Lista de exercícios inválida.');
  const checked=exercises.map(exercise=>{
    if (!exercise||typeof exercise!=='object') throw new AppError('Exercício inválido.');
    const video_url=str(exercise.video_url??'',4096);
    if (video_url) {
      try {const url=new URL(video_url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw 0;}
      catch {throw new AppError('Use um link de vídeo começando com https:// ou http://.');}
    }
    return {name:str(exercise.name,160,true),sets:str(exercise.sets??'',80),reps:str(exercise.reps??'',80),load:str(exercise.load??'',80),performed_reps:str(exercise.performed_reps??'',160),rest:str(exercise.rest??'',160),rir:str(exercise.rir??'',80),notes:str(exercise.notes??'',2000),video_url};
  });
  if (raw.record_type==='meal') str(raw.notes??'',10000,true);
  const plan=Object.fromEntries([['plan_name',160],['week_label',80],['week_goal',2000],['workout_guidance',20000]].map(([key,max])=>[key,raw.record_type==='workout'?str(raw[key]??'',max):'']));
  return {record_type:raw.record_type,completed:raw.record_type==='workout'&&completed,
    exercises:raw.record_type==='workout'?checked:[],meal_time:raw.record_type==='meal'?meal_time:'',nutrition:raw.record_type==='meal'?nutritionInput(raw.nutrition,AppError):null,...plan};
}
