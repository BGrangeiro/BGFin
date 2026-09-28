# Instalar o Persona na VPS

O pacote usa uma VPS Linux com Docker Engine e Docker Compose v2, um domínio apontando para ela e as portas 80/443 livres. O aplicativo, o proxy HTTPS e o serviço de backups reiniciam automaticamente com o Docker. Não é necessário instalar Node.js ou um servidor de banco separado na VPS.

Os dados atuais pertencem a **Bruno**. **Ana** tem seu próprio banco. Os logins existentes continuam funcionando, sem distinguir maiúsculas/minúsculas. Para acesso público, prefira trocar as senhas curtas por senhas longas com o comando descrito abaixo.

## 1. Preparar e enviar os arquivos

No computador onde estão os registros atuais, execute:

```powershell
npm run package:vps
```

O comando gera `dist/persona-vps-DATA.tar.gz`, incluindo código, instruções, hashes das contas e cópias verificadas dos dois bancos. Ele usa o backup online do SQLite; não copia os arquivos `-wal`/`-shm` em uso. A cópia representa os dados naquele momento. Faça a última geração antes de começar a usar a VPS, para evitar registros novos ficarem apenas no computador antigo.

Envie o arquivo por SFTP ou SCP à VPS. Exemplo (substitua arquivo, usuário e IP):

```powershell
scp "dist/persona-vps-DATA.tar.gz" usuario@IP_DA_VPS:/tmp/
```

**O pacote contém dados pessoais. Não envie para GitHub nem coloque em uma pasta pública do site.** Os bancos não entram na imagem Docker, e a aplicação só serve os arquivos públicos explicitamente autorizados.

Na VPS, instale o [Docker Engine](https://docs.docker.com/engine/install/) com o [plugin Compose](https://docs.docker.com/compose/install/linux/), se ainda não estiverem instalados. Habilite o serviço para iniciar após reiniciar a VPS:

```sh
sudo systemctl enable --now docker
docker compose version
```

Para a **primeira instalação**, crie uma pasta vazia e extraia o pacote:

```sh
sudo mkdir -p /opt/persona
sudo tar -xzf /tmp/persona-vps-DATA.tar.gz -C /opt/persona --strip-components=1
cd /opt/persona
sudo cp .env.example .env
sudo nano .env
```

Não extraia um pacote antigo com a pasta `data` por cima de uma instalação em uso. Para atualizar, use a seção de atualização abaixo.

## 2. Definir o domínio e iniciar

Preencha `.env`:

```dotenv
DOMAIN=persona.seudominio.com.br
ACME_EMAIL=seu-email@exemplo.com
BACKUP_INTERVAL_HOURS=6
BACKUP_KEEP=120
```

Em `DOMAIN`, informe apenas o nome: sem `https://`, sem caminho e sem barra final. Configure o registro DNS **A** para o IPv4 da VPS; só mantenha **AAAA** se o IPv6 também funcionar. Libere 80/TCP e 443/TCP no firewall e no painel do provedor, preservando a porta SSH. Não publique a porta 3000 do aplicativo. O Caddy recebe o acesso externo e encaminha para o contêiner privado.

```sh
cd /opt/persona
sudo sh deploy/setup.sh
```

O script prepara as permissões das pastas, preserva bancos e contas existentes, constrói a imagem, valida o Caddyfile e inicia os serviços. Abra `https://persona.seudominio.com.br`. O Caddy emite e renova o certificado quando DNS e portas estiverem corretos, conforme sua [documentação de HTTPS automático](https://caddyserver.com/docs/automatic-https).

Se você começar só com o código, sem os bancos do pacote, os bancos serão criados automaticamente. Nesse caso Bruno também começará sem seus registros antigos.

## Onde cada coisa fica

| Caminho na VPS | Conteúdo |
| --- | --- |
| `/opt/persona/data/saldo.sqlite` | Dados de Bruno |
| `/opt/persona/data/saldo-ana.sqlite` | Dados de Ana |
| `/opt/persona/backups/` | Cópias verificadas dos dois bancos |
| `/opt/persona/secrets/accounts.json` | Usuários e hashes das senhas |
| `/opt/persona/.env` | Domínio e frequência dos backups |
| Volumes Docker `caddy_data` e `caddy_config` | Certificados e configuração do Caddy |

Os bancos são montados a partir de pastas da VPS. Recriar a imagem, reiniciar os contêineres ou reiniciar a VPS não apaga essas pastas. Cada gravação usa transações SQLite, WAL e sincronização FULL. Use uma única instância do aplicativo e disco local; não monte o banco em NFS ou entre várias máquinas.

As sessões exigem novo login após reiniciar o aplicativo. Os registros ficam preservados. Não remova `data/`, `backups/`, `secrets/` ou os volumes do Caddy ao atualizar.

## Backups automáticos e cópia fora da VPS

O serviço `backup` gera uma cópia ao iniciar e a cada 6 horas. Guarda as últimas 120 cópias completas (aproximadamente 30 dias na frequência padrão). Cada cópia tem os dois bancos, verificação de integridade e um manifesto SHA-256. As cópias incompletas não são consideradas válidas. Falhas encerram o serviço com erro, para o Docker reiniciá-lo; o healthcheck indica se a última cópia está atrasada.

Verifique periodicamente o estado e os logs:

```sh
cd /opt/persona
sudo docker compose ps
sudo docker compose logs --tail=80 app backup caddy
sudo docker compose exec -T backup node scripts/backup.js --check
```

Para uma cópia manual:

```sh
sudo docker compose exec -T app node scripts/backup.js
```

**A persistência e os backups na mesma VPS não protegem contra perda do disco ou exclusão da VPS.** Copie regularmente as pastas `backups` e `secrets` para outro computador/servidor por SFTP/SSH ou use backup externo do provedor. O destino externo depende de onde você quer guardar os arquivos; não há envio a terceiros configurado neste projeto.

No computador local, um administrador com acesso SSH pode baixar as cópias:

```powershell
scp -r root@IP_DA_VPS:/opt/persona/backups ./copia-vps-backups
scp -r root@IP_DA_VPS:/opt/persona/secrets ./copia-vps-contas
```

Se a VPS usa outro usuário, utilize SFTP com as permissões administrativas apropriadas. Guarde as cópias em local privado e teste a restauração antes de depender delas. Cada pessoa também pode exportar seu próprio JSON em **Dados e backup**; ele não inclui a outra conta.

## Restaurar uma cópia dos dois bancos

Este procedimento substitui os registros pelos da cópia escolhida. O script verifica os dois bancos antes da troca e cria uma cópia do estado anterior. Pare os dois serviços que abrem o SQLite; o script recusa arquivos com WAL/SHM ativos.

```sh
cd /opt/persona
sudo docker compose stop app backup
sudo docker compose run --rm --no-deps app node scripts/restore.js /backups/NOME_DA_PASTA --confirm
sudo docker compose up -d --wait
```

Escolha uma pasta completa, com `bruno.sqlite`, `ana.sqlite` e `manifest.json`. Se o comando falhar, leia o erro antes de prosseguir. Os backups SQLite restauram as duas contas; o botão de restauração JSON dentro do site restaura somente a conta conectada.

## Atualizar sem perder registros

1. Gere uma cópia manual pelo comando acima.
2. Atualize apenas código e configuração: `server.js`, `lib`, `public`, `scripts`, `deploy`, `package.json`, `Dockerfile` e `compose.yaml`. Preserve `.env`, `data`, `backups` e `secrets`. Um `git pull` em uma instalação criada com Git não deve incluir esses arquivos privados.
3. Reconstrua e recrie os serviços:

```sh
cd /opt/persona
sudo docker compose build --pull app
sudo docker compose up -d --wait --wait-timeout 180
sudo docker compose ps
```

O código atualiza o esquema do banco ao iniciar. Guarde o backup anterior à atualização para poder recuperar também os dados caso seja necessário voltar a uma versão antiga do código.

## Alterar a senha de uma conta

O comando pede a nova senha sem mostrá-la no terminal e mantém o mesmo usuário e banco. Execute uma vez para cada conta que quiser alterar:

```sh
cd /opt/persona
sudo docker run --rm -it --network none --user 1000:1000 \
  --mount "type=bind,src=/opt/persona/secrets,dst=/secrets" \
  persona:local node scripts/accounts.js /secrets/accounts.json
sudo docker compose restart app
```

A senha nova exige pelo menos 12 caracteres; maiúsculas e minúsculas continuam equivalentes, conforme a configuração solicitada. As sessões existentes terminam no reinício. Guarde uma cópia atualizada de `secrets` fora da VPS.

## Conferências e problemas comuns

- Login que volta à tela inicial: use sempre o domínio HTTPS de `.env`; cookies de produção têm `Secure`. Não use HTTP ou o IP diretamente para entrar.
- Erro de origem/host: confira `DOMAIN` e recrie os serviços com `docker compose up -d` após editar `.env`.
- HTTPS não inicia: confira DNS, portas, conflito com Apache/Nginx e os logs de `caddy`. Este modelo supõe acesso direto à VPS; um CDN ou outro proxy exige ajustar a confiança no proxy antes de usá-lo.
- Banco sem permissão: rode novamente `sudo sh deploy/setup.sh`; os serviços usam UID/GID 1000, e as pastas privadas ficam com acesso restrito.
- Serviço unhealthy: leia os logs. O Docker reinicia processos que terminam, mas não reinicia automaticamente um processo só por ficar unhealthy.

O aplicativo mantém a porta 3000 apenas dentro da rede Docker, valida o domínio e a origem configurados e recebe o IP do cliente de um cabeçalho sobrescrito pelo Caddy. O endereço encaminhado só é aceito quando `TRUST_PROXY=1` e a conexão vem de uma rede privada. Não exponha esse backend diretamente. O comportamento do proxy está descrito na [documentação do Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).
