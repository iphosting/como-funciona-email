import { describe, expect, it } from "vitest";
import {
  ANA,
  MAX_TENT,
  adulterar,
  avaliar,
  criarSim,
  definirCaixaCheia,
  definirDmarc,
  definirNoAr,
  enviar,
  enviarFalso,
  naFila,
  passo,
  publicar,
  type Sim,
} from "./sim";

const rodar = (s: Sim, segundos: number) => {
  for (let i = 0; i < Math.round(segundos * 60); i++) passo(s, 1 / 60);
};
const falas = (s: Sim) => s.conversa.map((f) => f.txt).join("\n");
const protegerTudo = (s: Sim) => {
  publicar(s, "spf", true);
  publicar(s, "dkim", true);
  definirDmarc(s, "reject");
};

describe("o caminho normal", () => {
  it("a mensagem da Ana passa pela fila, pelo DNS e pela conversa SMTP, e chega à caixa de entrada do Bruno", () => {
    const s = criarSim();
    enviar(s);
    rodar(s, 1.7);
    expect(naFila(s).length).toBe(1); // o servidor de envio guardou e assumiu a mensagem
    rodar(s, 20);
    expect(s.caixa.length).toBe(1);
    expect(s.caixa[0].de).toBe(ANA);
    expect(s.cont.entregues).toBe(1);
    expect(s.bruno.vistas).toBe(1);
    expect(s.msgs.length).toBe(0);
    expect(s.ana.devolucoes.length).toBe(0);
  });

  it("antes de entregar, o servidor de envio pergunta o MX ao DNS, e o destino pergunta o que o remetente publica", () => {
    const s = criarSim();
    enviar(s);
    rodar(s, 20);
    expect(s.cont.consultasDns).toBe(2);
    expect(falas(s)).toContain("MX de empresa.example = mx.empresa.example");
  });

  it("a conversa entre os servidores tem MAIL FROM, RCPT TO, DATA e o 250 de aceite", () => {
    const s = criarSim();
    enviar(s);
    rodar(s, 20);
    const t = falas(s);
    expect(t).toContain("MAIL FROM:<ana@loja.example>");
    expect(t).toContain("RCPT TO:<bruno@empresa.example>");
    expect(t).toContain("DATA");
    expect(t).toContain("250 2.0.0 OK");
  });
});

describe("a fraude e as três proteções", () => {
  it("sem SPF, DKIM e DMARC, a mensagem do golpista com o nome da Ana entra na caixa de entrada", () => {
    const s = criarSim();
    enviarFalso(s, "simples");
    rodar(s, 15);
    expect(s.cont.falsasNaCaixa).toBe(1);
    expect(s.caixa[0].de).toBe(ANA); // o Bruno vê o endereço da Ana
    expect(s.caixa[0].falsa).toBe(true);
  });

  it("a decisão do servidor não usa a marca de falsa: só o que está no DNS e na mensagem", () => {
    const s = criarSim();
    protegerTudo(s);
    const m = { de: ANA, envDe: ANA, ip: "198.51.100.66", dkim: undefined };
    expect(avaliar(s, { ...m, falsa: true } as never)).toEqual(avaliar(s, { ...m, falsa: false } as never));
  });

  it("só com SPF: o golpista simples vai para o spam, mas o esperto (envelope do domínio dele) ainda entra", () => {
    const s = criarSim();
    publicar(s, "spf", true);
    enviarFalso(s, "simples");
    rodar(s, 15);
    expect(s.spam.length).toBe(1);
    expect(s.cont.falsasNaCaixa).toBe(0);
    enviarFalso(s, "esperto");
    rodar(s, 15);
    expect(s.ultimo!.r.spf).toBe("pass"); // passou no SPF do domínio DELE
    expect(s.ultimo!.r.spfAlinhado).toBe(false);
    expect(s.cont.falsasNaCaixa).toBe(1);
  });

  it("com SPF, DKIM e DMARC em reject, os dois golpistas são recusados na porta e a Ana continua entregando", () => {
    const s = criarSim();
    protegerTudo(s);
    enviarFalso(s, "simples");
    enviarFalso(s, "esperto");
    rodar(s, 20);
    expect(s.cont.falsasNaCaixa).toBe(0);
    expect(s.cont.falsasBarradas).toBe(2);
    expect(s.caixa.length).toBe(0);
    expect(s.spam.length).toBe(0);
    expect(falas(s)).toContain("550 5.7.1");
    enviar(s);
    rodar(s, 20);
    expect(s.cont.entregues).toBe(1);
    expect(s.ultimo!.r).toMatchObject({ spf: "pass", dkim: "pass", dmarc: "pass", acao: "entrada" });
  });

  it("recusar o golpista na porta não gera devolução para a Ana", () => {
    const s = criarSim();
    protegerTudo(s);
    enviarFalso(s, "simples");
    rodar(s, 20);
    expect(s.ana.devolucoes.length).toBe(0);
    expect(s.cont.devolvidas).toBe(0);
  });

  it("a política do DMARC decide o destino da reprovada: none entrega, quarantine manda para o spam", () => {
    const a = criarSim();
    publicar(a, "spf", true);
    publicar(a, "dkim", true);
    definirDmarc(a, "none");
    enviarFalso(a, "esperto");
    rodar(a, 15);
    expect(a.ultimo!.r.dmarc).toBe("fail");
    expect(a.cont.falsasNaCaixa).toBe(1);

    const b = criarSim();
    publicar(b, "spf", true);
    publicar(b, "dkim", true);
    definirDmarc(b, "quarantine");
    enviarFalso(b, "esperto");
    rodar(b, 15);
    expect(b.spam.length).toBe(1);
    expect(b.cont.falsasNaCaixa).toBe(0);
  });

  it("mensagem alterada no caminho perde a assinatura DKIM; sem SPF para salvar, o DMARC recusa e ela é devolvida", () => {
    const s = criarSim();
    publicar(s, "dkim", true);
    definirDmarc(s, "reject");
    enviar(s);
    rodar(s, 5);
    expect(adulterar(s)).toBe(true);
    rodar(s, 20);
    expect(s.ultimo!.r.dkim).toBe("fail");
    expect(s.caixa.length).toBe(0);
    expect(s.ana.devolucoes.length).toBe(1);
  });

  it("com SPF alinhado, a mensagem alterada ainda passa no DMARC (basta um dos dois)", () => {
    const s = criarSim();
    protegerTudo(s);
    enviar(s);
    rodar(s, 5);
    expect(adulterar(s)).toBe(true);
    rodar(s, 20);
    expect(s.ultimo!.r).toMatchObject({ dkim: "fail", spf: "pass", dmarc: "pass" });
    expect(s.caixa.length).toBe(1);
  });

  it("DMARC em reject sem SPF nem DKIM publicados derruba o e-mail verdadeiro da própria Ana", () => {
    const s = criarSim();
    definirDmarc(s, "reject");
    enviar(s);
    rodar(s, 25);
    expect(s.caixa.length).toBe(0);
    expect(s.ana.devolucoes[0].codigo).toBe("550 5.7.1");
  });
});

describe("por que o e-mail volta", () => {
  it("endereço que não existe: erro 550 definitivo, devolução na hora, sem nova tentativa", () => {
    const s = criarSim();
    enviar(s, { para: "brunno@empresa.example" });
    rodar(s, 20);
    expect(s.ana.devolucoes.length).toBe(1);
    expect(s.ana.devolucoes[0].codigo).toBe("550 5.1.1");
    expect(s.cont.novasTentativas).toBe(0);
    expect(s.caixa.length).toBe(0);
  });

  it("domínio que não existe: o DNS avisa e a mensagem nem sai do servidor de envio", () => {
    const s = criarSim();
    enviar(s, { para: "bruno@empreza.example" });
    rodar(s, 10);
    expect(s.ana.devolucoes[0].motivo).toContain("não existe");
    expect(falas(s)).not.toContain("MAIL FROM");
  });

  it("caixa cheia: erro 452 temporário, o servidor tenta de novo e só devolve depois de esgotar as tentativas", () => {
    const s = criarSim();
    definirCaixaCheia(s, true);
    enviar(s);
    rodar(s, 12);
    expect(s.ana.devolucoes.length).toBe(0); // ainda tentando
    expect(s.cont.novasTentativas).toBeGreaterThanOrEqual(1);
    rodar(s, 40);
    expect(s.cont.novasTentativas).toBe(MAX_TENT - 1);
    expect(s.ana.devolucoes.length).toBe(1);
    expect(s.ana.devolucoes[0].motivo).toContain("desistiu");
    expect(s.msgs.length).toBe(0);
  });

  it("se o Bruno esvazia a caixa a tempo, a nova tentativa entrega e nada é devolvido", () => {
    const s = criarSim();
    definirCaixaCheia(s, true);
    enviar(s);
    rodar(s, 12);
    definirCaixaCheia(s, false);
    rodar(s, 25);
    expect(s.caixa.length).toBe(1);
    expect(s.ana.devolucoes.length).toBe(0);
  });

  it("servidor de destino fora do ar: a mensagem espera na fila e é entregue quando ele volta", () => {
    const s = criarSim();
    definirNoAr(s, false);
    enviar(s);
    rodar(s, 9);
    expect(naFila(s).length).toBe(1);
    definirNoAr(s, true);
    rodar(s, 25);
    expect(s.caixa.length).toBe(1);
    expect(s.cont.devolvidas).toBe(0);
  });
});
