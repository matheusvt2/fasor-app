import sys, os
from playwright.sync_api import sync_playwright
BASE = 'file:///home/matheus/Documentos/fasor/_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/prototype/index.html'
OUT = '/tmp/claude-1000/-home-matheus-Documentos-fasor/535d7fba-c950-4418-9459-d28cfb6f4cd8/scratchpad/shots'
# name, route, device, theme, tall
SHOTS = [
 ('login','/login','tablet','light',False),
 ('home','/home','tablet','light',False),
 ('home-phone','/home','phone','light',False),
 ('project','/project/porto-seguro','tablet','light',False),
 ('templates','/templates','tablet','light',False),
 ('template-composer','/templates/porto-seguro','tablet','light',False),
 ('template-composer-tall','/templates/porto-seguro','tablet','light',True),
 ('setup','/relatorio/porto-seguro/setup','tablet','light',False),
 ('setup-tall','/relatorio/porto-seguro/setup','tablet','light',True),
 ('relatorio-overview','/relatorio/porto-seguro','tablet','light',False),
 ('relatorio-overview-tall','/relatorio/porto-seguro','tablet','light',True),
 ('relatorio-overview-landscape','/relatorio/porto-seguro','tablet-landscape','light',False),
 ('ficha-sec','/ficha/SEC-C05','tablet','light',False),
 ('ficha-sec-tall','/ficha/SEC-C05','tablet','light',True),
 ('ficha-sec-dark','/ficha/SEC-C05','tablet','dark',False),
 ('ficha-sec-phone','/ficha/SEC-C05','phone','light',False),
 ('ficha-cb','/ficha/CB-ENT','tablet','light',False),
 ('ficha-cb-tall','/ficha/CB-ENT','tablet','light',True),
 ('ficha-dj','/ficha/DJ-C14','tablet','light',False),
 ('fotos','/relatorio/porto-seguro/fotos','tablet','light',False),
 ('legenda','/relatorio/porto-seguro/legenda','tablet','light',False),
 ('pontos','/relatorio/porto-seguro/pontos','tablet','light',False),
 ('exportar','/relatorio/porto-seguro/exportar','tablet','light',False),
 ('exportar-tall','/relatorio/porto-seguro/exportar','tablet','light',True),
 ('cadastros','/cadastros','tablet','light',False),
 ('sync','/sync','tablet','light',False),
 ('sync-conflito','/sync/conflito','tablet','light',False),
 ('account','/account','tablet','light',False),
 ('account-dark','/account','tablet','dark',False),
 ('home-desktop','/home','desktop','light',False),
 ('ficha-placa','/ficha/SEC-C05','tablet','light',False,'#ficha-dlg-placa'),
 ('ficha-visor','/ficha/SEC-C05','tablet','light',False,'#ficha-dlg-visor'),
 ('ficha-menu','/ficha/SEC-C05','tablet','light',False,'#ficha-dlg-menu'),
 ('relatorio-palette','/relatorio/porto-seguro','tablet','light',False,'#lo-palette'),
 ('relatorio-detect','/relatorio/porto-seguro','tablet','light',False,'#relatorio-dlg-detect-result'),
 ('exportar-result','/relatorio/porto-seguro/exportar','tablet','light',False,'#exportar-result'),
 ('pontos-draft','/relatorio/porto-seguro/pontos','tablet','light',False,'#pontos-draft'),
 ('fotos-viewer','/relatorio/porto-seguro/fotos','tablet','light',False,'#fotos-dlg-viewer'),
 ('project-novo','/project/porto-seguro','tablet','light',False,'#proj-dlg-novo'),
 ('cadastros-inst','/cadastros','tablet','light',False,'#cad-inst-panel'),
]
TALL_CSS = """
#frame.tall{height:auto!important;min-height:0!important}
#frame.tall .screen-body>.screen.is-active{overflow:visible!important;height:auto!important}
#frame.tall .screen > .sticky-action-bar{position:static!important}
.proto-stage{align-items:flex-start!important;overflow:visible!important}
body.proto{height:auto!important;overflow:visible!important}
"""
only = sys.argv[1:] 
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    pg = b.new_page(viewport={'width':1500,'height':1300}, device_scale_factor=2)
    pg.goto(BASE + '#/login'); pg.wait_for_timeout(600)
    pg.add_style_tag(content=TALL_CSS)
    for row in SHOTS:
        name, route, device, theme, tall = row[:5]; open_id = row[5] if len(row)>5 else None
        if only and name not in only: continue
        pg.click(f'[data-device-set="{device}"]')
        pg.click(f'[data-theme-set="{theme}"]')
        pg.evaluate("h => { location.hash = h; }", '#' + route)
        pg.wait_for_timeout(350)
        pg.evaluate("t => { const f=document.getElementById('frame'); f.classList.toggle('tall', t); f.style.transform=''; document.getElementById('proto-device').style.width=''; document.getElementById('proto-device').style.height=''; }", tall)
        if open_id:
            pg.evaluate("id => { const el=document.querySelector(id); if(!el) return 'missing'; el.hidden=false; el.removeAttribute('hidden'); el.style.display=''; return el.className; }", open_id)
            pg.wait_for_timeout(250)
        pg.wait_for_timeout(250)
        fr = pg.locator('#frame')
        box = fr.bounding_box()
        fr.screenshot(path=f'{OUT}/{name}.png')
        print(f'{name:28s} {route:32s} {device:16s} {theme:5s} {int(box["width"])}x{int(box["height"])}')
    b.close()
