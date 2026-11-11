// Identidade visual (logo, cor) e utilitários de sessão compartilhados pelas páginas.
import * as C from './core.js';

/** Aplica logo e cor principal da configuração na página atual. */
export function aplicarMarca(cfg) {
  const root = document.documentElement.style;
  if (C.corValida(cfg.corPrincipal)) { root.setProperty('--azul', cfg.corPrincipal); root.setProperty('--azul-esc', C.escurecer(cfg.corPrincipal)); }
  document.querySelectorAll('.brasao').forEach((el) => {
    if (C.logoValida(cfg.logo)) {
      el.innerHTML = ''; const img = document.createElement('img'); img.src = cfg.logo; img.alt = cfg.nomeSAC ? `Logo ${cfg.nomeSAC}` : 'Logo';
      el.appendChild(img); el.classList.add('com-logo');
    } else { el.classList.remove('com-logo'); el.textContent = 'SAC'; }
  });
}

/** Lê uma imagem, reduz para no máx. `lado` px e devolve data URL (PNG, ou WebP se ficar grande). */
export async function processarLogo(arquivo, lado = 256) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(arquivo.type)) throw new Error('Use uma imagem PNG, JPG ou WebP.');
  if (arquivo.size > 5 * 1024 * 1024) throw new Error('A imagem é grande demais (máximo 5 MB).');
  const bmp = await createImageBitmap(arquivo);
  const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)); const h = Math.max(1, Math.round(bmp.height * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  let url = cv.toDataURL('image/png');
  if (url.length > 150000) url = cv.toDataURL('image/webp', 0.85);
  if (!C.logoValida(url)) throw new Error('Não foi possível reduzir a imagem o suficiente. Tente uma imagem mais simples.');
  return url;
}

/** Encerra a sessão após `minutos` sem uso (controle de sessão administrativa). */
let armado = false;
export function logoutOcioso(sair, minutos = 30) {
  if (armado) return; armado = true;
  let t; const rearmar = () => { clearTimeout(t); t = setTimeout(sair, minutos * 60000); };
  ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach((e) => window.addEventListener(e, rearmar, { passive: true }));
  rearmar();
}
