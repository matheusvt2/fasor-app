import sys
from playwright.sync_api import sync_playwright
src, out = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    pg = b.new_page()
    pg.goto('file://' + src, wait_until='load')
    pg.wait_for_timeout(800)
    pg.emulate_media(media='print')
    pg.pdf(path=out, width='297mm', height='210mm', print_background=True, margin={'top':'0','right':'0','bottom':'0','left':'0'}, prefer_css_page_size=True)
    b.close()
print('ok', out)
