# Monta o logo "Vagas sem Caos" a partir do logo oficial da Gestão sem Caos (assets/marca/gsc-logo.svg):
# símbolo e "sem Caos" intactos; "Gestão" trocado por "Vagas" com as letras da mesma fonte do logo (Plus Jakarta Sans, 700),
# na mesma escala, linha de base e espaçamento (kerning medido no navegador).
#
#   python3 scripts/marca-vagas-logo.py            -> grava assets/marca/vsc-logo.svg, vsc-logo-negativo.svg e vsc-logo-preto.svg
#   python3 scripts/marca-vagas-logo.py <pasta>    -> grava os três em outra pasta (para comparar)
# Depois: node scripts/montar-vagas.mjs (copia para vagas/comum/marca/) e node scripts/marca-vagas-email.mjs (PNG do e-mail).
#
# Saída já otimizada (cabe no peso da lista pública): origem em 0,0, comandos relativos com 1 casa decimal (as mesmas
# coordenadas do original, só reescritas: a conta é feita em décimos inteiros, sem arredondar nada), as letras numa <path> só.
# Cores: colorida = texto #122940 (o do logo oficial) e símbolo laranja; negativa = texto #f2f2f2 (como gsc-logo-negativo.svg);
# preta = tudo #141414 (como gsc-logo-preto.svg).
import os, re, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
FONTE = os.path.join(RAIZ, 'assets', 'fonts', 'plus-jakarta-sans-latin-wght-normal.woff2')
LOGO = os.path.join(RAIZ, 'assets', 'marca', 'gsc-logo.svg')
SAIDA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, 'assets', 'marca')
# Larguras acumuladas de cada prefixo (canvas.measureText no Chromium, '700 1000px' Plus Jakarta Sans, kerning ligado):
# "V", "Va", "Vag"… em unidades da fonte (1000 por em).
MEDIDAS = {'Gestão': [808, 1420, 1934, 2347, 2925, 3577], 'Vagas': [697, 1237, 1889, 2469, 2983]}
# Escala, início e linha de base de "Gestão" no logo oficial (medidos sobre gsc-logo.svg).
S, X0, BASE = 0.09189719905534985, 233.9422286224478, 576.4
CORES = {'vsc-logo.svg': ('#122940', '#f2752e', '#fcba75'),
         'vsc-logo-negativo.svg': ('#f2f2f2', '#f2752e', '#fcba75'),
         'vsc-logo-preto.svg': ('#141414', '#141414', '#141414')}

# ---------------------------------------------------------------------------------------------------------------- caminhos
TOKEN = re.compile(r'[MmLlHhVvCcSsQqTtZz]|[-+]?(?:\d+\.?\d*|\.\d+)')
ARGS = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'C': 6, 'S': 4, 'Q': 4, 'T': 2, 'Z': 0}

def decimos(v):
    t = round(float(v) * 10)
    assert abs(float(v) * 10 - t) < 1e-6, 'coordenada com mais de 1 casa: %s' % v
    return t

def absolutos(d, dx=0, dy=0):
    """d de <path> -> [(LETRA, [x, y, ...])] absolutos, em décimos inteiros, já deslocados de (dx, dy) décimos."""
    toks = TOKEN.findall(d)
    saida, i, cmd = [], 0, None
    cx = cy = sx = sy = 0
    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]; i += 1
            if cmd in 'Zz':
                saida.append(('Z', [])); cx, cy = sx, sy
                continue
        C = cmd.upper()
        a = [decimos(x) for x in toks[i:i + ARGS[C]]]; i += ARGS[C]
        rel = cmd.islower() and saida  # "m" no começo do caminho é absoluto
        if C == 'H': p = [a[0] + (cx if rel else dx)]; cx = p[0]
        elif C == 'V': p = [a[0] + (cy if rel else dy)]; cy = p[0]
        else:
            p = [v + ((cx if k % 2 == 0 else cy) if rel else (dx if k % 2 == 0 else dy)) for k, v in enumerate(a)]
            cx, cy = p[-2], p[-1]
        if C == 'M': sx, sy = cx, cy
        saida.append((C, p))
        if cmd == 'M': cmd = 'L'
        elif cmd == 'm': cmd = 'l'
    return saida

def numero(t):
    s = '%d' % (abs(t) // 10) + ('.%d' % (abs(t) % 10) if abs(t) % 10 else '')
    if s.startswith('0.'): s = s[1:]
    return ('-' if t < 0 else '') + s

def relativo(cmds):
    """Comandos absolutos (décimos) -> d relativo e curto. Mesmas coordenadas, sem arredondar."""
    partes, ultima, ult_num = [], None, None
    cx = cy = sx = sy = 0
    def letra(l):
        nonlocal ultima, ult_num
        if l == ultima and l != 'm' and l != 'z': return
        if ultima == 'm' and l == 'l': ultima = 'l'; return
        partes.append(l); ultima = l; ult_num = None
    def nums(vs):
        nonlocal ult_num
        for v in vs:
            s = numero(v)
            if ult_num is not None and not s.startswith('-') and not (s.startswith('.') and '.' in ult_num): partes.append(' ')
            partes.append(s); ult_num = s
    for i, (C, p) in enumerate(cmds):
        if C == 'Z':
            letra('z'); cx, cy = sx, sy
            continue
        if C == 'M':
            if i == 0: partes.append('M'); ultima = 'M'; ult_num = None; nums(p)
            else: letra('m'); nums([p[0] - cx, p[1] - cy])
            cx, cy = sx, sy = p
            continue
        if C == 'H': letra('h'); nums([p[0] - cx]); cx = p[0]; continue
        if C == 'V': letra('v'); nums([p[0] - cy]); cy = p[0]; continue
        r = [v - (cx if k % 2 == 0 else cy) for k, v in enumerate(p)]
        if C == 'L':
            if r[1] == 0: letra('h'); nums([r[0]])
            elif r[0] == 0: letra('v'); nums([r[1]])
            else: letra('l'); nums(r)
        else:
            letra(C.lower()); nums(r)
        cx, cy = p[-2], p[-1]
    return ''.join(partes)

# ---------------------------------------------------------------------------------------------------------------- montagem
f = instantiateVariableFont(TTFont(FONTE), {'wght': 700}, inplace=False)
gs = f.getGlyphSet(); cmap = f.getBestCmap()
pal = 'Vagas'; pref = MEDIDAS[pal]; origens = [0] + pref[:-1]
svg = open(LOGO, encoding='utf-8').read()
vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', svg).group(1).split()]
ox, oy = -decimos(vb[0]), -decimos(vb[1])          # origem do desenho em 0,0
letras = []
for ch, o in zip(pal, origens):
    pen = SVGPathPen(gs, ntos=lambda v: ('%.1f' % v).rstrip('0').rstrip('.'))
    gs[cmap[ord(ch)]].draw(TransformPen(pen, (S, 0, 0, -S, X0 + S * o, BASE)))
    letras += absolutos(pen.getCommands(), ox, oy)
delta = round(X0 + S * pref[-1] - (X0 + S * MEDIDAS['Gestão'][-1]), 1)   # "Vagas" é mais curto que "Gestão": "sem Caos" recua
els = re.findall(r'<(?:path|polygon)\s[^>]*/>', svg)
assert len(els) == 15, len(els)
def d_de(el):
    m = re.search(r'\sd="([^"]+)"', el)
    if m: return m.group(1)
    pts = re.search(r'points="([^"]+)"', el).group(1).split()
    return 'M' + ' '.join(pts[:2]) + 'L' + ' '.join(pts[2:]) + 'Z'
for el in els[6:13]:                                  # "sem Caos"
    letras += absolutos(d_de(el), ox + decimos(delta), oy)
simbolo = [absolutos(d_de(el), ox, oy) for el in els[13:15]]
largura = numero(decimos(vb[2]) + decimos(delta))
os.makedirs(SAIDA, exist_ok=True)
for nome, (texto, s1, s2) in CORES.items():
    novo = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %s %s" role="img" aria-label="Vagas sem Caos"><title>Vagas sem Caos</title>'
            % (largura, numero(decimos(vb[3]))))
    novo += '<path fill="%s" d="%s"/>' % (texto, relativo(letras))
    novo += '<path fill="%s" d="%s"/><path fill="%s" d="%s"/></svg>\n' % (s1, relativo(simbolo[0]), s2, relativo(simbolo[1]))
    open(os.path.join(SAIDA, nome), 'w', encoding='utf-8').write(novo)
    print(nome, len(novo.encode('utf-8')), 'bytes')
print('delta', delta, 'largura', largura, 'proporcao', round(float(largura) / vb[3], 2))
