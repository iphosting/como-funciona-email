// Simulador do caminho de um e-mail. Sem nada visual aqui: só as regras.
// Regras reais que ele segue:
//  1. o programa de e-mail entrega a mensagem ao servidor de envio do remetente (porta 587, com senha);
//     o servidor guarda numa fila e passa a ser o responsável por ela;
//  2. o servidor de envio pergunta ao DNS qual servidor recebe e-mail do domínio de destino (registro MX);
//  3. os dois servidores conversam por SMTP (porta 25): MAIL FROM, RCPT TO, DATA. Cada resposta tem um
//     código: 2xx aceito, 4xx erro temporário (tenta de novo), 5xx erro definitivo (devolve);
//  4. o servidor de destino confere SPF (o IP que conectou está na lista publicada pelo domínio do
//     ENVELOPE?), DKIM (a assinatura confere com a chave pública no DNS?) e DMARC (o domínio aprovado é o
//     mesmo do campo "De"? se não, o que o dono mandou fazer: nada, quarentena ou recusar);
//  5. erro temporário volta para a fila e é tentado de novo; esgotadas as tentativas, ou diante de erro
//     definitivo, o servidor de envio escreve uma mensagem de devolução para o remetente.
// O servidor de destino NUNCA olha o campo `falsa`: ele só serve para colorir a cena. A mensagem forjada
// entra na caixa de entrada sozinha quando o domínio não publica proteção, e para de entrar quando publica.

export type Politica = "ausente" | "none" | "quarantine" | "reject";
export type Tipo = "email" | "devolucao" | "consulta" | "resposta" | "aviso";
export type Trecho =
  | "ana>envio"
  | "envio>dns"
  | "dns>envio"
  | "envio>destino"
  | "destino>envio"
  | "destino>dns"
  | "dns>destino"
  | "golpista>destino"
  | "destino>golpista"
  | "destino>caixa"
  | "destino>spam"
  | "caixa>bruno"
  | "envio>ana";
export type Estado = "voando" | "fila" | "porta";
export type Nota = "pass" | "fail" | "none";
export type Acao = "entrada" | "spam" | "recusar";

export const DOM_LOJA = "loja.example";
export const DOM_EMPRESA = "empresa.example";
export const DOM_GOLPE = "golpe.example";
export const IP_ENVIO = "203.0.113.10";
export const IP_DESTINO = "192.0.2.25";
export const IP_GOLPE = "198.51.100.66";
export const ANA = "ana@loja.example";
export const BRUNO = "bruno@empresa.example";
export const HOST_ENVIO = "mail.loja.example";
export const HOST_MX = "mx.empresa.example";

/** Duração de cada trecho, em segundos de simulação (câmera lenta: na vida real são milissegundos). */
export const DUR: Record<Trecho, number> = {
  "ana>envio": 1.6,
  "envio>dns": 0.9,
  "dns>envio": 0.9,
  "envio>destino": 2.4,
  "destino>envio": 1.8,
  "destino>dns": 0.9,
  "dns>destino": 0.9,
  "golpista>destino": 2.6,
  "destino>golpista": 2.0,
  "destino>caixa": 1.0,
  "destino>spam": 1.0,
  "caixa>bruno": 0.9,
  "envio>ana": 1.6,
};
const T_PROC = 0.5;
const T_RCPT = 0.7;
const T_VEREDITO = 0.5;
/** Espera entre as tentativas, em segundos de simulação. Na vida real são minutos e depois horas. */
export const ESPERAS = [2.5, 4];
/** Tentativas antes de desistir. Na vida real o servidor insiste por 4 a 5 dias (depende do programa). */
export const MAX_TENT = 3;

export interface Resultado {
  spf: Nota;
  dkim: Nota;
  dmarc: Nota;
  /** O SPF passou E o domínio do envelope é o mesmo do campo "De". */
  spfAlinhado: boolean;
  /** O DKIM passou E o domínio da assinatura é o mesmo do campo "De". */
  dkimAlinhado: boolean;
  politica: Politica;
  acao: Acao;
  explicacao: string;
}

export interface Msg {
  id: number;
  tipo: Tipo;
  /** Campo "De" do cabeçalho: o que o destinatário vê. */
  de: string;
  /** Remetente do envelope (MAIL FROM): o que os servidores usam. */
  envDe: string;
  para: string;
  /** IP do servidor que entrega a mensagem ao destino. */
  ip: string;
  assunto: string;
  /** Assinatura DKIM: domínio que assinou e se o conteúdo ainda é o que foi assinado. */
  dkim?: { d: string; integra: boolean };
  /** Só para colorir a cena. Nenhuma decisão do simulador lê este campo. */
  falsa: boolean;
  origem: "envio" | "golpista";
  trecho: Trecho;
  u: number;
  estado: Estado;
  fase?: "processando" | "mx" | "espera" | "rcpt" | "dns" | "veredito";
  /** Instante em que a fase atual termina. */
  proxima: number;
  tentativas: number;
  /** Erro com que a mensagem está voltando. */
  retorno?: "temp" | "perm";
  codigo?: string;
  motivo?: string;
  resultado?: Resultado;
  /** Consulta e resposta de DNS: mensagem que está esperando por ela, e o texto. */
  pai?: number;
  texto?: string;
}

export interface Entregue {
  id: number;
  de: string;
  assunto: string;
  falsa: boolean;
  t: number;
}

export interface Fala {
  t: number;
  /** C = quem envia, S = quem recebe, i = informação. */
  quem: "C" | "S" | "i";
  txt: string;
  cor: string;
}

export interface Sim {
  t: number;
  /** O que o domínio loja.example publica no DNS. */
  dns: { spf: boolean; dkim: boolean; dmarc: Politica };
  destino: { noAr: boolean; cheia: boolean };
  /** Fila do servidor de envio congelada: a mensagem aceita espera sem seguir viagem. */
  filaParada: boolean;
  msgs: Msg[];
  proxId: number;
  caixa: Entregue[];
  spam: Entregue[];
  ana: { enviadas: number; devolucoes: { t: number; codigo: string; motivo: string; para: string }[] };
  bruno: { vistas: number };
  conversa: Fala[];
  ultimo?: { t: number; de: string; envDe: string; ip: string; falsa: boolean; r: Resultado; fim: string };
  cont: {
    entregues: number;
    noSpam: number;
    falsasNaCaixa: number;
    falsasBarradas: number;
    devolvidas: number;
    novasTentativas: number;
    consultasDns: number;
  };
}

export const criarSim = (): Sim => ({
  t: 0,
  dns: { spf: false, dkim: false, dmarc: "ausente" },
  destino: { noAr: true, cheia: false },
  filaParada: false,
  msgs: [],
  proxId: 1,
  caixa: [],
  spam: [],
  ana: { enviadas: 0, devolucoes: [] },
  bruno: { vistas: 0 },
  conversa: [],
  cont: { entregues: 0, noSpam: 0, falsasNaCaixa: 0, falsasBarradas: 0, devolvidas: 0, novasTentativas: 0, consultasDns: 0 },
});

export const COR_FALA = { c: "#93c5fd", ok: "#6ee7b7", temp: "#fcd34d", erro: "#fca5a5", info: "#a9bbdc", dns: "#fde047" };

const dizer = (s: Sim, quem: Fala["quem"], txt: string, cor: string) => {
  s.conversa.push({ t: s.t, quem, txt, cor });
  if (s.conversa.length > 40) s.conversa.splice(0, s.conversa.length - 40);
};

export const dominio = (endereco: string) => endereco.split("@")[1] ?? "";

/** Toda mensagem nova nasce voando, no começo do trecho (mesmo quando copia os dados de outra). */
const nova = (s: Sim, m: Omit<Msg, "id" | "u" | "tentativas" | "proxima" | "estado"> & Partial<Pick<Msg, "tentativas" | "proxima" | "estado" | "u" | "id">>): Msg => {
  const f: Msg = { tentativas: 0, proxima: 0, ...m, u: 0, estado: "voando", id: s.proxId++ };
  s.msgs.push(f);
  return f;
};

const tirar = (s: Sim, m: Msg) => {
  const i = s.msgs.indexOf(m);
  if (i >= 0) s.msgs.splice(i, 1);
};

// ---------- O que o domínio publica e o estado do destino ----------

export const publicar = (s: Sim, qual: "spf" | "dkim", ligado: boolean) => {
  if (s.dns[qual] === ligado) return;
  s.dns[qual] = ligado;
  const nome = qual === "spf" ? "SPF" : "DKIM";
  dizer(s, "i", ligado ? `${DOM_LOJA} publicou ${nome} no DNS` : `${DOM_LOJA} tirou o ${nome} do DNS`, ligado ? COR_FALA.ok : COR_FALA.erro);
};

export const definirDmarc = (s: Sim, p: Politica) => {
  if (s.dns.dmarc === p) return;
  s.dns.dmarc = p;
  dizer(s, "i", p === "ausente" ? `${DOM_LOJA} tirou o DMARC do DNS` : `${DOM_LOJA} publicou DMARC com p=${p}`, p === "ausente" ? COR_FALA.erro : COR_FALA.ok);
};

export const definirCaixaCheia = (s: Sim, cheia: boolean) => {
  if (s.destino.cheia === cheia) return;
  s.destino.cheia = cheia;
  dizer(s, "i", cheia ? "A caixa do Bruno encheu" : "O Bruno esvaziou a caixa", cheia ? COR_FALA.temp : COR_FALA.ok);
};

export const definirNoAr = (s: Sim, noAr: boolean) => {
  if (s.destino.noAr === noAr) return;
  s.destino.noAr = noAr;
  dizer(s, "i", noAr ? "O servidor do Bruno voltou ao ar" : "O servidor do Bruno saiu do ar", noAr ? COR_FALA.ok : COR_FALA.erro);
};

export const textoSpf = (s: Sim) => (s.dns.spf ? `v=spf1 ip4:${IP_ENVIO} -all` : "");
export const textoDkim = (s: Sim) => (s.dns.dkim ? "v=DKIM1; k=rsa; p=MIIBIjANBg..." : "");
export const textoDmarc = (s: Sim) => (s.dns.dmarc === "ausente" ? "" : `v=DMARC1; p=${s.dns.dmarc}; rua=mailto:dmarc@${DOM_LOJA}`);

// ---------- Quem envia ----------

/** A Ana aperta "enviar": o programa entrega a mensagem ao servidor de envio dela. */
export const enviar = (s: Sim, o: { para?: string; assunto?: string } = {}) => {
  s.ana.enviadas++;
  const m = nova(s, { tipo: "email", de: ANA, envDe: ANA, para: o.para ?? BRUNO, ip: IP_ENVIO, assunto: o.assunto ?? "Orçamento das flores", falsa: false, origem: "envio", trecho: "ana>envio" });
  dizer(s, "i", `Ana aperta enviar: para ${m.para}`, COR_FALA.info);
  return m;
};

/**
 * O golpista envia do servidor dele, escrevendo o endereço da Ana no campo "De".
 * simples: usa o endereço da Ana também no envelope. esperto: usa no envelope um domínio dele mesmo,
 * com SPF e DKIM válidos PARA O DOMÍNIO DELE.
 */
export const enviarFalso = (s: Sim, modo: "simples" | "esperto" = "simples") => {
  const m = nova(s, {
    tipo: "email",
    de: ANA,
    envDe: modo === "simples" ? ANA : `cobranca@${DOM_GOLPE}`,
    para: BRUNO,
    ip: IP_GOLPE,
    assunto: "Boleto atualizado",
    dkim: modo === "esperto" ? { d: DOM_GOLPE, integra: true } : undefined,
    falsa: true,
    origem: "golpista",
    trecho: "golpista>destino",
  });
  dizer(s, "i", modo === "simples" ? "Golpista envia fingindo ser a Ana" : "Golpista envia com envelope do domínio dele", COR_FALA.erro);
  return m;
};

/** Alguém altera o conteúdo de uma mensagem assinada que está a caminho. Devolve true se alterou. */
export const adulterar = (s: Sim) => {
  const m = s.msgs.find((x) => x.tipo === "email" && x.dkim && x.dkim.integra && x.trecho === "envio>destino" && x.estado === "voando");
  if (!m || !m.dkim) return false;
  m.dkim.integra = false;
  m.assunto += " (alterada)";
  dizer(s, "i", "Mensagem alterada no caminho: a assinatura deixa de conferir", COR_FALA.erro);
  return true;
};

// ---------- A conferência no destino ----------

/** SPF, DKIM e DMARC de uma mensagem, com o DNS como está agora. Não lê `falsa`. */
export const avaliar = (s: Sim, m: Pick<Msg, "de" | "envDe" | "ip" | "dkim">): Resultado => {
  const dEnv = dominio(m.envDe);
  const dDe = dominio(m.de);

  let spf: Nota = "none";
  if (dEnv === DOM_LOJA) spf = s.dns.spf ? (m.ip === IP_ENVIO ? "pass" : "fail") : "none";
  else if (dEnv === DOM_GOLPE) spf = m.ip === IP_GOLPE ? "pass" : "fail";

  let dkim: Nota = "none";
  if (m.dkim) {
    const chavePublicada = m.dkim.d === DOM_LOJA ? s.dns.dkim : m.dkim.d === DOM_GOLPE;
    dkim = chavePublicada && m.dkim.integra ? "pass" : "fail";
  }

  const spfAlinhado = spf === "pass" && dEnv === dDe;
  const dkimAlinhado = dkim === "pass" && !!m.dkim && m.dkim.d === dDe;
  const politica: Politica = dDe === DOM_LOJA ? s.dns.dmarc : "ausente";
  const dmarc: Nota = politica === "ausente" ? "none" : spfAlinhado || dkimAlinhado ? "pass" : "fail";

  let acao: Acao = "entrada";
  let explicacao: string;
  if (dmarc === "fail") {
    acao = politica === "reject" ? "recusar" : politica === "quarantine" ? "spam" : "entrada";
    explicacao =
      politica === "reject"
        ? `Nem SPF nem DKIM aprovam ${dDe}: o DMARC manda recusar`
        : politica === "quarantine"
          ? `Nem SPF nem DKIM aprovam ${dDe}: o DMARC manda para o spam`
          : `Reprovada no DMARC, mas a política é "none": só relatório, entrega normal`;
  } else if (dmarc === "pass") {
    explicacao = `Aprovada: ${dkimAlinhado ? "assinatura DKIM" : "SPF"} de ${dDe} confere com o campo De`;
  } else if (spf === "fail") {
    acao = "spam";
    explicacao = "Sem DMARC. O IP não está na lista SPF: vai para o spam como suspeita";
  } else {
    explicacao = `${dDe} não publica DMARC: nada manda conferir o campo De, a mensagem entra`;
  }
  return { spf, dkim, dmarc, spfAlinhado, dkimAlinhado, politica, acao, explicacao };
};

// ---------- Andamento ----------

const devolver = (s: Sim, m: Msg, codigo: string, motivo: string) => {
  tirar(s, m);
  nova(s, { tipo: "devolucao", de: `mailer-daemon@${DOM_LOJA}`, envDe: "", para: m.de, ip: IP_ENVIO, assunto: "Mensagem não entregue", falsa: false, origem: "envio", trecho: "envio>ana", codigo, motivo, texto: m.para });
  dizer(s, "i", `Servidor de envio escreve a devolução para a Ana: ${motivo}`, COR_FALA.erro);
};

const recusar = (s: Sim, m: Msg, tipo: "temp" | "perm", codigo: string, motivo: string) => {
  m.retorno = tipo;
  m.codigo = codigo;
  m.motivo = motivo;
  m.estado = "voando";
  m.fase = undefined;
  m.u = 0;
  m.trecho = m.origem === "envio" ? "destino>envio" : "destino>golpista";
  if (codigo) dizer(s, "S", `${codigo} ${motivo}`, tipo === "temp" ? COR_FALA.temp : COR_FALA.erro);
  else dizer(s, "i", motivo, COR_FALA.temp);
};

/** A mensagem chegou à porta do servidor de destino. */
const baterNaPorta = (s: Sim, m: Msg) => {
  if (!s.destino.noAr) {
    recusar(s, m, "temp", "", "Sem resposta do servidor de destino (fora do ar)");
    return;
  }
  m.estado = "porta";
  m.fase = "rcpt";
  m.proxima = s.t + T_RCPT;
  m.u = 1;
  dizer(s, "S", `220 ${HOST_MX} pronto`, COR_FALA.ok);
  dizer(s, "C", `EHLO ${m.origem === "envio" ? HOST_ENVIO : "servidor.golpe.example"}  (IP ${m.ip})`, COR_FALA.c);
  dizer(s, "C", `MAIL FROM:<${m.envDe}>`, COR_FALA.c);
  dizer(s, "C", `RCPT TO:<${m.para}>`, COR_FALA.c);
};

const decidir = (s: Sim, m: Msg) => {
  const r = avaliar(s, m);
  m.resultado = r;
  let fim: string;
  if (r.acao === "recusar") {
    fim = "Recusada na porta (550)";
    if (m.falsa) s.cont.falsasBarradas++;
    s.ultimo = { t: s.t, de: m.de, envDe: m.envDe, ip: m.ip, falsa: m.falsa, r, fim };
    recusar(s, m, "perm", "550 5.7.1", "Recusada pela política DMARC do domínio");
    return;
  }
  if (s.destino.cheia) {
    fim = "Caixa cheia: tente mais tarde (452)";
    s.ultimo = { t: s.t, de: m.de, envDe: m.envDe, ip: m.ip, falsa: m.falsa, r, fim };
    recusar(s, m, "temp", "452 4.2.2", "Caixa do destinatário cheia, tente mais tarde");
    return;
  }
  fim = r.acao === "spam" ? "Aceita (250), mas guardada no spam" : "Aceita (250): caixa de entrada";
  s.ultimo = { t: s.t, de: m.de, envDe: m.envDe, ip: m.ip, falsa: m.falsa, r, fim };
  dizer(s, "C", "DATA  (cabeçalho e corpo da mensagem)", COR_FALA.c);
  dizer(s, "S", "250 2.0.0 OK: mensagem aceita", COR_FALA.ok);
  m.estado = "voando";
  m.fase = undefined;
  m.u = 0;
  m.trecho = r.acao === "spam" ? "destino>spam" : "destino>caixa";
};

const chegou = (s: Sim, m: Msg) => {
  switch (m.trecho) {
    case "ana>envio":
      // o servidor conferiu usuário e senha da Ana, assina (se o domínio usa DKIM) e põe na fila
      dizer(s, "i", `Servidor de envio aceitou (porta 587, senha conferida): mensagem na fila`, COR_FALA.ok);
      if (s.dns.dkim) {
        m.dkim = { d: DOM_LOJA, integra: true };
        dizer(s, "i", `Servidor de envio assinou a mensagem (DKIM, d=${DOM_LOJA})`, COR_FALA.ok);
      }
      m.estado = "fila";
      m.fase = "processando";
      m.proxima = s.t + T_PROC;
      return;
    case "envio>dns":
    case "destino>dns": {
      s.cont.consultasDns++;
      const pai = s.msgs.find((x) => x.id === m.pai);
      tirar(s, m);
      if (!pai) return;
      let texto: string;
      if (m.trecho === "envio>dns") {
        const d = dominio(pai.para);
        texto = d === DOM_EMPRESA ? `MX de ${d} = ${HOST_MX} (${IP_DESTINO})` : `${d}: domínio não existe`;
      } else {
        const d = dominio(pai.de);
        texto = d === DOM_LOJA ? `${d}: SPF ${s.dns.spf ? "sim" : "não"}, DKIM ${s.dns.dkim ? "sim" : "não"}, DMARC ${s.dns.dmarc === "ausente" ? "não" : "p=" + s.dns.dmarc}` : `${d}: registros lidos`;
      }
      dizer(s, "i", `DNS responde: ${texto}`, COR_FALA.dns);
      nova(s, { ...m, tipo: "resposta", trecho: m.trecho === "envio>dns" ? "dns>envio" : "dns>destino", texto });
      return;
    }
    case "dns>envio": {
      const pai = s.msgs.find((x) => x.id === m.pai);
      tirar(s, m);
      if (!pai) return;
      if (dominio(pai.para) !== DOM_EMPRESA) {
        devolver(s, pai, "550 5.1.2", `o domínio ${dominio(pai.para)} não existe`);
        return;
      }
      pai.estado = "voando";
      pai.fase = undefined;
      pai.trecho = "envio>destino";
      pai.u = 0;
      return;
    }
    case "dns>destino": {
      const pai = s.msgs.find((x) => x.id === m.pai);
      tirar(s, m);
      if (!pai) return;
      pai.fase = "veredito";
      pai.proxima = s.t + T_VEREDITO;
      return;
    }
    case "envio>destino":
    case "golpista>destino":
      baterNaPorta(s, m);
      return;
    case "destino>envio":
      if (m.retorno === "perm") {
        devolver(s, m, m.codigo ?? "550", m.motivo ?? "recusada pelo destino");
        return;
      }
      m.tentativas++;
      if (m.tentativas >= MAX_TENT) {
        devolver(s, m, m.codigo || "4.4.7", `desistiu depois de ${m.tentativas} tentativas (${(m.motivo ?? "").toLowerCase()})`);
        return;
      }
      s.cont.novasTentativas++;
      m.estado = "fila";
      m.fase = "espera";
      m.proxima = s.t + ESPERAS[Math.min(ESPERAS.length - 1, m.tentativas - 1)];
      m.u = 0;
      dizer(s, "i", `Erro temporário: volta para a fila e tenta de novo (tentativa ${m.tentativas + 1} de ${MAX_TENT})`, COR_FALA.temp);
      return;
    case "destino>golpista":
      tirar(s, m);
      return;
    case "destino>caixa":
      tirar(s, m);
      s.caixa.push({ id: m.id, de: m.de, assunto: m.assunto, falsa: m.falsa, t: s.t });
      if (m.falsa) s.cont.falsasNaCaixa++;
      else s.cont.entregues++;
      nova(s, { ...m, tipo: "aviso", trecho: "caixa>bruno", retorno: undefined });
      return;
    case "destino>spam":
      tirar(s, m);
      s.spam.push({ id: m.id, de: m.de, assunto: m.assunto, falsa: m.falsa, t: s.t });
      s.cont.noSpam++;
      if (m.falsa) s.cont.falsasBarradas++;
      return;
    case "caixa>bruno":
      tirar(s, m);
      s.bruno.vistas++;
      return;
    case "envio>ana":
      tirar(s, m);
      s.ana.devolucoes.push({ t: s.t, codigo: m.codigo ?? "", motivo: m.motivo ?? "", para: m.texto ?? "" });
      s.cont.devolvidas++;
      return;
  }
};

/** Fim de uma fase parada (na fila ou na porta). */
const venceu = (s: Sim, m: Msg) => {
  switch (m.fase) {
    case "processando":
      // precisa descobrir qual servidor recebe e-mail do domínio de destino
      m.fase = "mx";
      dizer(s, "i", `Servidor de envio pergunta ao DNS: quem recebe e-mail de ${dominio(m.para)}?`, COR_FALA.dns);
      nova(s, { ...m, tipo: "consulta", trecho: "envio>dns", pai: m.id, texto: `MX de ${dominio(m.para)}?`, fase: undefined });
      return;
    case "espera":
      dizer(s, "i", `Nova tentativa de entrega (${m.tentativas + 1} de ${MAX_TENT})`, COR_FALA.temp);
      m.estado = "voando";
      m.fase = undefined;
      m.retorno = undefined;
      m.trecho = "envio>destino";
      m.u = 0;
      return;
    case "rcpt":
      if (m.para !== BRUNO) {
        recusar(s, m, "perm", "550 5.1.1", "Usuário desconhecido: esse endereço não existe");
        return;
      }
      dizer(s, "S", "250 OK, destinatário existe", COR_FALA.ok);
      m.fase = "dns";
      dizer(s, "i", `Servidor de destino pergunta ao DNS o que ${dominio(m.de)} publica`, COR_FALA.dns);
      nova(s, { ...m, tipo: "consulta", trecho: "destino>dns", pai: m.id, texto: `SPF, DKIM e DMARC de ${dominio(m.de)}?`, fase: undefined });
      return;
    case "veredito":
      decidir(s, m);
      return;
  }
};

/** Avança a simulação em `dt` segundos. */
export const passo = (s: Sim, dt: number) => {
  s.t += dt;
  for (const m of [...s.msgs]) {
    if (!s.msgs.includes(m)) continue;
    if (m.estado === "voando") {
      m.u += dt / DUR[m.trecho];
      if (m.u >= 1) chegou(s, m);
    } else if ((m.fase === "processando" || m.fase === "espera" || m.fase === "rcpt" || m.fase === "veredito") && s.t >= m.proxima) {
      if (s.filaParada && m.estado === "fila") continue;
      venceu(s, m);
    }
  }
};

/** Mensagens paradas na fila do servidor de envio. */
export const naFila = (s: Sim) => s.msgs.filter((m) => m.estado === "fila");
/** Mensagem que está sendo conferida na porta do destino. */
export const naPorta = (s: Sim) => s.msgs.filter((m) => m.estado === "porta");
/** A fraude está passando: há mensagem falsa na caixa de entrada do Bruno. */
export const emFraude = (s: Sim) => s.cont.falsasNaCaixa > 0;
/** As três proteções publicadas, com a política mais forte. */
export const protegido = (s: Sim) => s.dns.spf && s.dns.dkim && s.dns.dmarc === "reject";
