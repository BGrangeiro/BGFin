# BGFIN

Um sistema pessoal de finanças com interface em português, valores em reais e banco de dados SQLite. Funciona localmente, sem cadastro ou dependências de npm. Apenas o versículo diário consulta um serviço público externo; os dados financeiros permanecem no computador.

## Executar

Instale o **Node.js 24 ou superior**. Na pasta do projeto:

```sh
npm start
```

Abra **http://127.0.0.1:3000**. No Windows, você também pode dar dois cliques em **iniciar.bat**. Mantenha a janela do servidor aberta durante o uso; `Ctrl+C` encerra o servidor.

Não é necessário executar `npm install`. Para desenvolvimento com reinício automático do servidor: `npm run dev`. Atualize o navegador após editar os arquivos da interface.

## Recursos

- Dashboard por mês com entradas, saídas, saldo, contas pendentes, gráfico acumulado e distribuição por categoria.
- Cadastro, edição e exclusão de ganhos e gastos, com data, categoria e observação.
- Busca textual e filtros por tipo e categoria.
- Dívidas com credor, valor total, valor pago antes do cadastro, prazo opcional, categoria e observações.
- Pagamentos parciais de dívidas com histórico, saldo restante, progresso de quitação e aviso de atraso.
- Versículo diário em português, consultado na Bible API, com seleção local em caso de indisponibilidade.
- Contas fixas mensais, com data de início, vencimento e indicação de atraso.
- Pagamento de conta fixa gera uma saída automaticamente, uma única vez por conta/mês.
- Desfazer pagamento remove a saída e torna a conta pendente de novo.
- Insights calculados a partir dos registros: contas vencidas e projeção após os compromissos pendentes. Não usa IA externa nem envia dados financeiros.
- Backup JSON com todos os meses e restauração validada e atômica.
- Layout responsivo e botão para ocultar visualmente os valores.

## Como os valores funcionam

O **saldo do mês** é o total de entradas menos as saídas datadas naquele mês. Não é saldo bancário e não carrega saldos de meses anteriores. Lançamentos com data futura no mês também entram no total; registre apenas valores que deseja incluir na sua visão mensal.

As **contas a pagar** são recorrências ainda sem pagamento no mês selecionado. Não são descontadas nas saídas até serem marcadas como pagas. A **previsão de saldo** desconta essas pendências do saldo mensal. Uma conta é considerada atrasada quando seu vencimento é anterior à data local do computador e não existe pagamento registrado.

O pagamento deve ter uma data dentro do mês selecionado. Para pagar outro mês, selecione-o primeiro. Vencimentos nos dias 29, 30 ou 31 se ajustam ao último dia de meses mais curtos. Editar uma conta muda todas as ocorrências em aberto, inclusive passadas; os lançamentos de pagamentos já feitos mantêm seus valores. Excluir uma conta remove sua recorrência de todos os meses, preservando as saídas já registradas.

Valores são armazenados como **centavos inteiros**, evitando erros de ponto flutuante. Exemplo: R$ 123,45 é armazenado como `12345`. No formulário, digite `123,45` ou `1.234,56`.

## Dívidas

A aba **Dívidas**, acima de Contas fixas, mostra todos os registros, independentemente do mês. Cadastre o valor total e o valor pago antes do cadastro; este último reduz o saldo restante sem criar lançamentos antigos. O prazo final é opcional. O total deve incluir os encargos negociados; o sistema não calcula juros automaticamente.

Use **Pagar** para registrar cada novo pagamento. Ele gera uma saída na data escolhida e reduz o saldo da dívida. O histórico permite desfazer pagamentos, removendo a saída correspondente. Editar um pagamento em Movimentações também recalcula a dívida. Valores superiores ao saldo restante são rejeitados. A dívida aparece como quitada quando o saldo chega a zero.

Excluir uma dívida preserva as saídas já registradas. Dívidas em aberto não são abatidas automaticamente da previsão mensal; somente os pagamentos entram nas saídas, evitando descontar o valor inteiro de uma dívida em cada mês.

## Versículo do dia

O servidor consulta [Bible API](https://bible-api.com/), na tradução João Ferreira de Almeida, de domínio público. A seleção alterna diariamente entre 14 referências de incentivo, usando a data local do computador, e se repete após esse ciclo. A resposta fica em cache durante o dia; a referência permanece igual após recarregar ou reiniciar. A página verifica a mudança do dia automaticamente.

A consulta tem limite de cinco segundos e não envia registros financeiros. Se o serviço não responder ou devolver dados inválidos, o sistema usa um texto local e informa isso na tela. A consulta externa volta a ser tentada no dia seguinte ou após reiniciar o servidor.

## Dados e backup

O banco é criado automaticamente em `data/saldo.sqlite`. Os arquivos auxiliares `-wal` e `-shm` podem existir enquanto o servidor está aberto.

Use **Dados e backup → Baixar backup** para guardar ou transferir os dados. A restauração substitui os registros atuais somente após validar o arquivo inteiro. Guarde uma cópia antes de restaurar. Para copiar o SQLite manualmente, encerre o servidor antes; não copie apenas o arquivo principal enquanto houver gravações em andamento.

Backups da versão 2 incluem dívidas e seus pagamentos. Backups antigos da versão 1 continuam aceitos; como não contêm dívidas, restaurá-los também remove as dívidas atuais. A atualização do banco existente cria as novas estruturas automaticamente e preserva seus lançamentos e contas fixas.

O `.gitignore` exclui bancos, a pasta `data`, arquivos `.env` e logs. **Não envie backups financeiros para um repositório público.** O código pode ser versionado sem os seus dados.

## Estrutura

```text
public/             Interface HTML, CSS, JavaScript e favicon
lib/database.js     Persistência, validações e regras financeiras
lib/verse.js        Seleção diária, consulta pública e alternativa local
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

Dívidas abre em **Dívidas do mês**, com opção de **Dívidas totais**. Ao cadastrar ou editar uma dívida, informe opcionalmente o valor da parcela, o dia de vencimento e o primeiro mês. O cadastro não cria saídas: cada pagamento registrado gera uma saída e reduz o saldo total. Pagamentos parciais reduzem a parcela em aberto; a última parcela fica limitada ao saldo restante. O histórico dos meses já pagos continua disponível. Dívidas anteriores à atualização ficam sem parcela até que o usuário informe esse valor ao editar. Alterar os dados da parcela recalcula a previsão dos meses; os pagamentos registrados são preservados.

Novo lançamento abre com Entrada selecionada. A categoria aceita texto livre e o botão + permite escolher as categorias existentes, incluindo as personalizadas já usadas. Últimas movimentações aparece primeiro; os gráficos de pizza ficam no fim. O versículo aparece abaixo de Contas fixas no menu em telas grandes e abaixo dos vencimentos na visão geral em telas menores.

O backup atual é versão 3 e inclui os campos das parcelas; a restauração também aceita versões 1 e 2 com dados válidos. A atualização mantém as dívidas e os lançamentos existentes.
