// Painéis de tela por cima da cena 3D: título, o que o domínio publica no DNS, a conferência na chegada,
// a conversa entre os servidores, o placar e a legenda. Em HTML para o texto ficar nítido em qualquer
// tamanho. Usado igual na página e no vídeo.
import React from "react";
import { DOM_LOJA, naFila, textoDmarc, textoSpf, type Nota, type Sim } from "./sim/sim";
import { COR } from "./three/geo";
import type { Cartao } from "./tour";

export type Destaque = "dns" | "conferencia" | "conversa" | "placar";

const fmt = (n: number) => n.toLocaleString("pt-BR");

export const PainelDns: React.FC<{ sim: Sim; grande?: boolean }> = ({ sim, grande }) => {
  const linhas: [string, string, boolean, string][] = [
    ["SPF", textoSpf(sim), sim.dns.spf, "quem pode enviar"],
    ["DKIM", sim.dns.dkim ? "chave pública da assinatura" : "", sim.dns.dkim, "o lacre"],
    ["DMARC", textoDmarc(sim).replace(/; rua=.*/, ""), sim.dns.dmarc !== "ausente", "a ordem do dono"],
  ];
  return (
    <div className={"painel dns" + (grande ? " grande" : "")}>
      <div className="painel-titulo">
        <span>DNS de {DOM_LOJA}</span>
        <small>domínio da Ana</small>
      </div>
      {linhas.map(([nome, valor, ok, papel]) => (
        <div key={nome} className={"linha" + (ok ? "" : " errada")}>
          <span className="nome">{nome}</span>
          <span className="end">{ok ? valor : `não publicado (${papel})`}</span>
          <span className="porta">{ok ? "publicado" : "falta"}</span>
        </div>
      ))}
    </div>
  );
};

const TXT: Record<Nota, string> = { pass: "passou", fail: "falhou", none: "ausente" };
const CLASSE: Record<Nota, string> = { pass: "ok", fail: "ruim", none: "neutra" };

export const PainelConferencia: React.FC<{ sim: Sim; grande?: boolean }> = ({ sim, grande }) => {
  const u = sim.ultimo;
  return (
    <div className={"painel conf" + (grande ? " grande" : "") + (u && u.r.acao === "recusar" ? " alerta" : "")}>
      <div className="painel-titulo">
        <span>Conferência na chegada</span>
        <small>última mensagem</small>
      </div>
      {!u && <div className="vazio">nenhuma mensagem chegou ainda</div>}
      {u && (
        <>
          <div className="dados">
            <span>campo De</span>
            <b>{u.de}</b>
            <span>envelope</span>
            <b>{u.envDe}</b>
            <span>veio do IP</span>
            <b>{u.ip}</b>
          </div>
          <div className="estado">
            <span className={"tag " + CLASSE[u.r.spf]}>SPF {TXT[u.r.spf]}</span>
            <span className={"tag " + CLASSE[u.r.dkim]}>DKIM {TXT[u.r.dkim]}</span>
            <span className={"tag " + CLASSE[u.r.dmarc]}>DMARC {TXT[u.r.dmarc]}</span>
          </div>
          <div className="decisao">
            <b className={u.r.acao === "entrada" ? "ok" : u.r.acao === "spam" ? "ambar" : "ruim"}>{u.fim}</b>
            {u.r.explicacao}
          </div>
        </>
      )}
    </div>
  );
};

export const PainelConversa: React.FC<{ sim: Sim; grande?: boolean }> = ({ sim, grande }) => {
  const falas = sim.conversa.slice(grande ? -9 : -6);
  return (
    <div className={"painel conversa" + (grande ? " grande" : "")}>
      <div className="painel-titulo">
        <span>Conversa entre os servidores</span>
      </div>
      {falas.length === 0 && <div className="vazio">silêncio: ninguém enviou nada</div>}
      {falas.map((f, i) => (
        <div key={sim.conversa.length - falas.length + i} className={"fala-linha " + f.quem} style={{ color: f.cor }}>
          {f.quem !== "i" && <b>{f.quem}</b>}
          <span>{f.txt}</span>
        </div>
      ))}
    </div>
  );
};

export const Placar: React.FC<{ sim: Sim; grande?: boolean }> = ({ sim, grande }) => {
  const fila = naFila(sim);
  const fraude = sim.cont.falsasNaCaixa > 0;
  return (
    <div className={"painel ind" + (grande ? " grande" : "") + (fraude ? " alerta" : "")}>
      <div className="grade">
        <div>
          <b>{fmt(sim.cont.entregues)}</b>
          <span>verdadeiras entregues</span>
        </div>
        <div>
          <b style={{ color: fraude ? "#fca5a5" : undefined }}>{fmt(sim.cont.falsasNaCaixa)}</b>
          <span>falsas na caixa de entrada</span>
        </div>
        <div>
          <b style={{ color: sim.cont.falsasBarradas ? "#6ee7b7" : undefined }}>{fmt(sim.cont.falsasBarradas)}</b>
          <span>falsas barradas</span>
        </div>
        <div>
          <b style={{ color: sim.cont.devolvidas ? "#fcd34d" : undefined }}>{fmt(sim.cont.devolvidas)}</b>
          <span>devolvidas à Ana</span>
        </div>
      </div>
      <div className="estado">
        <span className={"tag " + (fila.length ? "ambar" : "neutra")}>fila de envio: {fila.length}</span>
        {sim.cont.novasTentativas > 0 && <span className="tag ambar">novas tentativas: {sim.cont.novasTentativas}</span>}
        {sim.destino.cheia && <span className="tag ruim">caixa do Bruno cheia</span>}
        {!sim.destino.noAr && <span className="tag ruim">destino fora do ar</span>}
      </div>
      <div className="nota">Tempo comprimido: na vida real, cada nova tentativa leva de minutos a horas.</div>
    </div>
  );
};

export const Legenda: React.FC = () => (
  <div className="cores">
    {[
      [COR.verdadeira, "mensagem verdadeira"],
      [COR.falsa, "mensagem falsa"],
      [COR.devolucao, "devolução"],
      [COR.dns, "consulta ao DNS"],
      ["#fbbf24", "lacre DKIM"],
    ].map(([c, n]) => (
      <span key={n}>
        <i style={{ background: c }} />
        {n}
      </span>
    ))}
  </div>
);

export interface PropsHud {
  sim: Sim;
  numero?: string;
  titulo?: string;
  sub?: string;
  fala?: string;
  destaque?: Destaque;
  cartao?: Cartao;
  /** Esconde os painéis (quando a mensagem aberta ocupa a tela). */
  limpo?: boolean;
  rodape?: string;
}

export const Hud: React.FC<PropsHud> = ({ sim, numero, titulo, sub, fala, destaque, cartao, limpo, rodape }) => (
  <div className="hud">
    {titulo && (
      <div className="titulo">
        {numero && <small>{numero}</small>}
        <h1>{titulo}</h1>
        {sub && <p>{sub}</p>}
      </div>
    )}
    {!limpo && (
      <div className="lateral">
        <PainelDns sim={sim} grande={destaque === "dns"} />
        <PainelConferencia sim={sim} grande={destaque === "conferencia"} />
        <PainelConversa sim={sim} grande={destaque === "conversa"} />
        <Placar sim={sim} grande={destaque === "placar"} />
      </div>
    )}
    {!limpo && <Legenda />}
    {cartao && cartao.a > 0.01 && (
      <div className="cartao" style={{ opacity: cartao.a, transform: `translate(-50%, -50%) scale(${0.9 + 0.1 * cartao.a})` }}>
        <h2>{cartao.titulo}</h2>
        {cartao.linhas.map((l) => (
          <div key={l} className={l.includes(".pages.dev") || l.includes(".com") ? "url" : ""}>
            {l}
          </div>
        ))}
      </div>
    )}
    {fala && <div className="fala">{fala}</div>}
    {rodape && <div className="rodape">{rodape}</div>}
  </div>
);
