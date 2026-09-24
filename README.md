# Persona

Um espaço pessoal de finanças, tarefas e anotações, com interface em português, paleta roxa e banco de dados SQLite. Funciona localmente, sem cadastro ou dependências de npm. O quiz de aprendizagem consulta um serviço público externo; suas finanças e anotações permanecem no computador.

## Executar

Instale o **Node.js 24 ou superior**. Na pasta do projeto:

```sh
npm start
```

Abra **http://127.0.0.1:3000**. No Windows, você também pode dar dois cliques em **iniciar.bat**. Mantenha a janela do servidor aberta durante o uso; `Ctrl+C` encerra o servidor.

Não é necessário executar `npm install`. Para desenvolvimento com reinício automático do servidor: `npm run dev`. Atualize o navegador após editar os arquivos da interface.

## Recursos

- Abas **Finanças**, **Investimentos** e **Anotações** para alternar entre os painéis.
- Carteira de investimentos com aportes, resgates, ganhos, perdas, taxas, notas e planejamento de revisões.
- Tarefas e lembretes em quadro **A fazer → Fazendo → Feito**, visualização em lista e caderno de anotações livres.
- Dia planejado, prazo final, horário de lembrete, prioridades, categorias, checklist e registros fixados no topo.
- Busca no título, conteúdo, categoria e checklist; filtros por hoje, próximos sete dias, atrasadas, prioridade e categoria.
- Dashboard por mês com entradas, saídas, saldo, total mensal de contas fixas, contas pendentes, gráfico acumulado e distribuição por categoria.
- Cadastro, edição e exclusão de ganhos e gastos, com data, categoria e observação.
- Busca textual e filtros por tipo e categoria.
- Dívidas com credor, valor total, valor pago antes do cadastro, prazo opcional, categoria e observações.
- Pagamentos parciais de dívidas com histórico, saldo restante, progresso de quitação e aviso de atraso.
- Quiz de conhecimentos gerais em inglês, com alternativas e resposta correta, consultado gratuitamente na Open Trivia DB.
- Contas fixas mensais, com data de início, vencimento e indicação de atraso.
- Pagamento de conta fixa gera uma saída automaticamente, uma única vez por conta/mês.
- Desfazer pagamento remove a saída e torna a conta pendente de novo.
- Insights calculados a partir dos registros: contas vencidas e saldo das movimentações registradas. Não usa IA externa nem envia dados financeiros.
- Backup JSON com todos os meses e restauração validada e atômica.
- Layout responsivo e botão para ocultar visualmente os valores.

## Investimentos

Use **Adicionar investimento** para cadastrar o nome, tipo, instituição, código/ticker, data inicial e aporte inicial opcional. A carteira aceita investimentos anteriores ao início dos períodos financeiros, a partir de 2000. Todos os valores são informados manualmente em reais; não há integração com corretoras ou cotações automáticas.

- Cada investimento tem notas próprias para estratégia, objetivo, taxas contratadas, quantidade de cotas ou outras particularidades. Informe também a liquidez, o vencimento e a data para revisar ou movimentar novamente.
- Em **Ver investimento**, registre **Aporte**, **Resgate**, **Registrar ganho**, **Registrar perda** ou **Taxa / imposto**, sempre com valor, data e observação opcional. É possível editar e excluir registros pelo histórico. Valores são armazenados em centavos inteiros.
- **Saldo atual = aportes + ganhos − resgates − perdas − taxas/impostos. Resultado acumulado = ganhos − perdas − taxas/impostos.** O total aplicado soma todos os aportes, inclusive valores já resgatados. Os resumos da carteira incluem ativos e encerrados e não mudam com os filtros dos cartões.
- Ganhos e perdas são variações de valor, não o saldo completo: se R$ 1.000 passaram a R$ 1.050, registre um ganho de R$ 50. Ganhos permanecem no saldo; para um rendimento recebido fora do investimento, registre o ganho e o respectivo resgate. Taxas/impostos representam descontos do próprio investimento; não os lance novamente se o ganho registrado já estiver líquido.
- Novas movimentações não podem ter data futura. A data de revisão serve para planejamento. O sistema impede alterações que deixem saldo negativo em qualquer ponto do histórico; movimentos do mesmo dia seguem a ordem de cadastro. Para corrigir um aporte do qual depende um resgate, ajuste primeiro o resgate.
- **Próximos passos** mostra revisões e vencimentos pendentes e dos próximos sete dias. A navegação exibe a quantidade de investimentos que precisam de atenção hoje ou antes. Esses avisos aparecem no sistema, sem notificações com a página fechada. Após revisar, atualize ou limpe a data de revisão.
- A situação **Encerrado** exige saldo zero e mantém o histórico e o resultado. Reabra em **Editar investimento** para alterar suas movimentações. Excluir um investimento remove também seu histórico, após confirmação.
- A carteira é independente do saldo mensal: seus registros não geram entradas ou saídas na aba Movimentações. Para registrar o fluxo de caixa mensal, faça o lançamento correspondente em Finanças.
- O backup **v5** inclui os investimentos, notas e históricos. A restauração valida todos os dados antes de substituir qualquer registro. Backups v1–v4 preservam os investimentos existentes; um v5 com carteira vazia remove explicitamente a carteira atual.

## Anotações e planejamento

Use a aba **Anotações** para criar **Nova tarefa**, **Novo lembrete** ou **Nova anotação**. Tarefas e lembretes aparecem em **Quadro** e **Lista**; anotações livres ficam no **Caderno**. Não há dados de exemplo adicionados ao banco pessoal.

- **Dia que vou fazer** é a data planejada; **Prazo final** é o limite de entrega. O prazo não pode ser anterior ao dia planejado. Essas datas seguem o calendário e são independentes dos períodos financeiros.
- Mude o status no cartão ou use **Concluir**. **Reabrir** devolve a tarefa a **A fazer**, mantendo seus detalhes e checklist. Concluir a tarefa não marca automaticamente os passos do checklist.
- O checklist aceita um passo por linha, até 50 itens. Marque os passos no cartão. Ao editar, passos com o mesmo texto mantêm a marcação, mesmo quando reordenados.
- O alfinete fixa registros no topo. Depois dos fixados, a ordem considera o prazo, a prioridade e a atualização.
- **Hoje** inclui tarefas abertas com dia planejado, prazo ou lembrete hoje. **Próximos 7 dias** inclui hoje e os seis dias seguintes. **Atrasadas** considera apenas prazos anteriores a hoje, excluindo tarefas concluídas.
- Lembretes usam data e horário locais do computador. O aviso aparece no painel de anotações a partir do horário escolhido; a página verifica a cada 15 segundos enquanto visível. Se a plataforma estiver fechada, o lembrete pendente aparece no próximo acesso. **Não há notificação do sistema com o navegador fechado.** Marcar o aviso como visto não conclui a tarefa; alterar seu horário permite um novo aviso.
- Os registros são gravados no SQLite ao salvar; status, checklist e fixação salvam imediatamente. Fechar sem salvar um formulário descarta as alterações desse formulário. O conteúdo das anotações é texto simples.

A organização foi inspirada em [quadros Kanban — Atlassian](https://www.atlassian.com/agile/kanban/boards/), [limites de trabalho em andamento — Atlassian](https://www.atlassian.com/agile/kanban/wip-limits/) e [captura e organização pelo GTD — Todoist](https://www.todoist.com/productivity-methods/getting-things-done). As referências também ficam em **Ideias para se organizar**, no rodapé do painel. Elas são sugestões de uso; o sistema não impõe limites de tarefas.

O armazenamento e a API de anotações estão separados das regras financeiras para facilitar uma futura versão em aplicativo. A versão atual continua local.

## Como os valores funcionam

O **saldo do mês** é o total de entradas menos as saídas datadas naquele mês. Não é saldo bancário e não carrega saldos de meses anteriores. Lançamentos com data futura no mês também entram no total; registre apenas valores que deseja incluir na sua visão mensal.

O cartão **Contas fixas mensais** mostra a soma dos valores mensais cadastrados para o período selecionado, incluindo contas pagas e pendentes. Esse total continua aparecendo após os pagamentos e se repete nos meses seguintes. As **contas a pagar** são recorrências ainda sem pagamento no mês selecionado. Cadastrar uma conta não desconta do saldo nem cria uma saída; isso só acontece ao marcar como paga. O painel exibe o saldo das movimentações registradas, sem descontar antecipadamente as contas pendentes. Uma conta é considerada atrasada quando seu vencimento é anterior à data local do computador e não existe pagamento registrado.

O pagamento deve ter uma data dentro do mês selecionado. Para pagar outro mês, selecione-o primeiro. Vencimentos nos dias 29, 30 ou 31 se ajustam ao último dia de meses mais curtos. Editar uma conta muda todas as ocorrências em aberto, inclusive passadas; os lançamentos de pagamentos já feitos mantêm seus valores. Excluir uma conta remove sua recorrência de todos os meses, preservando as saídas já registradas.

Valores são armazenados como **centavos inteiros**, evitando erros de ponto flutuante. Exemplo: R$ 123,45 é armazenado como `12345`. No formulário, digite `123,45` ou `1.234,56`.

## Dívidas

A aba **Dívidas**, acima de Contas fixas, mostra todos os registros, independentemente do mês. Escolha fixa ou parcelada e cadastre o valor total. Na parcelada, informe a primeira e a última parcela para calcular os valores e a quantidade restante. O valor pago antes do cadastro reduz o saldo sem criar lançamentos antigos e pode ser corrigido. Na fixa, o vencimento é opcional. O total deve incluir os encargos negociados; o sistema não calcula juros automaticamente.

Use **Pagar** para registrar cada novo pagamento. Ele gera uma saída na data escolhida e reduz o saldo da dívida. O histórico permite desfazer pagamentos, removendo a saída correspondente. Editar um pagamento em Movimentações também recalcula a dívida. Valores superiores ao saldo restante são rejeitados. A dívida aparece como quitada quando o saldo chega a zero.

Excluir uma dívida preserva as saídas já registradas. Dívidas em aberto não são abatidas automaticamente da previsão mensal; somente os pagamentos entram nas saídas, evitando descontar o valor inteiro de uma dívida em cada mês.

## Pausa para aprender

O quiz substitui o versículo na interface e usa a [Open Trivia DB](https://opentdb.com/api_config.php), uma API gratuita, sem cadastro ou chave. As perguntas e alternativas são em inglês. Ao escolher uma alternativa, o cartão indica a resposta correta; **Outra pergunta** avança no lote.

O servidor busca 20 perguntas e mantém o lote em cache por dez minutos. Ao terminar o lote durante esse período, as perguntas podem se repetir. A consulta tem limite de oito segundos e não envia registros pessoais. Se o serviço falhar, o cartão oferece **Tentar novamente**, com intervalo de 30 segundos entre novas consultas externas. Os dados usam a licença [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), com atribuição no cartão. O endpoint antigo de versículo permanece disponível por compatibilidade, mas não é consultado pela interface.

## Dados e backup

O banco é criado automaticamente em `data/saldo.sqlite`. Os arquivos auxiliares `-wal` e `-shm` podem existir enquanto o servidor está aberto.

Use **Dados e backup → Baixar backup** para guardar ou transferir os dados. A restauração substitui os registros atuais somente após validar o arquivo inteiro. Guarde uma cópia antes de restaurar. Para copiar o SQLite manualmente, encerre o servidor antes; não copie apenas o arquivo principal enquanto houver gravações em andamento.

Backups da versão 2 incluem dívidas e seus pagamentos. Backups antigos da versão 1 continuam aceitos; como não contêm dívidas, restaurá-los também remove as dívidas atuais. A atualização do banco existente cria as novas estruturas automaticamente e preserva seus lançamentos e contas fixas.

O `.gitignore` exclui bancos, a pasta `data`, arquivos `.env` e logs. **Não envie backups financeiros para um repositório público.** O código pode ser versionado sem os seus dados.

## Estrutura

```text
public/             Interface HTML, CSS, JavaScript e favicon
lib/database.js     Persistência, validações e regras financeiras
lib/notes.js        Persistência e validação de anotações
lib/quiz.js         Perguntas da Open Trivia DB, validação e cache
lib/verse.js        Endpoint legado de versículo
server.js           Servidor HTTP local e API JSON
test/               Testes das regras e da API
data/               SQLite local (ignorado pelo Git)
iniciar.bat         Inicialização no Windows
```

Não há etapa de build. Os arquivos estáticos são servidos diretamente pelo Node.js. O projeto não depende de CDNs e funciona sem conexão à internet depois de instalar o Node.js.

## Verificação

```sh
npm run check
npm test
```

Os testes usam bancos isolados e verificam cálculos em centavos, recorrência, anos bissextos, pagamentos duplicados, edição, exclusão, restauração, persistência e segurança da API. Não alteram o banco pessoal.

## Configuração opcional

Variáveis de ambiente:

| Variável | Padrão | Finalidade |
| --- | --- | --- |
| `PORT` | `3000` | Porta do servidor local |
| `DB_PATH` | `data/saldo.sqlite` | Caminho do banco; prefira um caminho absoluto |

Exemplo no PowerShell:

```powershell
$env:PORT = '3001'
npm start
```

## GitHub e publicação futura

Este projeto está preparado para versionamento no GitHub, mas **GitHub Pages não executa o servidor Node.js ou o banco SQLite**. Para publicar o sistema, será necessário um servidor com Node.js e armazenamento persistente, ou adaptar a camada de persistência para um banco gerenciado.

A versão atual escuta apenas em `127.0.0.1`, aceita hosts locais e bloqueia requisições vindas de outra origem. Não possui login: é uma ferramenta para uso pessoal neste computador. Antes de expor na internet, implemente autenticação, isolamento de dados por usuário se necessário, HTTPS, configuração explícita de hosts/origens e backups automáticos. Não basta mudar o endereço de escuta para tornar esta versão adequada a acesso público.

Para colocar o código no GitHub, crie um repositório e siga as instruções do GitHub para enviar esta pasta. Nenhum repositório remoto foi criado ou publicado automaticamente.


## Atualização: períodos e parcelas

O primeiro período disponível é setembro de 2026, de 10/09 a 10/10. Depois disso, cada período começa no dia 11 e termina no dia 10 do mês seguinte. A seleção inicial acompanha o período atual; meses anteriores a setembro de 2026 são bloqueados. Os lançamentos e os pagamentos de contas fixas usam esse mesmo intervalo. Vencimentos entre os dias 1 e 10 ficam no mês seguinte do calendário.

Dívidas abre em **Dívidas totais**, com opção de **Dívidas do mês**. As datas da primeira e da última parcela definem o calendário mensal e os valores calculados. O cadastro não cria saídas: cada pagamento registrado gera uma saída e reduz o saldo total. Pagamentos são aplicados às parcelas mais antigas em aberto, incluindo pagamentos parciais. Após a última data não são criadas novas parcelas; as atrasadas continuam visíveis na agenda e no saldo total. Alterar os dados recalcula as parcelas; os pagamentos registrados são preservados. Dívidas antigas mantêm o calendário anterior até que suas novas datas sejam confirmadas ao editar.

Novo lançamento abre com Entrada selecionada. A categoria aceita texto livre e o botão + permite escolher as categorias existentes, incluindo as personalizadas já usadas. Últimas movimentações aparece primeiro; os gráficos de pizza ficam no fim. O quiz aparece abaixo de Contas fixas no menu em telas grandes e abaixo dos vencimentos na visão geral em telas menores.

O backup atual é versão 8 e inclui tipo, cor e datas das dívidas, além de parcelas, tarefas, lembretes, anotações, checklists, investimentos com histórico e todas as abas de Pessoal. A versão 6 também substitui Pessoal na restauração; versões anteriores preservam essa área. A restauração de um v5 substitui essas áreas em uma única transação, depois de validar tudo. Um v4 substitui finanças e anotações, preservando investimentos. As versões 1, 2 e 3 substituem apenas os dados financeiros, preservando anotações e investimentos atuais. A atualização do banco mantém os registros existentes.

## Espaço Pessoal

A aba **Pessoal** reúne áreas criadas pelo usuário. **Assinaturas** já vem disponível e permite cadastrar nome, valor em reais por cobrança, frequência (mensal, anual, semanal ou sem recorrência), próximo vencimento, situação e observações. Os resumos de cobranças mensais e anuais somam apenas as assinaturas ativas da frequência indicada, sem misturar ciclos.

Use **Criar nova aba** para organizar outros assuntos da vida pessoal. Nas abas criadas, você pode adicionar registros com título, observações, valor e data opcionais, além de renomear ou excluir a aba. Excluir uma aba solicita confirmação e remove seus registros. A aba inicial Assinaturas é fixa.

Datas de registros ativos em Pessoal aparecem na Visão geral quando chegam ou ficam pendentes. Atualize manualmente o próximo vencimento da assinatura após a renovação, ou marque-a como inativa quando cancelar. O cadastro não cria lançamentos nem desconta valores em Finanças.

Os dados ficam no SQLite local (`personal_tabs` e `personal_items`). O backup versão 6 inclui todas as abas e registros pessoais, além das demais áreas. Backups das versões anteriores continuam aceitos e preservam os dados de Pessoal existentes; a restauração da versão 6 substitui também essa área, após validar os registros e seus vínculos.


## Filmes e Estudos em Pessoal

- **Filmes pra ver** tem formulário próprio com nome, observações e pasta opcional. O botão no cartão alterna entre Não assistido (amarelo) e Assistido (verde). Filmes assistidos mostram Minha resenha, com salvamento no próprio cartão. Voltar a Não assistido preserva a resenha.
- A busca de filmes pesquisa nome, observações e resenha, sem distinguir maiúsculas ou acentos. Há também filtro de assistidos e não assistidos.
- **Estudos** permite assunto, prazo para começar, prazo para terminar, observações e vários links adicionados com +. Os links de vídeo/artigo abrem em outra aba. Marque **Prazo indefinido para terminar** para estudar sem data final; o cartão mostra **Indefinido** e essa escolha é preservada ao editar e no backup. Quando houver data final, ela não pode ser anterior ao início.
- Ambas as áreas oferecem Painel geral (registros mais recentes primeiro) e Pastas. O seletor Pasta do cartão move o registro diretamente. É possível criar e renomear pastas; excluir uma pasta preserva seus registros em Sem pasta. As pastas de Filmes e Estudos são independentes.
- A atualização identifica a aba existente Filmes pra ver e preserva IDs, nomes e observações. Assinaturas continua com o formulário financeiro existente. Filmes e Estudos não mostram campos ou cartões de gastos.
- O backup v7 inclui tipos de aba, pastas, resenhas, estado assistido, prazos e links. A restauração valida os vínculos das pastas antes de substituir dados. Backups v6 continuam aceitos.

## Cadastro de dívidas

- Escolha **Dívida fixa** (um valor sem parcelas, com vencimento opcional) ou **Dívida parcelada**.
- Para a parcelada, informe o valor total e as datas da primeira e da última parcela. O sistema conta uma parcela por mês, incluindo os extremos, e mostra quantidade total, parcelas restantes, valor por parcela e saldo. Em meses curtos, o dia é ajustado para o último dia válido; a data da última parcela é respeitada exatamente.
- No cadastro, as parcelas anteriores a hoje preenchem automaticamente **Pago antes do cadastro**. Corrija esse valor se houver parcelas atrasadas. A estimativa é salva uma vez e não cria saídas; os próximos pagamentos são registrados pelo botão **Pagar**. Edição e estorno recalculam as parcelas restantes.
- Valores são distribuídos em centavos, com diferença máxima de R$ 0,01 entre parcelas quando o total não divide igualmente.
- Escolha uma cor personalizada ou uma das sugestões. Ela aparece em uma faixa fina nos cartões das duas visões de dívidas e é preservada ao editar e restaurar o backup.
- Dívidas existentes mantêm os valores e pagamentos. Ao editar uma parcelada antiga, confira as datas sugeridas antes de salvar. Backups das versões 1 a 7 continuam aceitos.
