"""
Teste ponta a ponta no navegador (Playwright), rodando contra o banco de demonstração.
Uso:  npm run build && npm run demo  (em outro terminal)  →  python3 tests/e2e_browser.py
Percorre: pedido no cardápio → confirmação → cozinha → motoboy (cobrança) → acompanhamento do cliente,
mesa pelo garçom e venda no PDV com troco.
"""
import os, sys
from playwright.sync_api import sync_playwright

B = os.environ.get('BASE_URL', 'http://localhost:3000')
S = os.environ.get('SHOTS_DIR', '/tmp/espetinho-shots/')
os.makedirs(S, exist_ok=True)
errs = []

SLUG = 'espetinho-do-sergio'

def login(page, u):
    page.goto(B + f'/{SLUG}/entrar'); page.fill('input[autocomplete=username]', u); page.fill('input[type=password]', 'demo1234')
    page.click('button[type=submit]'); page.wait_for_timeout(1000)

def check(cond, msg):
    print(('OK   ' if cond else 'FALHA') + ' ' + msg)
    if not cond: errs.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    def ctx(mobile):
        c = b.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1440, 'height': 900})
        pg = c.new_page(); pg.on('pageerror', lambda e: errs.append('JS: ' + str(e))); return pg

    # 1. cliente monta o pedido no celular
    m = ctx(True); m.goto(B + f'/{SLUG}'); m.wait_for_timeout(1000)
    m.locator('li button:has-text("Espeto de carne")').first.click(); m.wait_for_timeout(300)
    m.screenshot(path=S + 'e2e_product.png')
    m.locator('[role=dialog] button:has-text("Adicionar")').click()
    m.locator('li button:has-text("Combo (porção individual)")').first.click(); m.wait_for_timeout(300)
    m.locator('[role=dialog] button:has-text("Adicionar")').click(); m.wait_for_timeout(200)
    check(m.locator('text=Falta escolher').count() == 1, 'combo exige baião e espeto')
    m.screenshot(path=S + 'e2e_combo_missing.png')
    m.locator('[role=dialog] button:has-text("Baião mexido")').click(); m.locator('[role=dialog] button:text-is("Calabresa")').click()
    m.locator('[role=dialog] button:has-text("Adicionar")').click(); m.wait_for_timeout(200)
    m.locator('button:has-text("Ver carrinho")').click(); m.wait_for_timeout(300)
    m.fill('input[autocomplete=name]', 'Joana Teste'); m.fill('input[autocomplete=tel]', '83 98888-7777')
    m.fill('input[autocomplete=address-line1]', 'Rua das Flores'); m.locator('[role=dialog] select').select_option(index=2)
    m.locator('[role=dialog] button:text-is("Pix")').click()
    m.screenshot(path=S + 'e2e_checkout.png', full_page=True)
    m.locator('button:has-text("Enviar pedido")').click(); m.wait_for_url('**/pedido/**'); m.wait_for_timeout(800)
    check('registrado' in m.content(), 'cliente vê pedido registrado')
    m.screenshot(path=S + 'e2e_track.png', full_page=True)
    track = m.url

    # 2. gerente confirma e atribui motoboy
    a = ctx(False); login(a, 'gerente'); a.goto(B + '/admin/pedidos'); a.wait_for_timeout(1200)
    a.locator('article:has-text("Joana") button:has-text("Revisar e confirmar")').click(); a.wait_for_timeout(800)
    a.screenshot(path=S + 'e2e_drawer.png')
    a.locator('[role=dialog] button:has-text("Confirmar pedido")').click(); a.wait_for_timeout(300)
    a.locator('button:has-text("Confirmar e enviar para a cozinha")').click(); a.wait_for_timeout(900)
    a.locator('[role=dialog] select').first.select_option(label='Davi (motoboy demo) — 0 em rota/fila'); a.wait_for_timeout(700)
    a.keyboard.press('Escape'); a.wait_for_timeout(300)

    # 3. cozinha
    k = ctx(False); login(k, 'cozinha'); k.wait_for_timeout(800)
    card = k.locator('article:has-text("Joana")')
    check(card.count() == 1, 'pedido chegou na cozinha')
    card.locator('button:has-text("Aceitar e iniciar")').click(); k.wait_for_timeout(600)
    card.locator('button:has-text("Pedido pronto")').click(); k.wait_for_timeout(600)
    k.screenshot(path=S + 'e2e_kds_after.png')

    # 4. motoboy despacha, cobra e conclui
    mo = ctx(True); login(mo, 'motoboy2'); mo.wait_for_timeout(800)
    mo.locator('button:has-text("Saí para entrega")').click(); mo.wait_for_timeout(700)
    mo.locator('button:text-is("Entregue")').click(); mo.wait_for_timeout(500)
    mo.screenshot(path=S + 'e2e_courier_pay.png')
    mo.locator('[role=dialog] select').select_option('pix'); mo.locator('button:has-text("Confirmar recebimento")').click(); mo.wait_for_timeout(900)
    mo.screenshot(path=S + 'e2e_courier_done.png')
    check('Concluídas hoje' in mo.content(), 'motoboy concluiu a entrega')
    m.goto(track); m.wait_for_timeout(800)
    m.screenshot(path=S + 'e2e_track_done.png', full_page=True)

    # 5a. cliente pede pelo QR da mesa 7; garçom confirma e envia à cozinha
    q = ctx(True); q.goto(B + f'/{SLUG}/mesa/demo-mesa-7'); q.wait_for_timeout(1000)
    check('Mesa 7' in q.content(), 'QR da mesa abre o cardápio da mesa')
    q.locator('li button:has-text("Espeto de calabresa")').first.click(); q.wait_for_timeout(300)
    q.locator('[role=dialog] button:has-text("Adicionar")').click()
    q.locator('button:has-text("Ver pedido da mesa")').click(); q.wait_for_timeout(300)
    q.fill('input[autocomplete=given-name]', 'Carla')
    q.screenshot(path=S + 'e2e_qr_checkout.png')
    q.locator('button:has-text("Enviar pedido")').click(); q.wait_for_timeout(900)
    check('garçom confirma' in q.content(), 'cliente vê pedido aguardando o garçom')
    q.screenshot(path=S + 'e2e_qr_sent.png')
    q.locator('button:has-text("Voltar ao cardápio")').click(); q.locator('button:has-text("Chamar garçom")').click(); q.wait_for_timeout(700)
    w = ctx(True); login(w, 'garcom1'); w.wait_for_timeout(800)
    check(w.locator('main button:has-text("item(ns) do QR")').count() >= 1, 'garçom vê pedido do QR para confirmar')
    w.screenshot(path=S + 'e2e_qr_waiter.png')
    w.locator('main button:has(span.font-cond:text-is("7"))').first.click(); w.wait_for_timeout(700)
    w.locator('button:has-text("Confirmar e enviar")').click(); w.wait_for_timeout(700)
    w.locator('button:has-text("marcar como atendido")').click(); w.wait_for_timeout(700)
    check('Rodada 1' in w.content(), 'pedido do QR foi para a cozinha')
    w.screenshot(path=S + 'e2e_qr_waiter_table.png')

    # 5. garçom abre mesa e lança itens
    g = ctx(True); login(g, 'garcom2'); g.wait_for_timeout(600)
    g.locator('main button:has(span.font-cond:text-is("9"))').first.click(); g.locator('[role=dialog] button:text-is("3")').click()
    g.locator('button:has-text("Abrir mesa")').click(); g.wait_for_timeout(900)
    g.locator('button:has-text("Lançar itens")').click(); g.wait_for_timeout(400)
    g.locator('[role=dialog] button:has-text("Skol")').last.click(); g.locator('[role=dialog] button:has-text("Espeto de porco")').last.click()
    g.screenshot(path=S + 'e2e_waiter_add.png')
    g.locator('button:has-text("Enviar 2 item")').click(); g.wait_for_timeout(900)
    check('Rodada 1' in g.content(), 'garçom enviou rodada para a cozinha')
    g.screenshot(path=S + 'e2e_waiter_table.png')

    # 6. caixa vende no PDV com troco
    c = ctx(False); login(c, 'caixa'); c.goto(B + '/admin/pdv'); c.wait_for_timeout(1000)
    c.locator('main button:has-text("Heineken")').first.click(); c.locator('main button:has-text("Torresmo")').first.click()
    c.locator('button:has-text("Cobrar agora")').click(); c.wait_for_timeout(600)
    c.locator('[role=dialog] input[placeholder=opcional]').fill('50')
    check('Troco R$' in c.content(), 'PDV calcula troco')
    c.screenshot(path=S + 'e2e_pdv_pay.png')
    c.locator('button:has-text("Confirmar recebimento")').click(); c.wait_for_timeout(900)
    c.screenshot(path=S + 'e2e_pdv_done.png')
    check('pago' in c.content(), 'venda paga no PDV')
    c.goto(B + '/admin/caixa'); c.wait_for_timeout(1000); c.screenshot(path=S + 'e2e_cash.png', full_page=True)
    a.goto(B + '/admin'); a.wait_for_timeout(1200); a.screenshot(path=S + 'e2e_dash.png', full_page=True)
    b.close()

print('Erros:', errs or 'nenhum')
sys.exit(1 if errs else 0)
