// Geometria da cena: onde fica cada personagem do caminho do e-mail e por onde cada mensagem passa.
import * as THREE from "three";
import type { Msg, Sim, Trecho } from "../sim/sim";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const CHAO = -1.95;
export const RACK = { w: 2.3, h: 3.0, d: 1.8 };
/** Centro de cada elemento. */
export const POS = {
  ana: V(-7.5, -1.2, 3.6),
  envio: V(-3.5, CHAO + RACK.h / 2, 0),
  destino: V(3.5, CHAO + RACK.h / 2, 0),
  dns: V(0, 4.5, -3.4),
  caixa: V(6.9, -1.5, -1.5),
  spam: V(6.9, -1.5, 2.0),
  bruno: V(8.9, -1.1, 4.3),
  golpista: V(-1.3, -1.2, 5.9),
  /** Pórtico de conferência, na frente do servidor de destino. */
  porta: V(0.9, 0, 1.5),
};
export const DNS_TAM = { w: 7.6, h: 3.5 };
/** Onde a mensagem aberta é montada, acima de tudo. */
export const PALCO = V(0, 10.4, 0);

const topoEnvio = V(POS.envio.x, CHAO + RACK.h + 0.28, 0.15);
const naPorta = V(POS.porta.x, 0.15, POS.porta.z);
const telaAna = V(POS.ana.x + 0.3, -0.3, POS.ana.z - 0.2);
const baseDns = V(0, POS.dns.y - DNS_TAM.h / 2 - 0.1, POS.dns.z + 0.15);

const curvas: Record<Trecho, THREE.Curve<THREE.Vector3>> = {
  "ana>envio": new THREE.CubicBezierCurve3(telaAna, V(-6.8, 2.6, 2.6), V(-4.6, 3.0, 0.8), topoEnvio),
  "envio>ana": new THREE.CubicBezierCurve3(topoEnvio, V(-5.0, 0.4, 3.4), V(-6.2, -0.6, 4.6), telaAna),
  "envio>dns": new THREE.CubicBezierCurve3(topoEnvio, V(-3.4, 2.6, -0.6), V(-1.6, 2.2, -2.6), baseDns.clone().add(V(-1.2, 0, 0))),
  "dns>envio": new THREE.CubicBezierCurve3(baseDns.clone().add(V(-1.6, 0, 0)), V(-2.4, 2.0, -2.0), V(-4.0, 2.4, -0.4), topoEnvio),
  "destino>dns": new THREE.CubicBezierCurve3(naPorta, V(1.5, 1.6, 0.2), V(1.4, 2.2, -2.4), baseDns.clone().add(V(1.2, 0, 0))),
  "dns>destino": new THREE.CubicBezierCurve3(baseDns.clone().add(V(1.6, 0, 0)), V(2.2, 2.0, -2.0), V(2.1, 1.4, 0.3), naPorta),
  "envio>destino": new THREE.CubicBezierCurve3(topoEnvio, V(-2.2, 2.9, 1.6), V(0.6, 1.4, 1.9), naPorta),
  "destino>envio": new THREE.CubicBezierCurve3(naPorta, V(0.2, -1.2, 3.2), V(-2.4, -0.6, 2.8), topoEnvio),
  "golpista>destino": new THREE.CubicBezierCurve3(V(POS.golpista.x + 0.2, -0.3, POS.golpista.z - 0.3), V(-0.6, 1.8, 4.6), V(0.6, 1.2, 3.0), naPorta),
  "destino>golpista": new THREE.CubicBezierCurve3(naPorta, V(1.8, -1.2, 3.2), V(0.8, -1.0, 5.4), V(POS.golpista.x + 0.6, -0.5, POS.golpista.z - 0.2)),
  "destino>caixa": new THREE.CubicBezierCurve3(naPorta, V(3.2, 3.2, 0.6), V(6.2, 2.0, -1.2), V(POS.caixa.x, -1.1, POS.caixa.z)),
  "destino>spam": new THREE.CubicBezierCurve3(naPorta, V(3.4, 2.4, 2.4), V(6.2, 1.2, 2.4), V(POS.spam.x, -1.1, POS.spam.z)),
  "caixa>bruno": new THREE.CubicBezierCurve3(V(POS.caixa.x, -1.0, POS.caixa.z), V(8.0, 1.2, 0.4), V(8.8, 0.8, 2.8), V(POS.bruno.x, -0.4, POS.bruno.z)),
};

export const curva = (t: Trecho) => curvas[t];
/** Trajetos desenhados como fios no chão da cena (um por ligação). */
export const FIOS: { t: Trecho; cor: string }[] = [
  { t: "ana>envio", cor: "#3a5f9e" },
  { t: "envio>dns", cor: "#8a7a1c" },
  { t: "destino>dns", cor: "#8a7a1c" },
  { t: "envio>destino", cor: "#3a5f9e" },
  { t: "golpista>destino", cor: "#8a2a2a" },
  { t: "destino>caixa", cor: "#2f7a5c" },
  { t: "destino>spam", cor: "#8a5a1c" },
  { t: "caixa>bruno", cor: "#2f7a5c" },
];

const tmp = new THREE.Vector3();
/** Posição de uma mensagem. Na fila, empilha em cima do servidor de envio; na porta, fica sob o pórtico. */
export const posMsg = (s: Sim, m: Msg, saida: THREE.Vector3) => {
  if (m.estado === "fila") {
    const i = s.msgs.filter((x) => x.estado === "fila").indexOf(m);
    return saida.set(topoEnvio.x, topoEnvio.y + i * 0.2, topoEnvio.z);
  }
  if (m.estado === "porta") {
    const i = s.msgs.filter((x) => x.estado === "porta").indexOf(m);
    return saida.set(naPorta.x - i * 0.15, naPorta.y + i * 0.55, naPorta.z + i * 0.1);
  }
  curvas[m.trecho].getPoint(Math.min(1, Math.max(0, m.u)), saida);
  const h = (m.id * 2654435761) >>> 0;
  const meio = Math.sin(Math.PI * Math.min(1, Math.max(0, m.u)));
  tmp.set(((h & 255) / 255 - 0.5) * 0.3, (((h >> 8) & 255) / 255 - 0.5) * 0.3, (((h >> 16) & 255) / 255 - 0.5) * 0.3).multiplyScalar(meio);
  return saida.add(tmp);
};

export const COR = {
  verdadeira: "#60a5fa",
  falsa: "#ef4444",
  devolucao: "#f59e0b",
  dns: "#fde047",
  aviso: "#34d399",
  verde: "#34d399",
  vermelho: "#ef4444",
  ambar: "#fbbf24",
  fundo: "#070b16",
  painel: "#0f1a30",
  borda: "#27406e",
  texto: "#e8eefc",
  apagado: "#8fa3c8",
};

export const corMsg = (m: Pick<Msg, "tipo" | "falsa">) =>
  m.tipo === "devolucao" ? COR.devolucao : m.tipo === "consulta" || m.tipo === "resposta" ? COR.dns : m.tipo === "aviso" ? COR.aviso : m.falsa ? COR.falsa : COR.verdadeira;
