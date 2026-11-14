# Extrai do cliente oficial `oc` a árvore de comandos, apelidos, opções, valores
# do autocomplete e textos de ajuda usados em web/sim/oc/oc-real.js.
# Uso: baixe o cliente de mirror.openshift.com, extraia em PASTA/oc-bin/oc e rode
#   python3 scripts/extrai-oc.py PASTA
# (o script roda em três etapas, concatenadas neste arquivo).
import subprocess, json, os, sys, re
from concurrent.futures import ThreadPoolExecutor
S = sys.argv[1]
OC = f'{S}/oc-bin/oc'
HOME = '/home/student'
ENV = {**os.environ, 'KUBECONFIG': f'{S}/vazio.kubeconfig', 'HOME': HOME, 'COLUMNS': '80'}

def run(args, erro=False):
    r = subprocess.run([OC, *args], capture_output=True, text=True, env=ENV, timeout=60)
    return r.stderr if erro else r.stdout

def comp(args):
    linhas = run(['__complete', *args]).strip().split('\n')
    d = 0
    if linhas and linhas[-1].startswith(':'):
        d = int(linhas[-1][1:] or 0); linhas = linhas[:-1]
    return [l.split('\t')[0] for l in linhas if l], d

def opcoes(texto):
    # "    -n, --namespace='':" ou "    --follow=false:" → (curta, longa, booleana)
    out = []
    for m in re.finditer(r"^\s{2,}(?:-(\w), )?--([\w-]+)=(.*?):\s*$", texto, re.M):
        out.append((m.group(1), m.group(2), m.group(3) in ('false', 'true')))
    return out

raiz = run(['--help'])
glob_txt = run(['options'], erro=True)
globais = opcoes(glob_txt)
nomes_glob = {g[1] for g in globais}

arvore, fila, vistos = {}, [[]], {''}
while fila:
    lote, fila = fila, []
    def visita(path):
        ajuda = run([*path, '--help'])
        subs = []
        if 'Available Commands:' in ajuda or not path:
            subs = [i for i in comp([*path, ''])[0] if not i.startswith('-')]
        locais = [o for o in opcoes(ajuda) if o[1] not in nomes_glob]
        pos, dpos = ([], 4) if subs else comp([*path, ''])
        pos = [p for p in pos if not p.startswith('-')]
        return path, ajuda, subs, locais, pos, dpos
    with ThreadPoolExecutor(12) as ex:
        for path, ajuda, subs, locais, pos, dpos in ex.map(visita, lote):
            k = ' '.join(path)
            arvore[k] = {'ajuda': ajuda, 'subs': subs, 'opcoes': locais, 'pos': pos, 'dpos': dpos}
            for s in subs:
                n = ' '.join(path + [s])
                if n not in vistos:
                    vistos.add(n); fila.append(path + [s])

def valores(k, longa):
    itens, d = comp([*([x for x in k.split(' ') if x]), f'--{longa}', ''])
    return [i for i in itens if not i.startswith('-')], d

tarefas = [(k, o[1]) for k, v in arvore.items() for o in v['opcoes'] if not o[2]] + [('', g[1]) for g in globais if not g[2]]
res = {}
with ThreadPoolExecutor(12) as ex:
    for (k, longa), (itens, d) in zip(tarefas, ex.map(lambda t: valores(*t), tarefas)):
        res[(k, longa)] = (itens, d)

def tipo(k, o):
    itens, d = res.get((k, o[1]), ([], 0))
    if o[2]: return {'b': 1}
    if itens: return {'v': itens}
    if d & 16: return {'d': 1}
    if d & 4: return {}
    return {'f': 1}

saida = {
    'versao': run(['version', '--client']).strip(),
    'raiz': raiz, 'options': glob_txt,
    'globais': [{'c': g[0], 'l': g[1], **tipo('', g)} for g in globais],
    'comandos': {k: {'subs': v['subs'], 'pos': v['pos'], 'dpos': v['dpos'], 'opcoes': [{'c': o[0], 'l': o[1], **tipo(k, o)} for o in v['opcoes']], 'ajuda': v['ajuda']} for k, v in arvore.items()},
}
json.dump(saida, open(f'{S}/oc-arvore.json', 'w'), ensure_ascii=False)
print(len(arvore), 'comandos;', len(json.dumps(saida)), 'bytes', file=sys.stderr)
import json, subprocess, os, sys, re
from concurrent.futures import ThreadPoolExecutor
S = sys.argv[1]; OC = f'{S}/oc-bin/oc'
ENV = {**os.environ, 'KUBECONFIG': f'{S}/vazio.kubeconfig', 'HOME': '/home/student'}
d = json.load(open(f'{S}/oc-arvore.json')); C = d['comandos']
def flags(path):
    r = subprocess.run([OC, '__complete', *path, '-'], capture_output=True, text=True, env=ENV)
    return r.stdout
apelidos = {}
for k, v in C.items():
    m = re.search(r'^Aliases:\n(.+)$', v['ajuda'], re.M)
    if m and k:
        nomes = [x.strip() for x in m.group(1).split(',')]
        for a in nomes[1:]: apelidos[(' '.join(k.split(' ')[:-1] + [a])).strip()] = k
tarefas = []
for k in C:
    if not k: continue
    partes = k.split(' '); n = partes[-1]
    for cand in {n[:-1] if n.endswith('s') else n + 's'}:
        alvo = ' '.join(partes[:-1] + [cand])
        if alvo not in C and alvo not in apelidos: tarefas.append((k, partes[:-1] + [cand]))
def testa(t):
    k, p = t
    return k, ' '.join(p), flags(p) == flags(k.split(' ')) and 'unknown' not in flags(p)
with ThreadPoolExecutor(12) as ex:
    for k, alvo, igual in ex.map(testa, tarefas):
        if igual: apelidos[alvo] = k
d['apelidos'] = apelidos
json.dump(d, open(f'{S}/oc-arvore.json', 'w'), ensure_ascii=False)
print(len(apelidos)); print({a: b for a, b in list(apelidos.items())[:40]})
# Listas exatas que o Tab do oc mostra para `-` e `--` em cada comando, e as
# opções obrigatórias (o cobra só sugere essas enquanto faltarem).
import json, subprocess, os, sys, re
from concurrent.futures import ThreadPoolExecutor
S = sys.argv[1]; OC = f'{S}/oc-bin/oc'
ENV = {**os.environ, 'KUBECONFIG': f'{S}/vazio.kubeconfig', 'HOME': '/home/student'}
d = json.load(open(f'{S}/oc-arvore.json')); C = d['comandos']
def comp(args):
    r = subprocess.run([OC, '__complete', *args], capture_output=True, text=True, env=ENV)
    return [x.split('\t')[0] for x in r.stdout.strip().split('\n') if x and not x.startswith(':')]
def opcoes(texto):
    return [(m.group(1), m.group(2), m.group(3) in ('false', 'true')) for m in re.finditer(r"^\s{2,}(?:-(\w), )?--([\w-]+)=(.*?):\s*$", texto, re.M)]
def visita(k):
    p = k.split(' ') if k else []
    dd = comp([*p, '--']); um = comp([*p, '-'])
    # Opções da ajuda (todas locais); se `--` trouxe só algumas, são as obrigatórias.
    locais = opcoes(re.split(r'\nUsage:', C[k]['ajuda'])[0].split('Options:')[-1]) if 'Options:' in C[k]['ajuda'] else []
    obrig = []
    if dd and len(dd) < len(d['globais']):
        obrig = [x[2:] for x in dd]
        preench = []
        for o in obrig: preench += [f'--{o}', 'x']
        dd = comp([*p, *preench, '--']); um = comp([*p, *preench, '-'])
    return k, dd, um, obrig, locais
with ThreadPoolExecutor(12) as ex:
    for k, dd, um, obrig, locais in ex.map(visita, list(C)):
        v = C[k]; v['tabLongas'] = dd; v['tabTodas'] = um; v['obrig'] = obrig
        tipos = {o['l']: o for o in v['opcoes']}
        v['opcoes'] = [{**tipos.get(l, {}), 'c': c, 'l': l, **({'b': 1} if b else {})} for c, l, b in locais]
json.dump(d, open(f'{S}/oc-arvore.json', 'w'), ensure_ascii=False)
print({k: C[k]['obrig'] for k in C if C[k]['obrig']})
