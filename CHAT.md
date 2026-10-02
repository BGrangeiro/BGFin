# Chat do Persona

O botão **Assistente**, no canto inferior direito, abre o chat em qualquer aba. O histórico é salvo no SQLite da pessoa conectada, separado entre Bruno e Ana. As últimas 50 conversas aparecem na tela; o backup JSON v14 e os backups SQLite incluem o histórico completo e os comprovantes dos cadastros. Backups v13 continuam aceitos.

## Consultar e cadastrar em todo o Persona

Com a IA ativa, use **Conversar** para consultar registros e cadastrar:

- Entradas, despesas, contas fixas, dívidas fixas ou parceladas e registros de pagamentos já realizados.
- Investimentos e movimentações do histórico (aporte, resgate, ganho, perda ou taxa). São registros do Persona, sem operações bancárias reais.
- Anotações, tarefas, lembretes e itens de checklist.
- Abas pessoais, pastas, assinaturas, filmes, estudos e itens de abas personalizadas.
- Perguntas e comentários de revisão em estudos existentes; treinos, exercícios e refeições.
- Horários no cronograma: padrão semanal ou alteração de uma data. Os horários existentes são preservados e ordenados.

Exemplos: `Registre R$ 35,50 de mercado hoje`, `Crie a tarefa comprar pão para amanhã`, `Adicione ao estudo Inglês a pergunta Hello? com a resposta Olá`, `Inclua estudar na próxima segunda das 9h às 10h, como padrão semanal` e `Quanto gastei hoje?`.

Se faltar um valor, horário ou destino necessário, o assistente pede os detalhes. Um pedido aceita até 12 cadastros, salvos juntos: se algum falhar, nenhum deles fica parcialmente salvo. Reenvios da mesma solicitação não duplicam registros. O chat só confirma ações depois de gravar e mostra **Abrir registro**. A IA pode fazer uma tentativa de corrigir dados recusados pela validação; falhas mantêm os dados anteriores.

Consultas são restritas à conta conectada e podem ter resultados limitados, indicados à IA. Pedidos de cadastro não permitem apagar ou substituir registros existentes. As ações de perguntas, comentários, exercícios, checklist e horários acrescentam conteúdo. Edições e exclusões continuam pelos formulários.

## Alimentação automática e estimativas com IA

Com a IA ativa, basta escrever o que comeu ou bebeu no modo **Conversar**: `Comi dois ovos e uma banana`, `Bebi 300 ml de leite integral` ou `Arroz, feijão e frango`. Não precisa pedir para registrar. Uma refeição por mensagem é salva na alimentação da sua conta, com o total estimado de **proteínas e carboidratos em gramas**.

O assistente recebe instruções permanentes e exemplos em cada conversa; isso não é treinamento de um novo modelo. Quando faltam quantidades, usa porções comuns e mostra **Porção presumida**. Quantidades informadas têm prioridade. Água pura fica com zero para ambos. Perguntas, compras, negações e planos de refeições futuras não são registros de consumo.

As estimativas são geradas pela IA, sem consulta a uma base nutricional, e podem variar conforme porção e preparo. Os valores e as porções aparecem no chat e no cartão de Alimentação e ficam salvos no banco e nos backups. É possível corrigi-los no editor da refeição. Ao alterar os alimentos sem atualizar a estimativa, os valores antigos são removidos. Refeições anteriores continuam sem estimativa até receberem valores; não há cálculo retroativo automático.

O botão **Ditar** usa o reconhecimento de voz do navegador em português. Revise o texto e clique em **Enviar**: a mesma regra de registro se aplica ao texto ditado. Alguns navegadores não oferecem esse recurso; nesses casos, use o ditado do teclado. O reconhecimento pode enviar áudio ao serviço do navegador, como explicado junto ao botão. O Persona envia apenas o texto à Groq. Na VPS, use HTTPS para permitir microfone. Não há gravação de áudio no banco do Persona.

## Registro local, sem IA

Por padrão, o chat indica **Modo local · sem IA**. Esse modo usa regras simples para registrar alimentação; não é um modelo de linguagem nem responde livremente a perguntas.

- Escreva `Hoje almocei arroz, feijão e 150 g de frango às 12:30`. O sistema registra a refeição na alimentação da sua conta e mostra o resultado no chat.
- Ou selecione **Anotar refeição** e escreva `Banana e iogurte`. A data padrão é hoje, e o horário fica vazio se você não o informar.
- Datas aceitas no texto: hoje, ontem, anteontem, `dd/mm/aaaa`, `dd/mm` (ano atual) e `aaaa-mm-dd`. Horários: `12:30`, `7h30` ou `às 8`.
- Registre uma refeição por mensagem. O modo local preserva o texto informado na descrição, sem calcular calorias ou nutrientes. Para frases com datas ambíguas, use uma data explícita.
- **Ver em Alimentação** abre o dia do registro, onde você pode editar ou excluir normalmente.
- O reenvio de uma mesma solicitação após falha de conexão não cria outra refeição. Mensagens novas, mesmo iguais, são novos pedidos.

## Ativar a IA depois com a Groq

A Groq oferece uma API de chat com cota gratuita e limites por conta/modelo. É necessário criar sua própria chave. Consulte os [limites atuais](https://console.groq.com/docs/rate-limits) e o [guia oficial](https://console.groq.com/docs/quickstart). Esta integração não cria conta, não contrata plano e não habilita cobrança.

O caminho mais simples é pelo próprio sistema:

1. Abra **Assistente → Ativar IA com minha chave**.
2. Use **Criar uma chave na Groq** e copie a chave criada na sua conta.
3. Cole no campo protegido do Persona e clique em **Testar e ativar IA**.

O Persona faz uma chamada real com uma mensagem de teste, sem enviar seu histórico. Só salva a configuração quando recebe uma resposta válida. Depois, o cabeçalho passa a mostrar **IA · Groq** e a conversa livre fica disponível imediatamente, sem reiniciar o servidor. Falhas preservam a configuração anterior.

A configuração é individual: a chave cadastrada por Bruno não ativa a conta de Ana. Ela fica em `data/ai-config/bruno.json` ou `data/ai-config/ana.json` (ao lado do banco se `DB_PATH` for diferente), com acesso restrito no servidor. Não entra no SQLite, no backup JSON, nos snapshots SQLite nem no pacote da VPS. Ela persiste ao reiniciar o servidor e fica no volume de dados na VPS; ao migrar, configure a chave novamente. O arquivo contém a chave e deve ser protegido como segredo. A configuração feita na tela tem prioridade sobre as variáveis de ambiente abaixo.

Para desativar, abra **Configurar IA → Usar somente o registro sem IA**. Isso remove a chave salva para aquela conta.

Como alternativa, o administrador pode configurar uma chave compartilhada pelo ambiente do servidor:

1. Crie uma chave no painel da Groq.
2. Se ainda não existir, copie `.env.example` para `.env`. Preserve os valores já configurados para a VPS.
3. Ajuste estas variáveis no arquivo `.env` do servidor:

```dotenv
AI_PROVIDER=groq
AI_MODEL=openai/gpt-oss-120b
GROQ_API_KEY=coloque_sua_chave_aqui
```

4. Localmente, reinicie com `npm start` ou `iniciar.bat`. Na VPS, recrie o serviço para aplicar o ambiente:

```sh
docker compose up -d --build app
```

O chat passará a mostrar **IA · Groq**. O modelo padrão é hospedado pela Groq; não exige assinatura do ChatGPT. A configuração do modelo pode ser trocada por outro que suporte [saída JSON com esquema estrito](https://console.groq.com/docs/structured-outputs). Os modelos disponíveis e limites podem mudar.

Se `AI_PROVIDER=groq` estiver sem chave, o modo local continua disponível. Chave recusada, cota esgotada, respostas inválidas e falhas de conexão são mostradas no chat. Nessas falhas, nenhum novo registro é salvo. Para voltar às regras locais, defina `AI_PROVIDER=local` e reinicie.

## Dados enviados e ações

Com a IA ativa, a Groq recebe a mensagem atual, a data local, parte do histórico, nomes das abas/pastas e os registros consultados para atender ao pedido. Isso pode incluir finanças, anotações, treinos e demais dados da conta conectada. O sistema não envia a chave como conteúdo, arquivos do computador ou registros da outra conta. As consultas têm limites de tamanho e filtros; não há envio do banco inteiro. O aviso aparece no próprio chat. Em modo local, as mensagens não saem do servidor do Persona.

A chave fica somente na configuração do servidor após o cadastro: a API nunca a devolve ao navegador, inclui no histórico ou exporta nos backups do aplicativo. O campo é limpo após ativar ou fechar o chat. `.env` e `data/` são ignorados pelo Git; o pacote da VPS inclui somente os bancos, sem as configurações da IA. Ao migrar de servidor, configure a chave novamente.

A IA propõe consultas e cadastros de uma lista definida. O servidor valida campos e permissões usando as mesmas regras dos formulários, e salva os cadastros e comprovantes na mesma transação. O modelo não recebe SQL, ferramentas para executar código, alterar chaves, acessar outras contas ou excluir registros. Respostas são exibidas como texto, sem executar HTML. Há limite de 12 mensagens por minuto por conta e uma solicitação em andamento por pessoa; consultas e correções podem usar mais de uma chamada à Groq e consumir a cota da API.

Backups anteriores à versão 13 preservam o histórico atual, mas removem os vínculos de mensagens com refeições substituídas na restauração. Um backup v13 restaura o histórico e seus vínculos em conjunto.
