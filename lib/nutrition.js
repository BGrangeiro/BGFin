export function nutritionInput(raw,AppError){
  if(raw==null)return null;
  if(typeof raw!=='object'||Array.isArray(raw))throw new AppError('Estimativa nutricional inválida.');
  const grams=value=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>10000)throw new AppError('Proteínas e carboidratos devem ser valores em gramas, entre 0 e 10000.');return Math.round(value*10)/10;};
  if(typeof raw.portion_note!=='string'||!raw.portion_note.trim()||raw.portion_note.length>2000)throw new AppError('Informe a porção usada na estimativa nutricional.');
  return {protein_g:grams(raw.protein_g),carbs_g:grams(raw.carbs_g),portion_note:raw.portion_note.trim(),estimated:true};
}

const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function foodDescription(message){
  const n=normalize(message);
  if(/\?|\b(nao|nunca|vou|quero|pretendo|devo|posso|amanha|comprar|comprei|mercado|lista|receita|quanto|quantas|qual|como|sugira|recomende|se eu|registre uma despesa|adicionar uma tarefa|mostre|liste|consulte|explique|apague|exclua|corrija|tarefa|lembrete|treino|estudo|despesa|compra)\b/.test(n))return false;
  return /\b(arroz|feijao|frango|carne|peixe|ovo|ovos|pao|paes|banana|maca|iogurte|leite|cafe|agua|suco|refrigerante|cha|cerveja|vinho|whey|aveia|batata|macarrao|massa|salada|queijo|manteiga|tapioca|cuscuz|pizza|hamburguer|sanduiche|biscoito|bolacha|chocolate|sopa|acai|laranja|pera|mamao|abacate|castanhas|amendoim|lentilha|tofu|sushi|mandioca|aipim|inhame|granola|cereal|cereais|mingau|salmao|atum|camarao|brocolis|cenoura|tomate|alface|pipoca|bolo|sorvete|uva|melancia|melao|manga|abacaxi|morango|omelete|pudim|farofa|milho|polenta|ervilha|picanha|bife|linguica|presunto|lasanha|panqueca|crepioca|vitamina|shake|energetico|coca|guarana)\b/.test(n);
}

export const NUTRITION_INSTRUCTIONS=`ALIMENTAÇÃO AUTOMÁTICA:
Um relato do que a pessoa já comeu ou bebeu deve ser registrado em Alimentação mesmo no modo Conversar, sem exigir "registre". Uma lista curta composta só por alimentos/bebidas, como "arroz, feijão e frango" ou "café com leite", também descreve uma refeição. Use meal; não use note, transaction ou outra aba para esses relatos. Não registre perguntas, negações, compras, receitas, hipóteses ou planos de refeições futuras.
Ao registrar, preencha nutrition com protein_g e carbs_g: estimativas do TOTAL da refeição em GRAMAS, e portion_note explicando porções, preparo e suposições. Não são valores por 100g, porcentagens ou metas diárias. Arredonde para no máximo uma casa decimal. Prefira quantidades e rótulo informados. Diferencie alimento cru/cozido quando informado; não invente marca, rótulo ou ingredientes.
Se a quantidade não foi informada, use uma porção doméstica comum para cada alimento e deixe explícito "Porção presumida: ..." em portion_note. Preserve em notes o relato real, sem transformar a porção presumida em algo que o usuário afirmou ter comido. Se o alimento ou bebida estiver indefinido ("comi um negócio", "bebi algo") não invente: peça esclarecimento. Para receita/composição realmente desconhecida, registre a descrição com nutrition=null e explique que falta informação para estimar. Água pura tem 0g de proteínas e 0g de carboidratos. Café/chá puro sem açúcar têm valores próximos de zero; leite, açúcar e outros ingredientes contam somente se informados, sem acrescentar ingredientes silenciosamente.
São estimativas da IA, não análise de laboratório nem consulta a banco nutricional. Não diga que consultou USDA, TACO, rótulo ou internet. Não faça avaliação moral da refeição nem prescreva dieta.
EXEMPLOS DE COMPORTAMENTO:
"Comi dois ovos e uma banana" -> salvar uma refeição hoje; estimar o total usando dois ovos e uma banana média, explicando o tamanho presumido.
"Bebi 300 ml de leite integral" -> salvar bebida em Alimentação com a quantidade informada e estimativa total de proteínas/carboidratos.
"Arroz, feijão e frango" -> salvar refeição; estimar porções usuais e listar as três porções presumidas.
"Bebi 500 ml de água" -> salvar bebida com proteínas=0 e carboidratos=0.
"Não comi pão" / "Vou comer frango amanhã" / "Quantas proteínas tem um ovo?" -> responder sem salvar.
Não grave novamente as refeições anteriores ao responder perguntas ou receber um agradecimento.`;
