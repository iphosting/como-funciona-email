# Como funciona o e-mail, em 3D

Uma única cena 3D com duas saídas:

- **Página interativa:** https://como-funciona-email.pages.dev (Cloudflare Pages, projeto `como-funciona-email`, só
  arquivos estáticos).
- **Vídeo narrado:** `out/como-funciona-email.mp4` (1080p) e `out/como-funciona-email-celular.mp4` (720p), na voz do
  Rodrigo.

Pedido do Rodrigo em 20/11/2026: "usando a skill video3d com o fable 5.2 cria uma explicação detalhada de como funciona
um email, o envio, detalhes da entrega, porque usa spf dmark dkim, porque sao devolvidos, ou seja, faca uma skill
completa para um usuario comum entender o funcionamento". Antes de gastar e publicar ele respondeu: voz, "usa o token da
conta rodrigo@iphosting.com.br que esta liberado"; página, "Sim, como-funciona-email.pages.dev". Domínio próprio e DNS
ficaram fora. Feito com a skill `video3d`, a partir do modelo `~/projects/switch-loop-3d`.

## O que mostra

A Ana (`ana@loja.example`) envia um e-mail ao Bruno (`bruno@empresa.example`). A cena tem o computador da Ana, o
servidor de envio com a fila, a placa do DNS, o servidor de destino com o pórtico de conferência (SPF, DKIM, DMARC), a
caixa de entrada e o spam do Bruno, o celular dele e um golpista com servidor próprio.

Nada disso é animação gravada: sai do simulador (`src/sim/sim.ts`), que segue as regras reais.

1. O programa entrega a mensagem ao servidor de envio (porta 587, com senha), que a guarda na fila.
2. O servidor de envio pergunta ao DNS o registro MX do domínio de destino. Domínio inexistente: devolve na hora.
3. Os servidores conversam por SMTP (`MAIL FROM`, `RCPT TO`, `DATA`). 250 é aceite, 4xx é erro temporário, 5xx é
   definitivo.
4. O destino confere SPF (o IP que conectou contra a lista do domínio do ENVELOPE), DKIM (assinatura contra a chave
   pública no DNS, que quebra se o conteúdo for alterado) e DMARC (o domínio aprovado tem de ser o do campo De; a
   política `none`, `quarantine` ou `reject` diz o que fazer com a reprovada).
5. Erro temporário (caixa cheia, servidor fora do ar) volta para a fila e é tentado de novo; esgotadas as tentativas, ou
   diante de erro definitivo (endereço que não existe, recusa por política), o servidor de envio escreve a devolução.

A fraude surge sozinha: sem SPF, DKIM e DMARC a mensagem do golpista com o endereço da Ana no campo De entra na caixa de
entrada. Com os três publicados e DMARC em `reject`, ela é recusada na porta com 550, e a verdadeira continua entrando.
O servidor de destino nunca lê a marca `falsa` da mensagem, que só serve para colorir a cena (há teste para isso).

### Simplificações declaradas

- Os domínios terminam em `.example` e os IPs são de faixas reservadas para documentação: nada aponta para domínio real.
- **Tempo comprimido.** As novas tentativas levam segundos e o servidor desiste depois de 3. Na vida real o intervalo
  vai de minutos a horas e o servidor insiste por 4 a 5 dias (depende do programa). A tela avisa.
- **Caixa cheia** aparece como erro temporário 452. Há provedores que respondem com erro definitivo 552. A narração diz
  "em geral".
- **Sem DMARC e com SPF reprovado**, o simulador manda para o spam. Cada provedor decide isso do seu jeito. A narração
  diz "costuma ir para o spam".
- O destino aplica só as regras publicadas. Provedor grande soma filtro próprio de conteúdo e reputação, que não está
  aqui.
- A cena mostra a mensagem indo até a porta do destino e voltando. Na verdade ela nunca sai da fila: o que viaja é a
  tentativa de entrega.

## Arquivos

- `src/sim/sim.ts` e `src/sim/sim.test.ts`: o simulador e os 17 testes dele (`npm test`).
- `src/three/Cena3D.tsx`: a cena. `src/three/geo.ts`: posições e trajetos.
- `src/campos.ts`: os campos da mensagem aberta (envelope, cabeçalho, conferência).
- `src/tour.ts`: as onze cenas da visita guiada (ações sobre o simulador, câmera) e a legenda. As ações são presas ao
  texto da fala por `F(cena, "trecho")`: mudar a fala não desalinha, e dá erro se o trecho sumir.
- `src/App.tsx`, `src/web.css`: a página (modo livre e visita guiada). `src/Hud.tsx`, `src/estilo.css`: painéis.
- `video/`: a composição do Remotion (`ComoFuncionaEmail`), que desenha a mesma cena quadro a quadro.
- `roteiro.json`: a fala de cada cena (siglas como se pronunciam, números por extenso). `gerar_voz.py`: gera
  `public/audio/<id>.mp3`. `src/duracoes.json`: duração de cada faixa (ffprobe).
- `fotos.mjs`: fotos de conferência do vídeo. `teste_pagina.py`: abre a página num navegador automático, faz o papel
  do golpista, publica as proteções e confere os contadores.

## Como refazer

    npm install
    npm test                                   # simulador
    python3 gerar_voz.py                       # só gera a faixa que faltar; gasta crédito do ElevenLabs
    node fotos.mjs 0.2,0.55,0.95               # fotos de cada cena em out/fotos/
    npm run render                             # out/como-funciona-email.mp4
    ffmpeg -i out/como-funciona-email.mp4 -vf scale=1280:-2 -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart out/como-funciona-email-celular.mp4
    cp out/como-funciona-email-celular.mp4 public/video/
    npm run build && python3 teste_pagina.py   # pacote em dist/ e teste local
    python3 ~/projects/cloudflare/wr-cofre.py pages deploy dist --project-name como-funciona-email --branch main --commit-dirty=true
    python3 teste_pagina.py https://como-funciona-email.pages.dev/

Para mudar a fala de UMA cena: edite `roteiro.json`, apague `public/audio/<id>.mp3`, rode `python3 gerar_voz.py <id>`,
atualize a duração em `src/duracoes.json` e refaça vídeo e página.

O servidor não tem placa de vídeo: o Remotion desenha o 3D por software (`--gl=angle`, já no `remotion.config.ts`).

## Como desfazer a publicação

- Voltar à versão anterior: painel do Cloudflare, Workers e Pages, `como-funciona-email`, Deployments, "Rollback"; ou
  publicar de novo a partir de um commit antigo (`git checkout <commit>`, build e deploy).
- Tirar a página do ar: `python3 ~/projects/cloudflare/wr-cofre.py pages project delete como-funciona-email`. Antes de
  20/11/2026 esse projeto não existia; nada mais foi criado ou alterado na conta (nenhum DNS, nenhuma zona).
- O projeto foi criado com `pages project create como-funciona-email --production-branch main --force`. O `--force` só
  vale na criação (o wrangler tenta levar projeto novo para o Workers).

## Créditos de voz

Conta ElevenLabs rodrigo@iphosting.com.br (a que o Rodrigo mandou usar), voz clonada "Rodrigo Soares"
(`PC8CPd4ONRtNnYABsxPe`), modelo `eleven_v4`, sem `voice_settings`. Antes da geração a conta marcava 0 de 707.541
créditos usados. Gasto: **1.925 créditos**, numa única geração das onze cenas (3.970 caracteres). Nenhuma cena foi
refeita. Detalhe por cena em `public/audio/creditos.json`. Diferença para o modelo `switch-loop-3d`: lá a voz era a
`787u3DByTerXZBjXZezv` da conta soares.iphosting, que não existe nesta conta.

## Conferência

Feita em 20/11/2026:

- `npm test`: 17 testes do simulador passando (caminho normal, consulta MX, conversa SMTP, fraude entrando sem
  proteção, SPF sozinho barrando só o golpista simples, SPF mais DKIM mais DMARC em reject barrando os dois e
  mantendo a entrega da Ana, políticas none e quarantine, mensagem alterada no caminho, DMARC sem SPF nem DKIM
  derrubando o e-mail verdadeiro, endereço e domínio inexistentes, caixa cheia com novas tentativas, servidor fora do
  ar).
- `npx tsc --noEmit` sem erro.
- Vídeo: 283,2 s (4 min 43 s), H.264 yuv420p 1920x1080 a 30 fps, AAC, 42,1 MB; versão celular 1280x720, 20,2 MB.
  Três fotos por cena antes do render (duas rodadas de acerto de câmera e tempo) e dois quadros por cena tirados do
  MP4 (`out/quadros-mp4.jpg`), todos olhados. Render completo: cerca de 10 minutos neste servidor, por software.
- Página publicada: `python3 teste_pagina.py https://como-funciona-email.pages.dev/` com resultado ok em desktop
  (1440x900) e celular (390x844): a mensagem da Ana chega, a falsa entra sem proteção, as duas falsas são barradas
  com SPF, DKIM e DMARC em reject, o endereço errado gera devolução, a mensagem abre, a visita guiada toca a narração,
  nenhum erro no console. A primeira tentativa, segundos depois do primeiro deploy, não achou a cena (projeto novo
  ainda propagando); a segunda passou.
- Voz: as onze faixas foram transcritas com whisper (modelo base) e estão completas e na ordem. O whisper não serve
  para conferir pronúncia: "ipHosting" (abertura e fechamento) e "mandar para o spam" (cena do DMARC, que ele
  transcreveu como "SPF") só o ouvido do Rodrigo confirma.
- Entrega: vídeo de 1080p enviado pelo Telegram (message_id 11091) e link da página em seguida.

Limitações conhecidas: em celular em pé a cena fica pequena (ela é larga), e a página avisa para virar o aparelho. O
vídeo ficou com 4 min 43 s, acima dos 4 minutos do modelo, porque o pedido foi de explicação detalhada (onze cenas).
