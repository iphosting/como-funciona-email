// O que há dentro de uma mensagem de e-mail: o envelope (que os servidores leem) e o cabeçalho (que a
// pessoa vê), com os campos reais, mais o resultado das três conferências.
import { ANA, BRUNO, DOM_GOLPE, IP_ENVIO, IP_GOLPE, type Msg, type Nota, type Resultado } from "./sim/sim";

export interface Campo {
  nome: string;
  valor: string;
  nota: string;
  /** Largura relativa do bloco na cena. */
  larg: number;
  cor: string;
}

export interface Fileira {
  titulo: string;
  cor: string;
  campos: Campo[];
  /** 0 = escondida, 1 = visível. */
  a: number;
}

type Dados = Pick<Msg, "de" | "envDe" | "para" | "ip" | "assunto" | "dkim" | "tipo">;

const AZUL = "#3b82f6";
const LARANJA = "#f59e0b";
const ROXO = "#a78bfa";
const CIANO = "#22d3ee";
const VERDE = "#34d399";
const VERMELHO = "#ef4444";
const CINZA = "#64748b";

export const envelope = (m: Dados, cor = AZUL): Campo[] => [
  { nome: "MAIL FROM (remetente do envelope)", valor: m.envDe || "<> (vazio)", nota: m.envDe ? "para onde volta a devolução" : "devolução não gera devolução", larg: 5.0, cor },
  { nome: "RCPT TO (destinatário)", valor: m.para, nota: "a caixa que vai receber", larg: 4.6, cor: LARANJA },
  { nome: "IP de quem entrega", valor: m.ip, nota: m.ip === IP_ENVIO ? "servidor de envio da Ana" : m.ip === IP_GOLPE ? "servidor do golpista" : "", larg: 4.2, cor: ROXO },
];

export const cabecalho = (m: Dados, corDe = CIANO): Campo[] => [
  { nome: "De", valor: m.de, nota: "o que aparece para você", larg: 3.7, cor: corDe },
  { nome: "Para", valor: m.para, nota: "", larg: 3.7, cor: LARANJA },
  { nome: "Assunto", valor: m.assunto, nota: "", larg: 3.1, cor: ROXO },
  m.dkim
    ? { nome: "DKIM-Signature (lacre)", valor: "d=" + m.dkim.d, nota: m.dkim.integra ? "assinatura do servidor" : "conteúdo alterado", larg: 3.3, cor: m.dkim.integra ? VERDE : VERMELHO }
    : { nome: "DKIM-Signature (lacre)", valor: "não tem", nota: "mensagem sem assinatura", larg: 3.3, cor: CINZA },
];

const nota = (n: Nota, passou: string, falhou: string, sem: string) => (n === "pass" ? passou : n === "fail" ? falhou : sem);
const corNota = (n: Nota) => (n === "pass" ? VERDE : n === "fail" ? VERMELHO : CINZA);

export const conferencia = (r: Resultado): Campo[] => [
  { nome: "SPF (o IP pode enviar?)", valor: nota(r.spf, "passou", "falhou", "sem registro"), nota: r.spf === "pass" && !r.spfAlinhado ? "mas de outro domínio" : "confere o envelope", larg: 3.4, cor: corNota(r.spf) },
  { nome: "DKIM (o lacre confere?)", valor: nota(r.dkim, "passou", "falhou", "sem assinatura"), nota: r.dkim === "pass" && !r.dkimAlinhado ? "mas de outro domínio" : "confere a assinatura", larg: 3.4, cor: corNota(r.dkim) },
  { nome: "DMARC (bate com o De?)", valor: nota(r.dmarc, "passou", "falhou", "sem política"), nota: r.politica === "ausente" ? "domínio não publica" : "ordem: p=" + r.politica, larg: 3.4, cor: corNota(r.dmarc) },
  { nome: "Decisão", valor: r.acao === "entrada" ? "caixa de entrada" : r.acao === "spam" ? "spam" : "recusada (550)", nota: "", larg: 3.6, cor: r.acao === "entrada" ? VERDE : r.acao === "spam" ? LARANJA : VERMELHO },
];

export const tituloDaMsg = (m: Pick<Msg, "tipo" | "falsa">) =>
  m.tipo === "devolucao" ? "Mensagem de devolução (escrita pelo servidor de envio)" : m.falsa ? "Mensagem do golpista" : "Mensagem da Ana";

/** As fileiras de uma mensagem aberta: envelope, cabeçalho e, se houver, o resultado da conferência. */
export const fileirasDaMsg = (m: Dados, r?: Resultado): Fileira[] => {
  const f: Fileira[] = [
    { titulo: "ENVELOPE: o que os servidores leem", cor: "#93c5fd", campos: envelope(m), a: 1 },
    { titulo: "CABEÇALHO: o que aparece para você", cor: "#67e8f9", campos: cabecalho(m), a: 1 },
  ];
  if (r && m.tipo === "email") f.push({ titulo: "CONFERÊNCIA NA CHEGADA, com o DNS como está agora", cor: "#fcd34d", campos: conferencia(r), a: 1 });
  return f;
};

/** A mensagem verdadeira da Ana e a versão do golpista, para a cena "por dentro". */
export const MSG_ANA: Dados = { tipo: "email", de: ANA, envDe: ANA, para: BRUNO, ip: IP_ENVIO, assunto: "Orçamento das flores", dkim: undefined };
export const MSG_GOLPE: Dados = { tipo: "email", de: ANA, envDe: `cobranca@${DOM_GOLPE}`, para: BRUNO, ip: IP_GOLPE, assunto: "Boleto atualizado", dkim: undefined };

/** Fileira de comparação: a mensagem do golpista numa linha só. */
export const fileiraGolpe = (a: number): Fileira => ({
  titulo: "A MENSAGEM DO GOLPISTA, para comparar",
  cor: "#fca5a5",
  a,
  campos: [
    { nome: "MAIL FROM (envelope)", valor: MSG_GOLPE.envDe, nota: "outro remetente", larg: 4.4, cor: VERMELHO },
    { nome: "IP de quem entrega", valor: MSG_GOLPE.ip, nota: "outro servidor", larg: 3.6, cor: VERMELHO },
    { nome: "De", valor: MSG_GOLPE.de, nota: "idêntico ao da Ana", larg: 3.7, cor: CIANO },
    { nome: "Assunto", valor: MSG_GOLPE.assunto, nota: "", larg: 3.1, cor: ROXO },
  ],
});
