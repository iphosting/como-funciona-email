// A visita guiada: onze cenas. Cada cena é um roteiro de ações sobre o simulador (quem envia o quê e quando)
// mais os movimentos de câmera. O estado em qualquer instante é função só do tempo, então o vídeo e a
// página mostram exatamente a mesma coisa.
import roteiro from "../roteiro.json";
import duracoes from "./duracoes.json";
import { MSG_ANA, fileiraGolpe, fileirasDaMsg } from "./campos";
import type { Destaque } from "./Hud";
import { adulterar, criarSim, definirCaixaCheia, definirDmarc, enviar, enviarFalso, passo, publicar, type Sim } from "./sim/sim";
import type { Camera, Dissec } from "./three/Cena3D";
import { PALCO } from "./three/geo";

export interface CenaInfo {
  id: string;
  titulo: string;
  sub: string;
  fala: string;
  /** Duração da fala, em segundos. */
  dur: number;
  /** Duração da cena: 0,5 s antes da fala e 0,6 s depois. */
  total: number;
}

export const ANTES = 0.5;
export const DEPOIS = 0.6;

export const CENAS: CenaInfo[] = roteiro.cenas.map((c) => {
  const dur = (duracoes as Record<string, number>)[c.id];
  return { ...c, dur, total: dur + ANTES + DEPOIS };
});

export interface Cartao {
  titulo: string;
  linhas: string[];
  a: number;
}

export interface Visao {
  sim: Sim;
  cam: Camera;
  dissec?: Dissec;
  /** Painel a destacar na tela. */
  destaque?: Destaque;
  cartao?: Cartao;
  /** O golpista ainda não entrou na história. */
  semGolpista?: boolean;
}

type V3 = [number, number, number];
const c = (pos: V3, alvo: V3): Camera => ({ pos, alvo });
const CAM = {
  geral: c([0.5, 8.6, 22.5], [0.5, 0.6, 1.4]),
  ana: c([-5.4, 5, 15], [-5.3, -0.5, 1.6]),
  envio: c([-4.6, 4.8, 12.5], [-4.3, 0.2, 1]),
  dns: c([-1.2, 5.4, 13.5], [-1, 2.7, -1.2]),
  porta: c([1.0, 3.8, 12], [1.6, 0.9, 0.9]),
  direita: c([5.6, 4.8, 14.5], [5.8, 0, 1.2]),
  golpe: c([-0.2, 9.5, 16.5], [0.3, -0.9, 2.4]),
  esquerda: c([-3.5, 6.5, 20], [-2.6, 0.3, 1.8]),
  palco: c([0, PALCO.y + 0.25, 17.5], [0, PALCO.y + 0.25, 0]),
};

const k = (f: number, a: number, b: number) => Math.min(1, Math.max(0, (f - a) / (b - a)));
const suave = (x: number) => x * x * (3 - 2 * x);
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Câmera por quadros-chave: [fração da cena, câmera]. */
const camera = (f: number, chaves: [number, Camera][]): Camera => {
  if (f <= chaves[0][0]) return chaves[0][1];
  for (let i = 0; i < chaves.length - 1; i++) {
    const [fa, a] = chaves[i];
    const [fb, b] = chaves[i + 1];
    if (f <= fb) {
      const t = suave(k(f, fa, fb));
      return { pos: mix(a.pos, b.pos, t), alvo: mix(a.alvo, b.alvo, t) };
    }
  }
  return chaves[chaves.length - 1][1];
};

/**
 * Fração da fala da cena `id` em que o `trecho` começa, mais `seg` segundos. Prende ações e câmeras ao
 * texto: mudar a fala não desalinha nada, e dá erro se o trecho sumir do roteiro.
 */
const F = (id: string, trecho: string, seg = 0): number => {
  const info = CENAS.find((x) => x.id === id);
  if (!info) throw new Error("cena inexistente: " + id);
  const i = info.fala.indexOf(trecho);
  if (i < 0) throw new Error(`trecho "${trecho}" não está na fala da cena ${id}`);
  return i / info.fala.length + seg / info.dur;
};

interface Roteiro {
  /** Velocidade da simulação nesta cena (1 = normal). */
  vel?: number;
  /** Estado inicial. */
  pre?: (s: Sim) => void;
  /** Segundos de simulação rodados antes de a cena começar, com ações em instantes negativos. */
  antes?: { seg: number; acoes: [number, (s: Sim) => void][] };
  /** Ações: [fração da fala, ação]. */
  acoes: [number, (s: Sim) => void][];
  ver: (f: number, s: Sim) => Omit<Visao, "sim">;
}

/** Endereço público da página, mostrado no fim do vídeo. */
export const ENDERECO = "como-funciona-email.pages.dev";

const protegerTudo = (s: Sim) => {
  publicar(s, "spf", true);
  publicar(s, "dkim", true);
  definirDmarc(s, "reject");
  s.conversa.length = 0;
};

const ROTEIROS: Record<string, Roteiro> = {
  abertura: {
    acoes: [
      [0.2, (s) => enviar(s)],
      [0.6, (s) => enviar(s, { assunto: "Pedido de rosas" })],
    ],
    ver: (f) => ({
      cam: camera(f, [
        [0, c([-13, 7, 21], [-2, 0.6, 1.5])],
        [0.5, CAM.geral],
        [1, c([1.5, 9.5, 23], [0.8, 0.7, 1.4])],
      ]),
    }),
  },
  envio: {
    vel: 0.5,
    pre: (s) => {
      s.filaParada = true;
    },
    acoes: [
      [F("envio", "A Ana aperta enviar", 0.4), (s) => enviar(s)],
      [F("envio", "É como deixar"), (s) => enviar(s, { assunto: "Pedido de rosas" })],
    ],
    ver: (f) => ({
      cam: camera(f, [
        [0, c([1.5, 9.5, 23], [0.8, 0.7, 1.4])],
        [0.12, CAM.ana],
        [0.5, CAM.ana],
        [0.72, CAM.envio],
        [1, CAM.envio],
      ]),
      destaque: f > 0.3 ? "conversa" : undefined,
    }),
  },
  dns: {
    vel: 0.5,
    pre: (s) => {
      s.filaParada = true;
    },
    antes: { seg: 3, acoes: [[-3, (s) => enviar(s)]] },
    acoes: [
      [
        F("dns", "Então ele pergunta"),
        (s) => {
          s.filaParada = false;
        },
      ],
      [F("dns", "Se o domínio não existir", -6), (s) => enviar(s, { para: "bruno@empreza.example", assunto: "Endereço digitado errado" })],
    ],
    ver: (f) => ({
      cam: camera(f, [
        [0, CAM.envio],
        [0.2, CAM.dns],
        [0.7, CAM.dns],
        [0.86, c([-3.8, 5.6, 16], [-3.2, 1.4, 0.6])],
        [1, c([-3.8, 5.6, 16], [-3.2, 1.4, 0.6])],
      ]),
      destaque: "conversa",
    }),
  },
  conversa: {
    vel: 0.42,
    antes: { seg: 3.95, acoes: [[-3.95, (s) => enviar(s)]] },
    acoes: [],
    ver: (f) => ({
      cam: camera(f, [
        [0, c([-0.6, 4.8, 14], [-0.4, 1, 0.8])],
        [0.3, CAM.porta],
        [0.62, CAM.porta],
        [0.8, CAM.direita],
        [1, CAM.direita],
      ]),
      destaque: "conversa",
    }),
  },
  pordentro: {
    acoes: [],
    ver: (f) => {
      const id = "pordentro";
      const fora = F(id, "Por fora");
      const dentro = F(id, "Por dentro");
      const compare = F(id, "Agora compare");
      const outroEnv = F(id, "O envelope é outro");
      const outroSrv = F(id, "o servidor é outro");
      const mesmoDe = F(id, "mas o campo De");
      const nasceu = F(id, "O e-mail nasceu");
      let hl = -1;
      if (f >= fora && f < dentro) hl = f < (fora + dentro) / 2 ? 0 : 1;
      else if (f >= dentro && f < compare) hl = f < dentro + (compare - dentro) * 0.45 ? -1 : f < dentro + (compare - dentro) * 0.62 ? 10 : f < dentro + (compare - dentro) * 0.76 ? 11 : 12;
      else if (f >= outroEnv && f < outroSrv) hl = 20;
      else if (f >= outroSrv && f < mesmoDe) hl = 21;
      else if (f >= mesmoDe) hl = 22;
      return {
        cam: camera(f, [
          [0, CAM.direita],
          [0.08, CAM.palco],
          [1, CAM.palco],
        ]),
        dissec: {
          titulo: "Mensagem da Ana",
          fileiras: [...fileirasDaMsg(MSG_ANA), fileiraGolpe(k(f, compare, compare + 0.04))],
          e: k(f, 0.02, 0.1),
          hl,
          carimbo: { txt: "Ninguém confere o campo De", a: k(f, nasceu + 0.03, nasceu + 0.07) },
        },
      };
    },
  },
  golpe: {
    vel: 0.75,
    acoes: [
      [0.02, (s) => enviar(s)],
      [F("golpe", "O golpista usa"), (s) => enviarFalso(s, "simples")],
      [F("golpe", "Sem proteção"), (s) => enviarFalso(s, "simples")],
      [F("golpe", "É o golpe do boleto", -6), (s) => enviarFalso(s, "simples")],
    ],
    ver: (f) => ({
      cam: camera(f, [
        [0, CAM.geral],
        [0.14, CAM.golpe],
        [0.42, CAM.golpe],
        [0.66, c([5, 5.5, 15.5], [5, 0.2, 1])],
        [0.84, c([5, 5.5, 15.5], [5, 0.2, 1])],
        [1, CAM.geral],
      ]),
      destaque: f > 0.5 ? "placar" : "conferencia",
    }),
  },
  spf: {
    vel: 0.8,
    acoes: [
      [F("spf", "O dono do domínio publica", 1), (s) => publicar(s, "spf", true)],
      [F("spf", "Na chegada", -2), (s) => enviarFalso(s, "simples")],
      [F("spf", "Na chegada", 1), (s) => enviar(s)],
    ],
    ver: (f) => ({
      cam: camera(f, [
        [0, CAM.geral],
        [0.14, CAM.dns],
        [0.36, CAM.dns],
        [0.5, c([1.5, 4.6, 13.5], [2.6, 0.8, 0.8])],
        [0.72, c([4.5, 5.2, 15.5], [4.6, 0.3, 1])],
        [1, CAM.geral],
      ]),
      destaque: f < 0.4 ? "dns" : "conferencia",
    }),
  },
  dkim: {
    vel: 0.75,
    pre: (s) => {
      publicar(s, "spf", true);
      s.conversa.length = 0;
    },
    acoes: [
      [F("dkim", "uma assinatura digital"), (s) => publicar(s, "dkim", true)],
      [F("dkim", "O servidor da Ana assina", -1.5), (s) => enviar(s)],
      [F("dkim", "Se alguém alterar", -6), (s) => enviar(s, { assunto: "Dados para pagamento" })],
      [F("dkim", "Se alguém alterar", 1), (s) => adulterar(s)],
    ],
    ver: (f) => ({
      cam: camera(f, [
        [0, CAM.geral],
        [0.12, CAM.envio],
        [0.36, CAM.envio],
        [0.46, CAM.dns],
        [0.6, CAM.dns],
        [0.76, c([-0.6, 4.2, 13], [-0.4, 1.2, 1])],
        [1, CAM.porta],
      ]),
      destaque: f > 0.08 && f < 0.62 ? "dns" : "conferencia",
    }),
  },
  dmarc: {
    vel: 0.8,
    pre: (s) => {
      publicar(s, "spf", true);
      publicar(s, "dkim", true);
      s.conversa.length = 0;
    },
    acoes: [
      [F("dmarc", "Veja o golpista esperto", -3), (s) => enviarFalso(s, "esperto")],
      [F("dmarc", "A terceira proteção", 1.5), (s) => definirDmarc(s, "reject")],
      [F("dmarc", "Com a ordem de recusar", -7.5), (s) => enviarFalso(s, "esperto")],
      [F("dmarc", "Com a ordem de recusar", -3.5), (s) => enviar(s)],
    ],
    ver: (f) => ({
      cam: camera(f, [
        [0, CAM.porta],
        [0.1, CAM.golpe],
        [0.24, CAM.golpe],
        [0.36, c([3.4, 5.2, 15.5], [3.8, 0.4, 1.2])],
        [0.46, CAM.dns],
        [0.7, CAM.dns],
        [0.82, c([0.6, 5.2, 16], [1, 0.4, 2.4])],
        [1, c([0.6, 5.2, 16], [1, 0.4, 2.4])],
      ]),
      destaque: f > 0.44 && f < 0.74 ? "dns" : "conferencia",
    }),
  },
  devolucao: {
    vel: 1.85,
    pre: protegerTudo,
    acoes: [
      [F("devolucao", "Se o endereço não existe", -2), (s) => enviar(s, { para: "brunno@empresa.example", assunto: "Endereço digitado errado" })],
      [
        F("devolucao", "Se a caixa está cheia", -5),
        (s) => {
          definirCaixaCheia(s, true);
          enviar(s);
        },
      ],
    ],
    ver: (f) => ({
      cam: camera(f, [
        [0, CAM.geral],
        [0.14, CAM.esquerda],
        [0.44, CAM.esquerda],
        [0.56, CAM.geral],
        [0.86, CAM.geral],
        [1, CAM.esquerda],
      ]),
      destaque: f > 0.5 ? "placar" : "conversa",
    }),
  },
  fechamento: {
    vel: 0.9,
    pre: protegerTudo,
    acoes: [
      [0.02, (s) => enviar(s)],
      [0.2, (s) => enviarFalso(s, "esperto")],
      [0.42, (s) => enviar(s, { assunto: "Pedido de rosas" })],
      [0.58, (s) => enviarFalso(s, "simples")],
      [0.76, (s) => enviar(s)],
    ],
    ver: (f) => {
      const ini = F("fechamento", "Ésse-pê-éfe diz");
      const leia = F("fechamento", "Agora é com você");
      const lembrar = k(f, ini, ini + 0.04) * (1 - k(f, leia - 0.03, leia));
      const convite = k(f, leia, leia + 0.04);
      return {
        cam: camera(f, [
          [0, CAM.geral],
          [0.5, c([1.5, 9.5, 23], [0.8, 0.7, 1.4])],
          [1, c([-4, 11, 26], [0.4, 0.6, 1.4])],
        ]),
        cartao:
          convite > 0
            ? { titulo: "Agora é com você", linhas: ["Abra a página e tente enganar o servidor do Bruno", ENDERECO], a: convite }
            : lembrar > 0
              ? { titulo: "Para lembrar", linhas: ["SPF: quem pode enviar pelo domínio", "DKIM: o lacre que prova a origem", "DMARC: a ordem do dono para a reprovada", "Voltou? O motivo está na devolução"], a: lembrar }
              : undefined,
      };
    },
  },
};

// ---------- Estado em função do tempo ----------

/** Deslocamento lateral da câmera por unidade de distância até o alvo (o painel cobre a direita da tela). */
export const DESLOC = 0.14;
const SEM_GOLPISTA = ["abertura", "envio", "dns", "conversa", "pordentro"];
const DT = 1 / 60;
interface Memo {
  sim: Sim;
  passos: number;
  prox: number;
}
const memo: Record<string, Memo> = {};

const preparar = (id: string): Memo => {
  const r = ROTEIROS[id];
  const sim = criarSim();
  r.pre?.(sim);
  if (r.antes) {
    const { seg, acoes } = r.antes;
    let i = 0;
    const n = Math.round(seg * 60);
    for (let p = 0; p < n; p++) {
      const agora = -seg + p * DT;
      while (i < acoes.length && acoes[i][0] <= agora + 1e-9) acoes[i++][1](sim);
      passo(sim, DT);
    }
    sim.conversa = sim.conversa.slice(-6);
  }
  return { sim, passos: 0, prox: 0 };
};

/** O que mostrar na cena `id` aos `t` segundos (t = 0 no início da cena). */
export const visao = (id: string, t: number, desloc = DESLOC): Visao => {
  const r = ROTEIROS[id];
  const info = CENAS.find((x) => x.id === id)!;
  const vel = r.vel ?? 1;
  const alvo = Math.max(0, Math.floor(Math.max(0, t) * vel * 60));
  let m = memo[id];
  if (!m || m.passos > alvo) m = memo[id] = preparar(id);
  while (m.passos < alvo) {
    // instante da cena correspondente a este passo de simulação
    const agora = (m.passos * DT) / vel;
    while (m.prox < r.acoes.length && ANTES + r.acoes[m.prox][0] * info.dur <= agora + 1e-9) r.acoes[m.prox++][1](m.sim);
    passo(m.sim, DT);
    m.passos++;
  }
  const f = Math.min(1, Math.max(0, (t - ANTES) / info.dur));
  const v = { semGolpista: SEM_GOLPISTA.includes(id), ...r.ver(f, m.sim) };
  // O painel ocupa a direita da tela: a câmera desloca para a cena ficar à esquerda. Com a mensagem
  // aberta o painel some, e o deslocamento também.
  const dist = Math.hypot(v.cam.pos[0] - v.cam.alvo[0], v.cam.pos[1] - v.cam.alvo[1], v.cam.pos[2] - v.cam.alvo[2]);
  const dx = desloc * dist * (1 - Math.min(1, (v.dissec?.e ?? 0) * 3));
  return { sim: m.sim, ...v, cam: { pos: [v.cam.pos[0] + dx, v.cam.pos[1], v.cam.pos[2]], alvo: [v.cam.alvo[0] + dx, v.cam.alvo[1], v.cam.alvo[2]] } };
};

/** Trecho da fala a mostrar como legenda no instante t da cena. */
const SIGLAS: [RegExp, string][] = [
  [/dê-ene-ésse/gi, "DNS"],
  [/ême-xis/gi, "MX"],
  [/ésse-pê-éfe/gi, "SPF"],
  [/dê-quim/gi, "DKIM"],
  [/dê-marc/gi, "DMARC"],
  [/duzentos e cinquenta/gi, "250"],
];
const paraTela = (txt: string) => SIGLAS.reduce((s, [re, por]) => s.replace(re, por), txt);

const quebrar = (fala: string): string[] => {
  const saida: string[] = [];
  for (const frase of fala.trim().split(/(?<=[.!?:])\s+/)) {
    if (frase.length <= 78) {
      saida.push(frase);
      continue;
    }
    let atual = "";
    for (const parte of frase.split(/(?<=[,;])\s+/)) {
      if (!atual) atual = parte;
      else if (atual.length + 1 + parte.length <= 78) atual += " " + parte;
      else {
        saida.push(atual);
        atual = parte;
      }
    }
    if (atual) saida.push(atual);
  }
  return saida;
};

const legendas: Record<string, { ini: number; fim: number; txt: string }[]> = {};
export const legenda = (id: string, t: number): string => {
  if (!legendas[id]) {
    const info = CENAS.find((x) => x.id === id)!;
    const partes = quebrar(info.fala);
    const total = partes.reduce((s, p) => s + p.length, 0);
    let ac = 0;
    legendas[id] = partes.map((p) => {
      const ini = ANTES + (ac / total) * info.dur;
      ac += p.length;
      return { ini, fim: ANTES + (ac / total) * info.dur, txt: paraTela(p) };
    });
  }
  return legendas[id].find((l) => t >= l.ini && t < l.fim)?.txt ?? "";
};
