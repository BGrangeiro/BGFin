export function studyInput(raw,{str,AppError}) {
  const timestamp=value=>{
    if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw new AppError('Data e horário do estudo inválidos.');
    return value;
  };
  const studied_at=raw.studied_at==null||raw.studied_at===''?null:timestamp(raw.studied_at);
  const questions=raw.questions??[];
  if(!Array.isArray(questions))throw new AppError('Lista de perguntas inválida.');
  const checkedQuestions=questions.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row))throw new AppError('Pergunta inválida.');
    return {question:str(row.question,5000,true),answer:str(row.answer??'',10000)};
  });
  const study_reviews=raw.study_reviews??[];
  if(!Array.isArray(study_reviews)||study_reviews.length>6||(!studied_at&&study_reviews.length))throw new AppError('Histórico de revisões inválido.');
  let previous=studied_at;
  const checkedReviews=study_reviews.map(value=>{
    const current=timestamp(value);
    if(current<studied_at||(raw.study_periods===undefined&&current<previous))throw new AppError('A revisão não pode ser anterior ao estudo ou à revisão anterior.');
    previous=current;return current;
  });
  let study_periods;
  if(raw.study_periods!==undefined){
    if(!Array.isArray(raw.study_periods)||raw.study_periods.length!==6)throw new AppError('Informe os seis períodos de revisão.');
    study_periods=raw.study_periods.map(period=>{
      if(!period||!['pending','skipped','completed'].includes(period.status))throw new AppError('Situação da revisão inválida.');
      const completed_at=period.completed_at==null?null:timestamp(period.completed_at);
      if((period.status==='completed')!==!!completed_at||(completed_at&&(!studied_at||completed_at<studied_at)))throw new AppError('Data de conclusão da revisão inválida.');
      return {status:period.status,comment:str(period.comment??'',10000),completed_at};
    });
  }else study_periods=Array.from({length:6},(_,index)=>({status:checkedReviews[index]?'completed':'pending',comment:'',completed_at:checkedReviews[index]||null}));
  const history=[];for(const period of study_periods){if(period.status!=='completed')break;history.push(period.completed_at);}
  return {studied_at,questions:checkedQuestions,study_reviews:history,study_periods};
}
