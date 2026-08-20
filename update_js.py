import sys
with open('app.js', 'r', encoding='utf-8') as f:
    js = f.read()

old_logic = '''// Lógica para controle do Modo Escuro
const btnTheme = document.getElementById('btn-theme');
if (btnTheme) {
  // Tenta carregar o tema do localStorage ou pega a preferência do sistema
  let currentTheme = localStorage.getItem('theme');
  if (!currentTheme) {
    currentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  const applyTheme = (theme) => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      btnTheme.innerHTML = '☀️ Modo Claro';
    } else {
      document.documentElement.removeAttribute('data-theme');
      btnTheme.innerHTML = '🌙 Modo Escuro';
    }
    localStorage.setItem('theme', theme);
  };

  // Aplica o tema na inicialização
  applyTheme(currentTheme);

  // Alterna o tema ao clicar
  btnTheme.addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(currentTheme);
  });
}'''

new_logic = '''// Lógica para controle do Modo Escuro com Segmented Control
const btnLight = document.getElementById('btn-theme-light');
const btnDark = document.getElementById('btn-theme-dark');
if (btnLight && btnDark) {
  let currentTheme = localStorage.getItem('theme');
  if (!currentTheme) {
    currentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  const applyTheme = (theme) => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      btnDark.classList.add('active');
      btnLight.classList.remove('active');
    } else {
      document.documentElement.removeAttribute('data-theme');
      btnLight.classList.add('active');
      btnDark.classList.remove('active');
    }
    localStorage.setItem('theme', theme);
  };

  applyTheme(currentTheme);

  btnLight.addEventListener('click', () => applyTheme('light'));
  btnDark.addEventListener('click', () => applyTheme('dark'));
}'''

js = js.replace(old_logic, new_logic)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(js)
