// A cena 3D do caminho do e-mail. Tudo aqui é função das propriedades (estado da simulação, tempo,
// câmera): a mesma cena serve à página interativa e ao vídeo, que a desenha quadro a quadro.
import React, { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ANA, DOM_EMPRESA, DOM_LOJA, HOST_ENVIO, HOST_MX, IP_DESTINO, IP_ENVIO, IP_GOLPE, naFila, naPorta, textoDmarc, textoSpf, type Entregue, type Msg, type Nota, type Sim } from "../sim/sim";
import type { Campo, Fileira } from "../campos";
import { CHAO, COR, DNS_TAM, FIOS, PALCO, POS, RACK, corMsg, curva, posMsg } from "./geo";
import { FONTE, caber, caixaArredondada, textura } from "./textos";

export interface Camera {
  pos: [number, number, number];
  alvo: [number, number, number];
}

export interface Dissec {
  titulo: string;
  fileiras: Fileira[];
  /** 0 = fechada, 1 = totalmente aberta. */
  e: number;
  /** Campo em destaque: fileira * 10 + posição, ou -1. */
  hl: number;
  carimbo?: { txt: string; a: number };
}

export interface PropsCena {
  sim: Sim;
  tempo: number;
  cam?: Camera;
  dissec?: Dissec;
  baixa?: boolean;
  /** Esconde o golpista (nas cenas da visita em que ele ainda não entrou na história). */
  semGolpista?: boolean;
  aoClicarMsg?: (id: number) => void;
  /** Proporção largura/altura da tela, para afastar a câmera em tela estreita. */
  aspecto?: number;
  /** Recebe o controle de órbita (página interativa). */
  registrar?: (c: OrbitControls) => void;
}

const v3 = new THREE.Vector3();

// ---------- Câmera ----------

const Rig: React.FC<{ cam?: Camera; aspecto: number; registrar?: (c: OrbitControls) => void }> = ({ cam, aspecto, registrar }) => {
  const { camera, gl, invalidate } = useThree();
  const ctl = useRef<OrbitControls | null>(null);

  useLayoutEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = false;
    c.minDistance = 5;
    c.maxDistance = 70;
    c.maxPolarAngle = Math.PI * 0.52;
    // em tela larga o painel fica à direita: o centro da órbita desloca para a cena ficar à esquerda
    c.target.set(aspecto > 1.3 ? 3.4 : 0.6, 0.6, 1.5);
    c.update();
    registrar?.(c);
    c.addEventListener("change", () => invalidate());
    ctl.current = c;
    return () => c.dispose();
  }, [camera, gl, invalidate, registrar]);

  useLayoutEffect(() => {
    const c = ctl.current;
    if (cam) {
      // em tela estreita (celular em pé) a câmera recua para a cena caber
      const recuo = aspecto < 1.3 ? Math.min(2.6, 1.3 / aspecto) : 1;
      v3.set(cam.pos[0] - cam.alvo[0], cam.pos[1] - cam.alvo[1], cam.pos[2] - cam.alvo[2]).multiplyScalar(recuo);
      camera.position.set(cam.alvo[0] + v3.x, cam.alvo[1] + v3.y, cam.alvo[2] + v3.z);
      camera.lookAt(cam.alvo[0], cam.alvo[1], cam.alvo[2]);
      camera.updateMatrixWorld();
      if (c) {
        c.enabled = false;
        c.target.set(cam.alvo[0], cam.alvo[1], cam.alvo[2]);
      }
    } else if (c && !c.enabled) {
      c.enabled = true;
      c.update();
    }
  });
  return null;
};

// ---------- Servidores ----------

const texRack = (titulo: string, host: string, ip: string, estado: string, corEstado: string, ruim: boolean) =>
  textura(`rack|${titulo}|${estado}|${corEstado}|${ruim}`, 560, 730, (c, w, h) => {
    c.fillStyle = ruim ? "#260d10" : "#0d1930";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = ruim ? "#ef4444" : "#3b82f6";
    c.lineWidth = 12;
    c.strokeRect(6, 6, w - 12, h - 12);
    // gavetas do servidor
    for (let i = 0; i < 4; i++) {
      c.fillStyle = "#13233f";
      caixaArredondada(c, 40, 400 + i * 74, w - 80, 56, 10);
      c.fill();
      c.fillStyle = ruim ? "#7f1d1d" : i % 2 ? "#34d399" : "#22d3ee";
      c.beginPath();
      c.arc(74, 428 + i * 74, 9, 0, 7);
      c.fill();
      c.fillStyle = "#24385f";
      c.fillRect(110, 421 + i * 74, w - 200, 14);
    }
    c.textAlign = "center";
    c.fillStyle = "#ffffff";
    caber(c, titulo, w / 2, 96, w - 60, 58, 800);
    c.fillStyle = "#9fb3d9";
    caber(c, host, w / 2, 160, w - 60, 38, 600);
    caber(c, "IP " + ip, w / 2, 214, w - 60, 38, 600);
    c.fillStyle = corEstado;
    caixaArredondada(c, 50, 260, w - 100, 92, 22);
    c.fill();
    c.fillStyle = "#06101f";
    caber(c, estado, w / 2, 322, w - 130, 48, 800);
  });

const Rack: React.FC<{ pos: THREE.Vector3; titulo: string; host: string; ip: string; estado: string; corEstado: string; ruim?: boolean }> = ({ pos, titulo, host, ip, estado, corEstado, ruim = false }) => (
  <group position={[pos.x, pos.y, pos.z]}>
    <mesh>
      <boxGeometry args={[RACK.w, RACK.h, RACK.d]} />
      <meshStandardMaterial color={ruim ? "#2a1418" : "#16223a"} roughness={0.45} metalness={0.55} />
    </mesh>
    <mesh position={[0, 0, RACK.d / 2 + 0.012]}>
      <planeGeometry args={[RACK.w - 0.12, RACK.h - 0.12]} />
      <meshBasicMaterial map={texRack(titulo, host, ip, estado, corEstado, ruim)} toneMapped={false} />
    </mesh>
    <mesh position={[0, RACK.h / 2 + 0.05, 0]}>
      <boxGeometry args={[RACK.w + 0.16, 0.1, RACK.d + 0.16]} />
      <meshStandardMaterial color="#22345a" roughness={0.4} metalness={0.5} />
    </mesh>
    <pointLight position={[0, 0.2, RACK.d]} color={ruim ? "#ef4444" : "#3b82f6"} intensity={5} distance={5} />
  </group>
);

// ---------- Telas: Ana, golpista e o celular do Bruno ----------

const texTela = (chave: string, cor: string, linhas: { txt: string; tam: number; cor: string; peso?: number }[], selo?: { txt: string; cor: string; corTxt: string }) =>
  textura(`tela|${chave}`, 600, 394, (c, w, h) => {
    c.fillStyle = "#0b1426";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = cor;
    c.lineWidth = 12;
    c.strokeRect(6, 6, w - 12, h - 12);
    c.textAlign = "center";
    let y = 84;
    for (const l of linhas) {
      c.fillStyle = l.cor;
      caber(c, l.txt, w / 2, y, w - 56, l.tam, l.peso ?? 700);
      y += l.tam * 1.32;
    }
    if (selo) {
      c.fillStyle = selo.cor;
      caixaArredondada(c, 50, h - 116, w - 100, 80, 20);
      c.fill();
      c.fillStyle = selo.corTxt;
      caber(c, selo.txt, w / 2, h - 62, w - 130, 40, 800);
    }
  });

const Monitor: React.FC<{ pos: THREE.Vector3; giro: number; tex: THREE.Texture; cor?: string }> = ({ pos, giro, tex, cor = "#1a2742" }) => (
  <group position={[pos.x, pos.y, pos.z]} rotation={[0, giro, 0]}>
    <mesh position={[0, -0.69, 0]}>
      <boxGeometry args={[1.7, 0.12, 1.0]} />
      <meshStandardMaterial color={cor} roughness={0.5} metalness={0.4} />
    </mesh>
    <mesh position={[0, -0.36, 0]}>
      <boxGeometry args={[0.18, 0.6, 0.18]} />
      <meshStandardMaterial color={cor} roughness={0.5} metalness={0.4} />
    </mesh>
    <mesh position={[0, 0.62, 0]} rotation={[-0.14, 0, 0]}>
      <boxGeometry args={[2.72, 1.82, 0.09]} />
      <meshStandardMaterial color="#0b1220" roughness={0.4} />
    </mesh>
    <mesh position={[0, 0.62, 0.055]} rotation={[-0.14, 0, 0]}>
      <planeGeometry args={[2.6, 1.7]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  </group>
);

const curto = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

const Pessoas: React.FC<{ sim: Sim; semGolpista?: boolean }> = ({ sim, semGolpista }) => {
  const dev = sim.ana.devolucoes[sim.ana.devolucoes.length - 1];
  const texAna = texTela(
    `ana|${sim.ana.enviadas}|${sim.ana.devolucoes.length}`,
    dev ? "#f59e0b" : "#3b82f6",
    [
      { txt: "Ana", tam: 70, cor: "#ffffff", peso: 800 },
      { txt: ANA, tam: 40, cor: "#9fb3d9" },
      { txt: dev ? "Voltou: " + curto(dev.motivo, 34) : `${sim.ana.enviadas} enviada${sim.ana.enviadas === 1 ? "" : "s"}`, tam: 34, cor: dev ? "#fcd34d" : "#9fb3d9" },
    ],
    dev ? { txt: `${sim.ana.devolucoes.length} devolvida${sim.ana.devolucoes.length === 1 ? "" : "s"}`, cor: "#f59e0b", corTxt: "#1f1300" } : { txt: "remetente", cor: "#1d4ed8", corTxt: "#ffffff" },
  );
  const texGolpe = texTela("golpe", "#ef4444", [
    { txt: "Golpista", tam: 70, cor: "#fecaca", peso: 800 },
    { txt: "servidor próprio, IP " + IP_GOLPE, tam: 34, cor: "#fca5a5" },
    { txt: "escreve no campo De:", tam: 32, cor: "#9fb3d9" },
  ], { txt: ANA, cor: "#7f1d1d", corTxt: "#ffffff" });
  const ult = sim.caixa[sim.caixa.length - 1];
  const texBruno = textura(`bruno|${sim.bruno.vistas}|${ult?.id ?? 0}`, 360, 640, (c, w, h) => {
    c.fillStyle = "#0b1426";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#34d399";
    c.lineWidth = 12;
    c.strokeRect(6, 6, w - 12, h - 12);
    c.textAlign = "center";
    c.fillStyle = "#ffffff";
    caber(c, "Bruno", w / 2, 96, w - 40, 70, 800);
    c.fillStyle = "#9fb3d9";
    caber(c, "destinatário", w / 2, 146, w - 40, 32, 600);
    c.fillStyle = sim.bruno.vistas ? "#10b981" : "#1b2a4a";
    caixaArredondada(c, 40, 190, w - 80, 110, 24);
    c.fill();
    c.fillStyle = sim.bruno.vistas ? "#052e1c" : "#8fa3c8";
    caber(c, sim.bruno.vistas ? `${sim.bruno.vistas} nova${sim.bruno.vistas === 1 ? "" : "s"}` : "sem novas", w / 2, 262, w - 110, 52, 800);
    if (ult) {
      c.fillStyle = "#8fa3c8";
      caber(c, "Última, De:", w / 2, 372, w - 40, 32, 600);
      c.fillStyle = "#ffffff";
      caber(c, ult.de, w / 2, 424, w - 40, 36, 800);
      c.fillStyle = "#cbd5e1";
      caber(c, curto(ult.assunto, 24), w / 2, 482, w - 40, 32, 600);
    }
  });
  return (
    <group>
      <Monitor pos={POS.ana} giro={0.42} tex={texAna} />
      {!semGolpista && <Monitor pos={POS.golpista} giro={0.2} tex={texGolpe} cor="#3a1418" />}
      <group position={[POS.bruno.x, POS.bruno.y, POS.bruno.z]} rotation={[0, -0.5, 0]}>
        <mesh position={[0, 0.25, 0]} rotation={[-0.22, 0, 0]}>
          <boxGeometry args={[1.22, 2.1, 0.12]} />
          <meshStandardMaterial color="#0b1220" roughness={0.35} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.25, 0.07]} rotation={[-0.22, 0, 0]}>
          <planeGeometry args={[1.1, 1.96]} />
          <meshBasicMaterial map={texBruno} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
};

// ---------- DNS ----------

const texDns = (sim: Sim) => {
  const linhas: [string, string, string, boolean][] = [
    [DOM_EMPRESA, "MX", `${HOST_MX}  (IP ${IP_DESTINO})`, true],
    [DOM_LOJA, "SPF", textoSpf(sim) || "não publicado", sim.dns.spf],
    [DOM_LOJA, "DKIM", sim.dns.dkim ? "chave pública da assinatura" : "não publicado", sim.dns.dkim],
    [DOM_LOJA, "DMARC", textoDmarc(sim).replace(/; rua=.*/, "") || "não publicado", sim.dns.dmarc !== "ausente"],
  ];
  return textura(`dns|${sim.dns.spf}|${sim.dns.dkim}|${sim.dns.dmarc}`, 1520, 700, (c, w, h) => {
    c.fillStyle = "#0a1325";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#fde047";
    c.lineWidth = 12;
    c.strokeRect(6, 6, w - 12, h - 12);
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillStyle = "#fde047";
    c.font = `800 62px ${FONTE}`;
    c.fillText("DNS", 44, 76);
    c.fillStyle = "#cbd5e1";
    c.font = `600 40px ${FONTE}`;
    c.fillText("a lista pública de endereços da internet", 200, 80);
    linhas.forEach(([dom, tipo, valor, ok], i) => {
      const y = 150 + i * 132;
      c.fillStyle = ok ? "#10233f" : "#2a1418";
      caixaArredondada(c, 36, y, w - 72, 112, 18);
      c.fill();
      c.fillStyle = "#9fb3d9";
      c.font = `600 38px ${FONTE}`;
      c.fillText(dom, 62, y + 58);
      c.fillStyle = ok ? "#34d399" : "#7f1d1d";
      caixaArredondada(c, 420, y + 20, 190, 72, 16);
      c.fill();
      c.fillStyle = ok ? "#052e1c" : "#fecaca";
      c.textAlign = "center";
      c.font = `800 42px ${FONTE}`;
      c.fillText(tipo, 515, y + 58);
      c.textAlign = "left";
      c.fillStyle = ok ? "#ffffff" : "#fca5a5";
      caber(c, valor, 640, y + 58, w - 700, 42, 700);
    });
  });
};

const Dns: React.FC<{ sim: Sim }> = ({ sim }) => (
  <group>
    <group position={[POS.dns.x, POS.dns.y, POS.dns.z]}>
      <mesh position={[0, 0, -0.08]}>
        <boxGeometry args={[DNS_TAM.w + 0.3, DNS_TAM.h + 0.3, 0.14]} />
        <meshStandardMaterial color="#1a2742" roughness={0.4} metalness={0.5} emissive="#3b3204" />
      </mesh>
      <mesh>
        <planeGeometry args={[DNS_TAM.w, DNS_TAM.h]} />
        <meshBasicMaterial map={texDns(sim)} toneMapped={false} />
      </mesh>
    </group>
    {[-3.2, 3.2].map((x) => (
      <mesh key={x} position={[x, (CHAO + POS.dns.y - DNS_TAM.h / 2) / 2, POS.dns.z - 0.1]}>
        <boxGeometry args={[0.16, POS.dns.y - DNS_TAM.h / 2 - CHAO, 0.16]} />
        <meshStandardMaterial color="#22345a" roughness={0.5} metalness={0.5} />
      </mesh>
    ))}
  </group>
);

// ---------- Pórtico de conferência ----------

type Luz = Nota | "conferindo" | "parado";
const COR_LUZ: Record<Luz, string> = { pass: "#34d399", fail: "#ef4444", none: "#64748b", conferindo: "#fbbf24", parado: "#1f2c4a" };
const TXT_LUZ: Record<Luz, string> = { pass: "passou", fail: "falhou", none: "ausente", conferindo: "conferindo", parado: "" };

const texPortico = (l: [Luz, Luz, Luz], pisca: boolean) =>
  textura(`portico|${l.join()}|${pisca}`, 1040, 380, (c, w, h) => {
    c.fillStyle = "#0b1426";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#3b82f6";
    c.lineWidth = 10;
    c.strokeRect(5, 5, w - 10, h - 10);
    c.textAlign = "center";
    c.fillStyle = "#cbd5e1";
    c.font = `800 44px ${FONTE}`;
    c.fillText("CONFERÊNCIA NA CHEGADA", w / 2, 62);
    ["SPF", "DKIM", "DMARC"].forEach((nome, i) => {
      const x = 30 + i * 330;
      const est = l[i];
      c.fillStyle = est === "conferindo" && !pisca ? "#5b3d05" : COR_LUZ[est];
      caixaArredondada(c, x, 96, 310, 256, 28);
      c.fill();
      c.fillStyle = est === "parado" ? "#8fa3c8" : est === "conferindo" && !pisca ? "#fcd34d" : "#06101f";
      c.font = `800 86px ${FONTE}`;
      c.fillText(nome, x + 155, 210);
      c.font = `800 46px ${FONTE}`;
      c.fillText(TXT_LUZ[est], x + 155, 300);
    });
  });

const Portico: React.FC<{ sim: Sim; tempo: number }> = ({ sim, tempo }) => {
  const conf = naPorta(sim).some((m) => !m.resultado);
  const recente = sim.ultimo && sim.t - sim.ultimo.t < 3.2 ? sim.ultimo.r : undefined;
  const l: [Luz, Luz, Luz] = conf ? ["conferindo", "conferindo", "conferindo"] : recente ? [recente.spf, recente.dkim, recente.dmarc] : ["parado", "parado", "parado"];
  const corLuz = conf ? COR.ambar : recente ? (recente.acao === "entrada" ? COR.verde : recente.acao === "spam" ? COR.ambar : COR.vermelho) : "#3b82f6";
  const p = POS.porta;
  const alto = 2.75;
  return (
    <group position={[p.x, 0, p.z]}>
      {[-1.45, 1.45].map((x) => (
        <mesh key={x} position={[x, (CHAO + alto) / 2, -0.25]}>
          <boxGeometry args={[0.16, alto - CHAO, 0.16]} />
          <meshStandardMaterial color="#22345a" roughness={0.5} metalness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, alto - 0.05, -0.3]}>
        <boxGeometry args={[3.2, 1.22, 0.12]} />
        <meshStandardMaterial color="#1a2742" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, alto - 0.05, -0.23]}>
        <planeGeometry args={[3.08, 1.12]} />
        <meshBasicMaterial map={texPortico(l, Math.sin(tempo * 9) > 0)} toneMapped={false} />
      </mesh>
      {/* tapete da porta: acende com o veredito */}
      <mesh position={[0, CHAO + 0.03, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.25, 40]} />
        <meshBasicMaterial color={corLuz} transparent opacity={conf || recente ? 0.4 : 0.14} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 1.2, 0.6]} color={corLuz} intensity={conf || recente ? 10 : 2} distance={6} />
    </group>
  );
};

// ---------- Caixas do Bruno ----------

const texPlaca = (titulo: string, sub: string, cor: string, alerta: boolean) =>
  textura(`placa|${titulo}|${sub}|${cor}|${alerta}`, 800, 250, (c, w, h) => {
    c.fillStyle = alerta ? "#3a1216" : "#0b1426";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = cor;
    c.lineWidth = 12;
    c.strokeRect(6, 6, w - 12, h - 12);
    c.textAlign = "center";
    c.fillStyle = "#ffffff";
    caber(c, titulo, w / 2, 108, w - 50, 78, 800);
    c.fillStyle = cor;
    caber(c, sub, w / 2, 192, w - 50, 50, 700);
  });

const Bandeja: React.FC<{ pos: THREE.Vector3; itens: Entregue[]; titulo: string; sub: string; cor: string; alerta?: boolean }> = ({ pos, itens, titulo, sub, cor, alerta = false }) => {
  const ultimos = itens.slice(-8);
  return (
    <group position={[pos.x, pos.y, pos.z]}>
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[2.7, 0.2, 1.9]} />
        <meshStandardMaterial color="#16223a" roughness={0.5} metalness={0.4} emissive={cor} emissiveIntensity={0.12} />
      </mesh>
      <mesh position={[0, 0.72, -1.02]}>
        <boxGeometry args={[2.7, 0.95, 0.08]} />
        <meshStandardMaterial color="#1a2742" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.72, -0.97]}>
        <planeGeometry args={[2.6, 0.85]} />
        <meshBasicMaterial map={texPlaca(titulo, sub, cor, alerta)} toneMapped={false} />
      </mesh>
      {ultimos.map((e, i) => {
        const h = (e.id * 2654435761) >>> 0;
        return (
          <mesh key={e.id} position={[((h & 255) / 255 - 0.5) * 0.5, -0.05 + i * 0.085, (((h >> 8) & 255) / 255 - 0.5) * 0.3]} rotation={[0, ((h >> 16) & 255) / 255 - 0.5, 0]}>
            <boxGeometry args={[1.25, 0.07, 0.8]} />
            <meshStandardMaterial color={e.falsa ? COR.falsa : "#dbeafe"} emissive={e.falsa ? COR.falsa : "#3b82f6"} emissiveIntensity={e.falsa ? 0.7 : 0.25} roughness={0.5} />
          </mesh>
        );
      })}
    </group>
  );
};

// ---------- Fios ----------

const Fios: React.FC<{ baixa?: boolean; semGolpista?: boolean }> = ({ baixa, semGolpista }) => {
  const tubos = useMemo(() => FIOS.map((f) => new THREE.TubeGeometry(curva(f.t), baixa ? 24 : 48, 0.028, baixa ? 5 : 8, false)), [baixa]);
  return (
    <group>
      {FIOS.map((f, i) => (
        <mesh key={f.t} geometry={tubos[i]} visible={!(semGolpista && f.t === "golpista>destino")}>
          <meshBasicMaterial color={f.cor} transparent opacity={0.5} />
        </mesh>
      ))}
    </group>
  );
};

// ---------- Mensagens em voo ----------

const texEnvelope = (cor: string) =>
  textura(`env|${cor}`, 380, 240, (c, w, h) => {
    c.fillStyle = "#f8fafc";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = cor;
    c.lineWidth = 16;
    c.strokeRect(8, 8, w - 16, h - 16);
    c.lineWidth = 10;
    c.beginPath();
    c.moveTo(12, 14);
    c.lineTo(w / 2, h * 0.58);
    c.lineTo(w - 12, 14);
    c.stroke();
  });

const texEtiqueta = (txt: string, cor: string) =>
  textura(`etq|${txt}|${cor}`, 900, 130, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#060b16ee";
    caixaArredondada(c, 4, 4, w - 8, h - 8, 30);
    c.fill();
    c.strokeStyle = cor;
    c.lineWidth = 8;
    c.stroke();
    c.fillStyle = "#ffffff";
    c.textAlign = "center";
    c.textBaseline = "middle";
    caber(c, txt, w / 2, h / 2 + 3, w - 50, 62, 700);
  });

const etiqueta = (sim: Sim, m: Msg): string => {
  if (m.tipo === "consulta" || m.tipo === "resposta") return curto(m.texto ?? "", 46);
  if (m.tipo === "aviso") return "cópia para o celular";
  if (m.tipo === "devolucao") return "Devolução: " + curto(m.motivo ?? "", 34);
  if (m.estado === "fila") {
    if (m.fase === "espera") return `na fila: nova tentativa em ${Math.max(1, Math.ceil(m.proxima - sim.t))} s`;
    return sim.filaParada ? "guardada na fila" : m.fase === "mx" ? "na fila: perguntando o caminho" : "na fila";
  }
  if (m.retorno) return (m.codigo ? m.codigo.split(" ")[0] + ": " : "") + (m.retorno === "temp" ? "tente mais tarde" : "recusada");
  return "De: " + m.de;
};

const Mensagem: React.FC<{ sim: Sim; m: Msg; comEtiqueta: boolean; aoClicar?: (id: number) => void }> = ({ sim, m, comEtiqueta, aoClicar }) => {
  const p = posMsg(sim, m, v3);
  const cor = corMsg(m);
  const pequeno = m.tipo === "consulta" || m.tipo === "resposta" || m.tipo === "aviso";
  const mats = useMemo(() => {
    const lado = new THREE.MeshBasicMaterial({ color: cor, toneMapped: false });
    const frente = new THREE.MeshBasicMaterial({ map: texEnvelope(cor), toneMapped: false });
    return [lado, lado, lado, lado, frente, frente];
  }, [cor]);
  return (
    <group position={[p.x, p.y, p.z]}>
      {pequeno ? (
        <mesh>
          <sphereGeometry args={[m.tipo === "aviso" ? 0.14 : 0.17, 14, 14]} />
          <meshBasicMaterial color={cor} toneMapped={false} />
        </mesh>
      ) : (
        <group rotation={[-0.18, 0, 0]}>
          <mesh material={mats}>
            <boxGeometry args={[0.98, 0.62, 0.07]} />
          </mesh>
          {m.dkim && (
            <mesh position={[0.26, -0.1, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.13, 0.13, 0.05, 20]} />
              <meshBasicMaterial color={m.dkim.integra ? "#fbbf24" : "#dc2626"} toneMapped={false} />
            </mesh>
          )}
        </group>
      )}
      <mesh
        onClick={(ev) => {
          if (!aoClicar || pequeno) return;
          ev.stopPropagation();
          aoClicar(m.id);
        }}
      >
        <sphereGeometry args={[pequeno ? 0.3 : 0.62, 10, 10]} />
        <meshBasicMaterial color={cor} transparent opacity={0.14} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {comEtiqueta && (
        <mesh position={[0, pequeno ? 0.5 : 0.72, 0.1]} rotation={[-0.18, 0, 0]}>
          <planeGeometry args={[pequeno ? 3.0 : 3.3, pequeno ? 0.43 : 0.48]} />
          <meshBasicMaterial map={texEtiqueta(etiqueta(sim, m), cor)} transparent toneMapped={false} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
};

const Mensagens: React.FC<{ sim: Sim; aoClicar?: (id: number) => void }> = ({ sim, aoClicar }) => {
  const fila = naFila(sim);
  return (
    <group>
      {sim.msgs.map((m) => (
        // na fila, só a de cima leva etiqueta (as outras ficam empilhadas atrás)
        <Mensagem key={m.id} sim={sim} m={m} aoClicar={aoClicar} comEtiqueta={m.estado !== "fila" || fila[fila.length - 1] === m} />
      ))}
    </group>
  );
};

// ---------- A mensagem por dentro ----------

const texCampo = (c0: Campo) =>
  textura(`campo|${c0.nome}|${c0.valor}|${c0.nota}|${c0.cor}`, Math.round(c0.larg * 150), 190, (c, w, h) => {
    c.fillStyle = "#0b1426";
    c.fillRect(0, 0, w, h);
    c.fillStyle = c0.cor;
    c.globalAlpha = 0.22;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
    c.fillRect(0, 0, w, 12);
    c.strokeStyle = c0.cor;
    c.lineWidth = 6;
    c.strokeRect(3, 3, w - 6, h - 6);
    c.textAlign = "center";
    c.fillStyle = "#cdd9f2";
    caber(c, c0.nome, w / 2, 54, w - 24, 30, 700);
    c.fillStyle = "#ffffff";
    caber(c, c0.valor, w / 2, 112, w - 24, c0.valor.length > 14 ? 38 : 52, 800);
    c.fillStyle = c0.cor;
    caber(c, c0.nota, w / 2, 160, w - 24, 26, 700);
  });

const texRotulo = (txt: string, corTxt: string, tam = 54) =>
  textura(`rot|${txt}|${corTxt}|${tam}`, 1400, 110, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = corTxt;
    c.textAlign = "left";
    c.textBaseline = "middle";
    caber(c, txt, 10, h / 2, w - 20, tam, 800);
  });

const texCarimbo = (txt: string) =>
  textura("carimbo|" + txt, 1400, 200, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = "#ef4444";
    c.lineWidth = 12;
    caixaArredondada(c, 10, 10, w - 20, h - 20, 26);
    c.stroke();
    c.fillStyle = "rgba(239,68,68,0.2)";
    c.fill();
    c.fillStyle = "#fecaca";
    c.textAlign = "center";
    c.textBaseline = "middle";
    caber(c, txt, w / 2, h / 2 + 4, w - 70, 76, 800);
  });

const ALT = 1.3;
const PASSO_Y = 2.62;

const Bloco: React.FC<{ campo: Campo; x: number; y: number; alfa: number; destaque: boolean; apagar: boolean; pulso?: number }> = ({ campo, x, y, alfa, destaque, apagar, pulso = 0 }) => {
  const mats = useMemo(() => {
    const lado = new THREE.MeshStandardMaterial({ color: campo.cor, roughness: 0.4, metalness: 0.2, transparent: true });
    const frente = new THREE.MeshBasicMaterial({ map: texCampo(campo), toneMapped: false, transparent: true });
    return [lado, lado, lado, lado, frente, lado];
  }, [campo.nome, campo.valor, campo.nota, campo.cor, campo.larg]);
  const a = alfa * (apagar ? 0.55 : 1);
  mats[0].opacity = a;
  (mats[4] as THREE.MeshBasicMaterial).opacity = a;
  (mats[0] as THREE.MeshStandardMaterial).emissive.set(campo.cor);
  (mats[0] as THREE.MeshStandardMaterial).emissiveIntensity = destaque ? 0.9 + pulso : 0.15;
  if (alfa <= 0.01) return null;
  const s = (destaque ? 1.08 + pulso * 0.05 : 1) * (0.6 + 0.4 * Math.min(1, alfa));
  return (
    <mesh position={[x, y, destaque ? 0.55 : 0]} scale={[s, s, 1]} material={mats}>
      <boxGeometry args={[campo.larg, ALT, 0.4]} />
    </mesh>
  );
};

const LinhaCampos: React.FC<{ campos: Campo[]; y: number; folga: number; alfa: number; hl: number; base: number; pulso?: number }> = ({ campos, y, folga, alfa, hl, base, pulso }) => {
  const total = campos.reduce((s, c) => s + c.larg, 0) + folga * (campos.length - 1);
  let x = -total / 2;
  return (
    <group>
      {campos.map((c, i) => {
        const cx = x + c.larg / 2;
        x += c.larg + folga;
        const idx = base + i;
        return <Bloco key={c.nome} campo={c} x={cx} y={y} alfa={alfa} destaque={hl === idx} apagar={hl >= 0 && hl !== idx} pulso={pulso} />;
      })}
    </group>
  );
};

const Rotulo: React.FC<{ txt: string; y: number; alfa: number; cor?: string }> = ({ txt, y, alfa, cor: c = "#e8eefc" }) =>
  alfa <= 0.01 ? null : (
    <mesh position={[-0.2, y, 0.05]}>
      <planeGeometry args={[14, 1.1]} />
      <meshBasicMaterial map={texRotulo(txt, c)} transparent opacity={alfa} toneMapped={false} depthWrite={false} />
    </mesh>
  );

const suave = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export const MsgAberta: React.FC<{ d: Dissec; tempo: number }> = ({ d, tempo }) => {
  const e = suave(d.e);
  const pulso = 0.5 + 0.5 * Math.sin(tempo * 6);
  const n = d.fileiras.length;
  const topo = ((n - 1) * PASSO_Y) / 2 + 0.1;
  const carimbo = suave(d.carimbo?.a ?? 0);
  return (
    <group position={[PALCO.x, PALCO.y, PALCO.z]}>
      <mesh position={[0, 0.2, -1.2]}>
        <planeGeometry args={[140, 70]} />
        <meshBasicMaterial color="#060a14" transparent opacity={suave(d.e * 4)} depthWrite={false} />
      </mesh>
      {d.fileiras.map((f, i) => {
        const a = e * suave(f.a);
        const y = topo - i * PASSO_Y;
        return (
          <group key={f.titulo}>
            <Rotulo txt={f.titulo} y={y + 1.22} alfa={a} cor={f.cor} />
            <LinhaCampos campos={f.campos} y={y} folga={0.03 + 0.17 * e} alfa={a} hl={d.hl} base={i * 10} pulso={pulso} />
          </group>
        );
      })}
      {d.carimbo && carimbo > 0.01 && (
        <mesh position={[5.0, topo + 1.3, 0.7]} rotation={[0, 0, -0.03]} scale={[1.5 - 0.5 * carimbo, 1.5 - 0.5 * carimbo, 1]}>
          <planeGeometry args={[4.9, 0.7]} />
          <meshBasicMaterial map={texCarimbo(d.carimbo.txt)} transparent opacity={carimbo} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
};

// ---------- Cena ----------

export const Cena3D: React.FC<PropsCena> = ({ sim, tempo, cam, dissec, baixa, semGolpista, aoClicarMsg, aspecto = 16 / 9, registrar }) => {
  const grade = useMemo(() => {
    const g = new THREE.GridHelper(140, 90, "#1c3a6e", "#101d36");
    (g.material as THREE.Material).transparent = true;
    (g.material as THREE.Material).opacity = 0.55;
    return g;
  }, []);
  const fila = naFila(sim).length;
  return (
    <>
      <color attach="background" args={[COR.fundo]} />
      <fog attach="fog" args={[COR.fundo, 34, 86]} />
      <Rig cam={cam} aspecto={aspecto} registrar={registrar} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[6, 14, 10]} intensity={1.5} />
      <directionalLight position={[-10, 6, -6]} intensity={0.5} color="#60a5fa" />
      <primitive object={grade} position={[0, CHAO, 0]} />
      <Fios baixa={baixa} semGolpista={semGolpista} />
      <Rack pos={POS.envio} titulo="Servidor de envio" host={HOST_ENVIO} ip={IP_ENVIO} estado={fila ? `fila: ${fila}` : "fila vazia"} corEstado={fila ? "#fbbf24" : "#34d399"} />
      <Rack
        pos={POS.destino}
        titulo="Servidor de destino"
        host={HOST_MX}
        ip={IP_DESTINO}
        estado={sim.destino.noAr ? "no ar" : "FORA DO AR"}
        corEstado={sim.destino.noAr ? "#34d399" : "#ef4444"}
        ruim={!sim.destino.noAr}
      />
      <Dns sim={sim} />
      <Portico sim={sim} tempo={tempo} />
      <Bandeja pos={POS.caixa} itens={sim.caixa} titulo="Caixa de entrada" sub={sim.destino.cheia ? "CHEIA" : `${sim.caixa.length} mensage${sim.caixa.length === 1 ? "m" : "ns"}`} cor={sim.destino.cheia ? "#ef4444" : "#34d399"} alerta={sim.destino.cheia} />
      <Bandeja pos={POS.spam} itens={sim.spam} titulo="Spam" sub={`${sim.spam.length} mensage${sim.spam.length === 1 ? "m" : "ns"}`} cor="#f59e0b" />
      <Pessoas sim={sim} semGolpista={semGolpista} />
      <Mensagens sim={sim} aoClicar={aoClicarMsg} />
      {dissec && dissec.e > 0.001 && <MsgAberta d={dissec} tempo={tempo} />}
    </>
  );
};
