import sys
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

old_btn = '<button id=\"btn-theme\" style=\"background:transparent; border:none; color:var(--ink-2); cursor:pointer; font-size:16px;\">🌓 Modo Escuro</button>'
new_switch = '''<div class=\"theme-switch\">
      <button class=\"theme-btn\" id=\"btn-theme-light\">☀️ Claro</button>
      <button class=\"theme-btn\" id=\"btn-theme-dark\">🌙 Escuro</button>
    </div>'''

html = html.replace(old_btn, new_switch)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
