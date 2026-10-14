# Monta o logo "Vagas sem Caos" a partir do logo oficial da Gestão sem Caos (assets/marca/gsc-logo.svg):
# símbolo e "sem Caos" intactos; "Gestão" trocado por "Vagas" com as letras da mesma fonte do logo (Plus Jakarta Sans, 700),
# na mesma escala, linha de base e espaçamento (kerning medido no navegador).
import json, re, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
fonte, logo, medidas, saida = sys.argv[1:5]
S, X0, BASE = 0.09189719905534985, 233.9422286224478, 576.4
f = instantiateVariableFont(TTFont(fonte), {"wght": 700}, inplace=False)
gs = f.getGlyphSet(); cmap = f.getBestCmap()
m = json.load(open(medidas))
pal = 'Vagas'; pref = m[pal]; origens = [0] + pref[:-1]
d_total = []
for ch, o in zip(pal, origens):
    pen = SVGPathPen(gs, ntos=lambda v: ('%.1f' % v).rstrip('0').rstrip('.'))
    gs[cmap[ord(ch)]].draw(TransformPen(pen, (S, 0, 0, -S, X0 + S * o, BASE)))
    d_total.append(pen.getCommands())
fim_vagas = X0 + S * pref[-1]
fim_gestao = X0 + S * m['Gestão'][-1]
delta = round(fim_vagas - fim_gestao, 1)
svg = open(logo, encoding='utf-8').read()
els = re.findall(r'<(?:path|polygon)\s[^>]*/>', svg)
assert len(els) == 15, len(els)
gestao, sem_caos, simbolo = els[0:6], els[6:13], els[13:15]
cor = re.search(r'fill="([^"]+)"', gestao[0]).group(1)
vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', svg).group(1).split()]
direita = vb[0] + vb[2] + delta
largura = round(direita - vb[0], 1)
novo = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s %s %s %s" role="img" aria-label="Vagas sem Caos"><title>Vagas sem Caos</title>'
        % (vb[0], vb[1], largura, vb[3]))
novo += ''.join('<path fill="%s" d="%s"/>' % (cor, d) for d in d_total)
novo += '<g transform="translate(%s 0)">%s</g>' % (delta, ''.join(sem_caos))
novo += ''.join(simbolo) + '</svg>\n'
open(saida, 'w', encoding='utf-8').write(novo)
print('delta', delta, 'largura', largura, 'proporcao', round(largura / vb[3], 2))
