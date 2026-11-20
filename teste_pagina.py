#!/usr/bin/env python3
"""Abre a página num Chromium automático, clica nos controles e guarda capturas em out/pagina/.

  python3 teste_pagina.py                 testa o pacote local (dist/), servido numa porta temporária
  python3 teste_pagina.py https://...     testa a página publicada

Confere o que a página promete: sem proteção a mensagem falsa entra na caixa de entrada; com SPF, DKIM e
DMARC em reject ela é barrada e a verdadeira continua entrando; endereço errado gera devolução; a mensagem
abre; a visita guiada toca a narração. Sai com código 1 se aparecer erro no console ou algum passo falhar.
"""
import functools, http.server, pathlib, sys, threading
from playwright.sync_api import sync_playwright

BASE = pathlib.Path(__file__).resolve().parent
SAIDA = BASE / "out" / "pagina"
SAIDA.mkdir(parents=True, exist_ok=True)

def servir():
    class Quieto(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k): pass
    h = functools.partial(Quieto, directory=str(BASE / "dist"))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return "http://127.0.0.1:%d/" % srv.server_address[1]

LER = """(r) => { const d=[...document.querySelectorAll('.ind .grade > div')].find(x=>x.textContent.includes(r)); return d ? parseInt(d.querySelector('b').textContent.replace(/\\./g,''),10) : -1 }"""

def numero(pg, rotulo):
    """Valor do indicador cujo texto de apoio contém `rotulo`."""
    return pg.evaluate(LER, rotulo)

def esperar(pg, rotulo, minimo, ms=60000):
    try:
        pg.wait_for_function("([r,m]) => { const d=[...document.querySelectorAll('.ind .grade > div')].find(x=>x.textContent.includes(r)); return d && parseInt(d.querySelector('b').textContent,10) >= m }", arg=[rotulo, minimo], timeout=ms)
    except Exception:
        pass
    return numero(pg, rotulo)

def rodar(url, nome, largura, altura, movel):
    erros, falhas = [], []
    with sync_playwright() as p:
        nav = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
        ctx = nav.new_context(viewport={"width": largura, "height": altura}, device_scale_factor=2 if movel else 1, is_mobile=movel, has_touch=movel)
        pg = ctx.new_page()
        pg.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: erros.append(str(e)))
        r = pg.goto(url, wait_until="networkidle")
        print(nome, "HTTP", r.status)
        pg.wait_for_selector("canvas", timeout=20000)
        pg.wait_for_timeout(1500)
        pg.screenshot(path=str(SAIDA / f"{nome}-1-inicio.png"))
        botao = lambda n: pg.get_by_role("button", name=n, exact=False).first
        botao("Explorar livre").click()
        botao("Velocidade").click(); botao("Velocidade").click(); botao("Velocidade").click()   # 2x, para o teste andar
        if movel: botao("Mostrar painel").click()
        # 1. a primeira mensagem da Ana chega
        v = esperar(pg, "verdadeiras", 1)
        print(nome, "verdadeiras entregues:", v)
        if v < 1: falhas.append("a mensagem da Ana não chegou")
        pg.screenshot(path=str(SAIDA / f"{nome}-2-livre.png"))
        # 2. sem proteção, a falsa entra
        if movel: botao("Esconder painel").click()
        botao("Golpista finge ser a Ana").click()
        if movel: botao("Mostrar painel").click()
        f = esperar(pg, "falsas na caixa", 1)
        print(nome, "falsas na caixa de entrada, sem proteção:", f)
        if f < 1: falhas.append("sem proteção a mensagem falsa deveria entrar")
        pg.screenshot(path=str(SAIDA / f"{nome}-3-fraude.png"))
        # 3. com as três proteções, as duas falsas são barradas
        if movel: botao("Esconder painel").click()
        botao("SPF:").click(); botao("DKIM:").click()
        for _ in range(3): botao("DMARC:").click()
        pg.wait_for_timeout(400)
        if not botao("DMARC:").inner_text().strip().endswith("reject (recusa)"): falhas.append("o DMARC não chegou a reject")
        botao("Golpista finge ser a Ana").click()
        botao("Golpista esperto").click()
        botao("Ana envia um e-mail").click()
        if movel: botao("Mostrar painel").click()
        b = esperar(pg, "barradas", 2)
        v2 = esperar(pg, "verdadeiras", 2)
        f2 = numero(pg, "falsas na caixa")
        print(nome, "com SPF, DKIM e DMARC: barradas", b, "| falsas na caixa", f2, "| verdadeiras", v2)
        if b < 2: falhas.append("as falsas não foram barradas com a proteção")
        if f2 != f: falhas.append("entrou mensagem falsa mesmo com a proteção")
        if v2 < 2: falhas.append("a verdadeira deixou de entrar com a proteção")
        pg.screenshot(path=str(SAIDA / f"{nome}-4-protegido.png"))
        # 4. endereço errado volta
        if movel: botao("Esconder painel").click()
        botao("Enviar para endereço errado").click()
        if movel: botao("Mostrar painel").click()
        d = esperar(pg, "devolvidas", 1)
        print(nome, "devolvidas à Ana:", d)
        if d < 1: falhas.append("o endereço errado não gerou devolução")
        pg.screenshot(path=str(SAIDA / f"{nome}-5-devolucao.png"))
        # 5. abrir uma mensagem
        if movel: botao("Esconder painel").click()
        botao("Abrir uma mensagem").click()
        pg.wait_for_timeout(2500)
        if not pg.locator(".ficha").is_visible(): falhas.append("a mensagem não abriu")
        pg.screenshot(path=str(SAIDA / f"{nome}-6-aberta.png"))
        botao("Fechar a mensagem e voltar").click()
        pg.wait_for_timeout(1500)
        # 6. visita guiada
        botao("Visita guiada").click()
        pg.wait_for_timeout(7000)
        if not pg.locator(".hud .titulo h1").is_visible(): falhas.append("a visita guiada não mostrou o título")
        tempo = pg.evaluate("document.querySelector('audio').currentTime")
        print(nome, "narração tocando, segundos:", round(tempo, 1))
        if tempo < 2: falhas.append("a narração não tocou")
        pg.screenshot(path=str(SAIDA / f"{nome}-7-visita.png"))
        nav.close()
    for e in erros: print(nome, "ERRO NO CONSOLE:", e[:300])
    for f in falhas: print(nome, "FALHA:", f)
    return not erros and not falhas

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else servir()
    ok = rodar(url, "desktop", 1440, 900, False)
    ok = rodar(url, "celular", 390, 844, True) and ok
    print("RESULTADO:", "ok" if ok else "COM PROBLEMA")
    sys.exit(0 if ok else 1)
