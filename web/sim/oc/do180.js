// Subcomandos do oc usados no DO180: run, cp, autoscale, import-image, tag,
// config, completion, set probe/triggers/image-lookup e adm must-gather,
// inspect e node-logs.
import { SERVER } from '../cluster.js';
import { clone, rand, table, hashNum } from '../util.js';
import { findImage, parseRef } from '../images.js';
import { podPronto } from '../controllers.js';
import { VERSAO } from '../seed.js';
import { parseArgs, ok, erro, nsDe, umAlvo, tipoOuErro } from './args.js';
import { paraYaml, ordena } from './output.js';
import { contextoPod } from '../pod.js';
import { pode } from '../rbac.js';
import { gatilhos, ANOTACAO_GATILHOS, imagemDaTag } from '../imagestreams.js';

const emite = (ctx, txt) => {
  if (ctx.env.write) {
    ctx.env.write(txt);
    return '';
  }
  return txt;
};

// Espera (em tempo simulado) até `cond()` ser verdadeira ou acabar o prazo.
async function espera(ctx, cond, limite = 60) {
  for (let i = 0; i < limite; i++) {
    if (cond()) return true;
    await ctx.env.sleep(1);
  }
  return cond();
}

// ------------------------------------------------------------------ run

function separa(args) {
  const i = args.indexOf('--');
  return i < 0 ? { opcoes: args, cmd: [] } : { opcoes: args.slice(0, i), cmd: args.slice(i + 1) };
}

export async function run(ctx) {
  const { opcoes, cmd: depois } = separa(ctx.args);
  const { pos, f } = parseArgs(opcoes, ['rm', 'command', 'attach', 'privileged', 'quiet', 'q', 'expose', 'leave-stdin-open', 'wait']);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  const [nome, ...extra] = pos;
  if (!nome) throw erro("error: NAME is required for run\nSee 'oc run -h' for help and examples");
  if (!f.has('image')) throw erro('error: required flag(s) "image" not set');
  const comando = [...extra, ...depois];
  const stdin = f.has('stdin') || f.has('i') || f.has('it') || f.has('ti');
  const tty = f.has('tty') || f.has('t') || f.has('it') || f.has('ti');
  const anexado = stdin || f.has('attach');
  if (f.has('rm') && !anexado) throw erro('error: --rm should only be used for attached containers');
  const reinicio = f.one('restart') || 'Always';
  if (!['Always', 'OnFailure', 'Never'].includes(reinicio)) throw erro(`error: invalid restart policy: ${reinicio}`);
  const rotulos = { run: nome };
  for (const l of f.all('labels')) {
    rotulos.run = undefined;
    for (const par of String(l).split(',')) rotulos[par.split('=')[0]] = par.split('=')[1] ?? '';
  }
  const ct = { name: nome, image: f.one('image'), resources: {} };
  if (comando.length) ct[f.has('command') ? 'command' : 'args'] = comando;
  const env = f.all('env').map((e) => ({ name: String(e).split('=')[0], value: String(e).split('=').slice(1).join('=') }));
  if (env.length) ct.env = env;
  if (f.has('port')) ct.ports = [{ containerPort: Number(f.one('port')) }];
  if (stdin) ct.stdin = true;
  if (tty) ct.tty = true;
  if (stdin && !f.has('leave-stdin-open')) ct.stdinOnce = true;
  if (f.has('image-pull-policy')) ct.imagePullPolicy = f.one('image-pull-policy');
  const pod = {
    kind: 'Pod',
    metadata: { name: nome, namespace: ns, labels: JSON.parse(JSON.stringify(rotulos)) },
    spec: { containers: [ct], restartPolicy: reinicio, dnsPolicy: 'ClusterFirst' },
  };
  if (f.has('dry-run')) {
    const saida = f.one('output');
    if (saida === 'yaml') return ok(paraYaml(ordena({ apiVersion: 'v1', ...pod, metadata: { creationTimestamp: null, ...pod.metadata }, status: {} })));
    return ok(`pod/${nome} created (${f.one('dry-run') === 'server' ? 'server' : 'client'} dry run)\n`);
  }
  c.create(pod);
  let out = '';
  if (f.has('expose')) {
    if (!f.has('port')) throw erro('error: --port must be set when exposing a service');
    c.create({ kind: 'Service', metadata: { name: nome, namespace: ns }, spec: { selector: JSON.parse(JSON.stringify(rotulos)), ports: [{ port: Number(f.one('port')), targetPort: Number(f.one('port')), protocol: 'TCP' }] } });
    out += `service/${nome} created\n`;
  }
  if (!anexado) return ok(out + `pod/${nome} created\n`);

  // Anexado: espera o contêiner subir.
  const atual = () => c.get('Pod', nome, ns);
  const subiu = await espera(ctx, () => {
    const p = atual();
    return p && (p.status?.containerStatuses?.[0]?.state?.running || ['Succeeded', 'Failed'].includes(p.status?.phase));
  }, 60);
  const apaga = () => {
    if (!f.has('rm') || !c.get('Pod', nome, ns)) return '';
    c.delete('Pod', nome, ns);
    return `pod "${nome}" deleted from ${ns} namespace\n`;
  };
  if (!subiu) {
    const p = atual();
    const motivo = p?.status?.containerStatuses?.[0]?.state?.waiting?.reason;
    apaga();
    return { out, err: `error: timed out waiting for the condition${motivo ? '' : ''}\n`, code: 1 };
  }
  const p = atual();
  const contexto = contextoPod(ctx.env, p, p.spec.containers[0], 'sh');
  // Sem comando: um shell interativo dentro do pod.
  if (!comando.length && tty) {
    if (!f.has('quiet') && !f.has('q')) out += emite(ctx, "If you don't see a command prompt, try pressing enter.\n");
    contexto.aoSair = apaga;
    ctx.sh.entraPod(contexto);
    return ok(out);
  }
  if (!comando.length) {
    const r = { out: p.status?.containerStatuses?.[0]?.state?.terminated ? '' : '' };
    return ok(out + r.out + apaga());
  }
  const r = await ctx.sh.noPod(contexto, () => ctx.sh.exec(comando, ctx.stdin));
  // O processo terminou: o pod também.
  const fim = c.get('Pod', nome, ns);
  if (fim && reinicio !== 'Always') {
    fim.spec.containers[0].command = ['sh', '-c', `exit ${r.code || 0}`];
    delete fim.spec.containers[0].args;
    delete fim.spec.containers[0].stdin;
  }
  const rodape = apaga();
  return { out: out + (r.out || '') + rodape, err: (r.err || '') + (r.code && reinicio !== 'Always' ? `pod ${ns}/${nome} terminated (Error)\n` : ''), code: r.code || 0 };
}

// ------------------------------------------------------------------- cp

export async function cp(ctx) {
  const { pos, f } = parseArgs(ctx.args, ['no-preserve']);
  const c = ctx.env.cluster;
  const [origem, destino] = pos;
  if (!origem || !destino) throw erro("error: source and destination are required\nSee 'oc cp -h' for help and examples");
  const remoto = (x) => /^[^/.~][^:]*:/.test(x);
  if (remoto(origem) === remoto(destino)) throw erro(remoto(origem) ? 'error: one of src or dest must be a local file specification' : 'error: one of src or dest must be a remote file specification');
  const lado = remoto(origem) ? origem : destino;
  const [alvo, caminhoPod] = [lado.slice(0, lado.indexOf(':')), lado.slice(lado.indexOf(':') + 1)];
  const [nsAlvo, nomePod] = alvo.includes('/') ? alvo.split('/') : [nsDe(ctx, f), alvo];
  const pod = c.get('Pod', nomePod, nsAlvo);
  if (!pod) throw erro(`Error from server (NotFound): pods "${nomePod}" not found`);
  const ct = pod.spec.containers.find((x) => x.name === (f.one('container') || pod.spec.containers[0].name));
  if (!ct) throw erro(`error: container ${f.one('container')} not found in pod ${nomePod}`);
  if (!pod.status?.containerStatuses?.find((x) => x.name === ct.name)?.state?.running) throw erro(`error: unable to upgrade connection: container not found ("${ct.name}")`);
  const contexto = contextoPod(ctx.env, pod, ct, 'sh');
  const pfs = contexto.env.fs;
  const lfs = ctx.env.fs;
  const caminhoAbs = pfs.resolve(contexto.cwd, caminhoPod || '.');
  if (remoto(origem)) {
    const local = lfs.resolve(ctx.sh.cwd, destino);
    if (pfs.isFile(caminhoAbs)) {
      const alvoLocal = lfs.isDir(local) ? `${local}/${caminhoAbs.split('/').pop()}` : local;
      if (!lfs.isDir(lfs.pai(alvoLocal))) throw erro(`error: open ${destino}: no such file or directory`);
      lfs.write(alvoLocal, pfs.read(caminhoAbs));
      return { out: '', err: caminhoPod.startsWith('/') ? 'tar: Removing leading `/\' from member names\n' : '', code: 0 };
    }
    if (pfs.isDir(caminhoAbs)) {
      lfs.mkdir(local, true);
      for (const d of [...pfs.dirs].filter((x) => x.startsWith(caminhoAbs + '/'))) lfs.mkdir(local + d.slice(caminhoAbs.length), true);
      for (const arq of pfs.walk(caminhoAbs)) lfs.put(local + arq.slice(caminhoAbs.length), pfs.read(arq));
      return { out: '', err: caminhoPod.startsWith('/') ? 'tar: Removing leading `/\' from member names\n' : '', code: 0 };
    }
    return { err: `tar: ${caminhoPod.replace(/^\//, '')}: Cannot stat: No such file or directory\ntar: Exiting with failure status due to previous errors\nerror: ${caminhoPod} no such file or directory\n`, code: 1 };
  }
  const local = lfs.resolve(ctx.sh.cwd, origem);
  if (!lfs.exists(local)) throw erro(`error: ${origem} doesn't exist in local filesystem`);
  try {
    if (lfs.isFile(local)) {
      const final = pfs.isDir(caminhoAbs) ? `${caminhoAbs}/${local.split('/').pop()}` : caminhoAbs;
      pfs.write(final, lfs.read(local));
    } else {
      pfs.mkdir(caminhoAbs, true);
      for (const arq of lfs.walk(local)) {
        pfs.mkdir(pfs.pai(caminhoAbs + arq.slice(local.length)), true);
        pfs.write(caminhoAbs + arq.slice(local.length), lfs.read(arq));
      }
    }
  } catch (e) {
    return { err: `tar: ${caminhoPod.replace(/^\//, '')}: Cannot open: ${e.message}\ntar: Exiting with failure status due to previous errors\ncommand terminated with exit code 2\n`, code: 1 };
  }
  return ok();
}

// ------------------------------------------------------------- autoscale

export function autoscale(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  const { k, nome } = umAlvo(pos, 'autoscale');
  if (!['Deployment', 'StatefulSet', 'ReplicaSet'].includes(k.kind)) throw erro(`error: cannot autoscale a ${k.kind}: cannot autoscale a ${k.kind}`);
  const alvo = c.must(k.kind, nome, ns);
  if (!f.has('max')) throw erro('error: required flag(s) "max" not set');
  const max = Number(f.one('max'));
  const min = f.has('min') ? Number(f.one('min')) : undefined;
  if (!(max >= 1)) throw erro('error: --max=MAXPODS is required and must be at least 1, max: ' + f.one('max'));
  if (min !== undefined && min > max) throw erro(`error: --max=MAXPODS must be larger or equal to --min=MINPODS, max: ${max}, min: ${min}`);
  const metricas = [];
  for (const [recurso, valor] of [['cpu', f.one('cpu')], ['memory', f.one('memory')]]) {
    if (valor === undefined) continue;
    const v = String(valor);
    if (v.endsWith('%')) metricas.push({ type: 'Resource', resource: { name: recurso, target: { type: 'Utilization', averageUtilization: Number(v.slice(0, -1)) } } });
    else metricas.push({ type: 'Resource', resource: { name: recurso, target: { type: 'AverageValue', averageValue: v } } });
  }
  const nomeHpa = f.one('name') || nome;
  if (c.get('HorizontalPodAutoscaler', nomeHpa, ns)) throw erro(`Error from server (AlreadyExists): horizontalpodautoscalers.autoscaling "${nomeHpa}" already exists`);
  const hpa = {
    kind: 'HorizontalPodAutoscaler',
    metadata: { name: nomeHpa, namespace: ns },
    spec: { scaleTargetRef: { apiVersion: k.apiVersion, kind: k.kind, name: alvo.metadata.name }, ...(min !== undefined ? { minReplicas: min } : {}), maxReplicas: max, ...(metricas.length ? { metrics: metricas } : {}) },
  };
  if (f.has('dry-run')) return ok(f.one('output') === 'yaml' ? paraYaml(ordena({ apiVersion: 'autoscaling/v2', ...hpa, metadata: { creationTimestamp: null, ...hpa.metadata }, status: { currentMetrics: null, desiredReplicas: 0 } })) : `horizontalpodautoscaler.autoscaling/${nomeHpa} autoscaled (dry run)\n`);
  c.create(hpa);
  return ok(`horizontalpodautoscaler.autoscaling/${nomeHpa} autoscaled\n`);
}

// ---------------------------------------------------------- image streams

const refIs = (texto, nsPadrao) => {
  const [isNs, resto] = texto.includes('/') && !texto.includes('.') ? texto.split('/') : [nsPadrao, texto];
  const [nome, tag = 'latest'] = resto.split(':');
  return { ns: isNs, nome, tag };
};

function garanteIs(c, ns, nome) {
  return c.get('ImageStream', nome, ns) || c.create({ kind: 'ImageStream', metadata: { name: nome, namespace: ns }, spec: { lookupPolicy: { local: false } } });
}

function poeTag(c, ns, nome, tag, from, extra = {}) {
  const is = clone(garanteIs(c, ns, nome));
  is.spec.tags = (is.spec.tags || []).filter((t) => t.name !== tag);
  is.spec.tags.push({ name: tag, annotations: null, from, generation: (is.metadata.generation || 1) + 1, importPolicy: { importMode: extra.importMode || 'Legacy', ...(extra.scheduled ? { scheduled: true } : {}) }, referencePolicy: { type: extra.referencePolicy || 'Source' } });
  c.update(is);
}

export function importImage(ctx) {
  const { pos, f } = parseArgs(ctx.args, ['confirm', 'all', 'insecure', 'scheduled']);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  if (!pos[0]) throw erro('error: you must specify the name of an image stream');
  const { nome, tag } = refIs(pos[0], ns);
  const existe = c.get('ImageStream', nome, ns);
  let from = f.one('from');
  if (!existe && !f.has('confirm')) throw erro(`error: the tag "${tag}" does not exist on the image stream - choose an existing tag to import or use the 'tag' command to create a new tag`);
  if (!from) {
    const spec = existe?.spec.tags?.find((t) => t.name === tag);
    if (!spec?.from) throw erro(existe ? `error: the tag "${tag}" does not exist on the image stream - choose an existing tag to import or use the 'tag' command to create a new tag` : `error: you must specify --from when the image stream does not exist`);
    from = spec.from.name;
  }
  const achada = findImage(from);
  if (achada.error) throw erro(`error: tag ${tag} failed: ${achada.error === 'repo' ? `repository ${achada.repo} not found` : `manifest unknown: manifest unknown`}\nimagestream.image.openshift.io/${nome} imported with errors`);
  poeTag(c, ns, nome, tag, { kind: 'DockerImage', name: from }, { scheduled: f.has('scheduled'), referencePolicy: f.one('reference-policy') === 'local' ? 'Local' : 'Source', importMode: f.one('import-mode') });
  c.tick(1);
  const atual = imagemDaTag(c, ns, nome, tag);
  const img = achada.image;
  let out = `imagestream.image.openshift.io/${nome} imported\n\nName:\t\t\t${achada.digest}\nNamespace:\t\t<none>\nCreated:\t\tLess than a second ago\nLabels:\t\t\t<none>\nAnnotations:\t\timage.openshift.io/dockerLayersOrder=ascending\n`;
  out += `Image Name:\t\t${nome}:${tag}\nDocker Image:\t\t${atual?.ref || from}\nName:\t\t\t${achada.digest}\nCreated:\t\t3 weeks ago\nImage Size:\t\t${img.size} in 4 layers\nImage Created:\t\t3 weeks ago\nAuthor:\t\t\t<none>\nArch:\t\t\tamd64\n`;
  out += `User:\t\t\t${img.user}\n${img.port ? `Exposes Ports:\t\t${img.port}/tcp\n` : ''}Working Dir:\t\t/opt/app-root/src\n`;
  return ok(out);
}

export function tag(ctx) {
  const { pos, f } = parseArgs(ctx.args, ['delete', 'd', 'alias', 'scheduled', 'insecure', 'reference']);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  if (f.has('delete') || f.has('d')) {
    if (!pos.length) throw erro('error: you must specify at least one image stream tag to remove');
    let out = '';
    for (const p of pos) {
      const { nome, tag: t } = refIs(p, ns);
      const is = c.get('ImageStream', nome, ns);
      if (!is || !(is.spec.tags || []).some((x) => x.name === t)) throw erro(`Error from server (NotFound): imagestreamtags.image.openshift.io "${nome}:${t}" not found`);
      const novo = clone(is);
      novo.spec.tags = novo.spec.tags.filter((x) => x.name !== t);
      novo.status.tags = (novo.status.tags || []).filter((x) => x.tag !== t);
      c.update(novo);
      out += `Deleted tag ${ns}/${nome}:${t}.\n`;
    }
    return ok(out);
  }
  if (pos.length < 2) throw erro("error: you must specify a source and at least one destination or one or more tags to delete\nSee 'oc tag -h' for help and examples");
  const [fonte, ...destinos] = pos;
  const tipo = f.one('source') || (/^[^/]+\.[^/]+\//.test(fonte) || fonte.includes('/') && fonte.split('/')[0].includes('.') ? 'docker' : 'istag');
  let from;
  let descricao;
  if (tipo === 'docker') {
    const achada = findImage(fonte);
    if (achada.error) throw erro(`error: ${achada.error === 'repo' ? `repository ${achada.repo} not found` : `manifest unknown: ${parseRef(fonte).tag}`}`);
    from = { kind: 'DockerImage', name: fonte };
    descricao = fonte;
  } else {
    const r = refIs(fonte, ns);
    const atual = imagemDaTag(c, r.ns, r.nome, r.tag);
    if (!atual) throw erro(`error: "${r.nome}:${r.tag}" is not currently pointing to an image, cannot use it as the source of a tag`);
    if (f.has('alias')) {
      from = { kind: 'ImageStreamTag', name: `${r.nome}:${r.tag}`, ...(r.ns !== ns ? { namespace: r.ns } : {}) };
      descricao = `${r.nome}:${r.tag}`;
    } else {
      from = { kind: 'ImageStreamImage', name: `${r.nome}@${atual.digest}`, ...(r.ns !== ns ? { namespace: r.ns } : {}) };
      descricao = `${r.nome}@${atual.digest}`;
    }
  }
  let out = '';
  for (const d of destinos) {
    const r = refIs(d, ns);
    poeTag(c, r.ns, r.nome, r.tag, from, { scheduled: f.has('scheduled'), referencePolicy: f.one('reference-policy') === 'local' ? 'Local' : 'Source' });
    out += `Tag ${r.nome}:${r.tag} set to ${descricao}.\n`;
  }
  return ok(out);
}

// --------------------------------------------------------- oc set probe

export function setProbe(ctx, args, mudaTemplate) {
  const partes = separa(args);
  const { pos, f } = parseArgs(partes.opcoes, ['liveness', 'readiness', 'startup', 'remove', 'local', 'all']);
  const ns = nsDe(ctx, f);
  const tipos = ['liveness', 'readiness', 'startup'].filter((t) => f.has(t));
  if (!tipos.length) throw erro('error: you must specify one of --readiness, --liveness, --startup or both');
  const acoes = [f.has('get-url'), f.has('open-tcp'), partes.cmd.length > 0].filter(Boolean).length;
  if (!f.has('remove') && acoes === 0 && !['initial-delay-seconds', 'period-seconds', 'timeout-seconds', 'success-threshold', 'failure-threshold'].some((x) => f.has(x))) throw erro('error: you must specify one of --get-url, --open-tcp, or a command, or --remove');
  if (acoes > 1) throw erro('error: you may only set one of --get-url, --open-tcp, or command');
  const { k, nome } = umAlvo(pos, 'set');
  const montaAcao = () => {
    if (f.has('get-url')) {
      const u = String(f.one('get-url')).match(/^(https?):\/\/([^:/]*)(?::([^/]+))?(\/.*)?$/i);
      if (!u) throw erro(`error: --get-url could not be parsed as a valid URL: parse "${f.one('get-url')}": invalid URI for request`);
      const porta = u[3] ? (/^\d+$/.test(u[3]) ? Number(u[3]) : u[3]) : u[1].toLowerCase() === 'https' ? 443 : 80;
      return { httpGet: { path: u[4] || '/', port: porta, scheme: u[1].toUpperCase(), ...(u[2] ? { host: u[2] } : {}) } };
    }
    if (f.has('open-tcp')) {
      const p = String(f.one('open-tcp'));
      return { tcpSocket: { port: /^\d+$/.test(p) ? Number(p) : p } };
    }
    if (partes.cmd.length) return { exec: { command: partes.cmd } };
    return null;
  };
  const campos = { 'initial-delay-seconds': 'initialDelaySeconds', 'period-seconds': 'periodSeconds', 'timeout-seconds': 'timeoutSeconds', 'success-threshold': 'successThreshold', 'failure-threshold': 'failureThreshold' };
  const mudou = mudaTemplate(ctx, 'probe', k, nome, ns, (spec) => {
    const alvo = f.one('containers') || f.one('c') || '*';
    const cts = spec.containers.filter((x) => alvo === '*' || x.name === alvo);
    if (!cts.length) throw erro(`error: unable to find container named "${alvo}"`);
    for (const ct of cts) {
      for (const t of tipos) {
        const chave = `${t}Probe`;
        if (f.has('remove')) {
          delete ct[chave];
          continue;
        }
        const acao = montaAcao();
        const pr = acao ? { ...acao } : { ...(ct[chave] || {}) };
        if (acao) for (const x of Object.values(campos)) if (ct[chave]?.[x] !== undefined) pr[x] = ct[chave][x];
        if (!pr.httpGet && !pr.tcpSocket && !pr.exec) throw erro(`error: ${t} probe on container ${ct.name} has no handler; specify one of --get-url, --open-tcp, or a command`);
        for (const [flag, campo] of Object.entries(campos)) if (f.has(flag)) pr[campo] = Number(f.one(flag));
        ct[chave] = { failureThreshold: 3, periodSeconds: 10, successThreshold: 1, timeoutSeconds: 1, ...pr };
      }
    }
  });
  return ok(mudou ? `${k.out}/${nome} probes updated\n` : `${k.out}/${nome} probes updated\n`);
}

// ------------------------------------------------------- oc set triggers

export function setTriggers(ctx, args, mudaTemplate) {
  const { pos, f } = parseArgs(args, ['auto', 'manual', 'remove', 'remove-all', 'from-config', 'all', 'local']);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  const { k, nome } = umAlvo(pos, 'set');
  if (!['Deployment', 'StatefulSet', 'DaemonSet', 'CronJob', 'Job'].includes(k.kind)) throw erro(`error: ${k.plural}/${nome} does not support triggers`);
  const obj = c.must(k.kind, nome, ns);
  const lista = gatilhos(obj);
  const muda = f.has('from-image') || f.has('remove-all') || f.has('remove') || f.has('auto') || f.has('manual');
  if (!muda) {
    const linhas = [['NAME', 'TYPE', 'VALUE', 'AUTO'], [`${k.plural}/${nome}`, 'config', '', 'true']];
    for (const g of lista) linhas.push([`${k.plural}/${nome}`, 'image', `${g.from.name} (${/name=="([^"]+)"/.exec(g.fieldPath)?.[1] || '*'})`, String(!(g.paused === 'true' || g.paused === true))]);
    return ok(table(linhas));
  }
  let novos = clone(lista);
  if (f.has('remove-all')) novos = [];
  if (f.has('from-image')) {
    const origem = String(f.one('from-image'));
    const [nIs, t = 'latest'] = origem.split(':');
    const cts = String(f.one('containers') || f.one('c') || '').split(',').filter(Boolean);
    const alvos = cts.length ? cts : obj.spec.template.spec.containers.map((x) => x.name);
    for (const ctNome of alvos) {
      if (!obj.spec.template.spec.containers.some((x) => x.name === ctNome)) throw erro(`error: unable to find container named "${ctNome}"`);
      novos = novos.filter((g) => !g.fieldPath.includes(`"${ctNome}"`));
      if (f.has('remove')) continue;
      novos.push({ from: { kind: 'ImageStreamTag', name: `${nIs}:${t}` }, fieldPath: `spec.template.spec.containers[?(@.name=="${ctNome}")].image`, ...(f.has('manual') ? { paused: 'true' } : {}) });
    }
  } else if (f.has('manual') || f.has('auto')) {
    for (const g of novos) {
      if (f.has('manual')) g.paused = 'true';
      else delete g.paused;
    }
  }
  const o = clone(obj);
  o.metadata.annotations ??= {};
  if (novos.length) o.metadata.annotations[ANOTACAO_GATILHOS] = JSON.stringify(novos);
  else delete o.metadata.annotations[ANOTACAO_GATILHOS];
  c.update(o);
  return ok(`${k.out}/${nome} triggers updated\n`);
}

// --------------------------------------------------- oc set image-lookup

export function setImageLookup(ctx, args) {
  const { pos, f } = parseArgs(args, ['list', 'all', 'local']);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  if (f.has('list') || !pos.length) {
    const lista = c.list('ImageStream', ns).filter((is) => !pos.length || pos.includes(is.metadata.name) || pos.includes(`imagestream/${is.metadata.name}`) || pos.includes(`is/${is.metadata.name}`));
    return ok(table([['NAME', 'LOCAL'], ...lista.map((is) => [is.metadata.name, String(Boolean(is.spec?.lookupPolicy?.local))])]));
  }
  const ligado = !f.has('enabled') || String(f.one('enabled')) !== 'false';
  let out = '';
  for (const p of pos) {
    const [tipo, n] = p.includes('/') ? p.split('/') : ['imagestream', p];
    const k = tipoOuErro(tipo);
    if (k.kind === 'ImageStream') {
      const is = clone(c.must('ImageStream', n, ns));
      is.spec.lookupPolicy = { local: ligado };
      c.update(is);
      out += `imagestream.image.openshift.io/${n} image lookup updated\n`;
    } else {
      const o = clone(c.must(k.kind, n, ns));
      const tpl = (o.spec.template.metadata ??= {});
      tpl.annotations ??= {};
      if (ligado) tpl.annotations['alpha.image.policy.openshift.io/resolve-names'] = '*';
      else delete tpl.annotations['alpha.image.policy.openshift.io/resolve-names'];
      c.update(o);
      out += `${k.out}/${n} image lookup updated\n`;
    }
  }
  return ok(out);
}

// ------------------------------------------------------------- oc config

const nomeServidor = SERVER.replace(/^https:\/\//, '').replace(/\./g, '-');
const contextoDe = (ns, usuario) => `${ns}/${nomeServidor}/${usuario}`;

export function registraContexto(env) {
  const s = env.session;
  if (!s?.user) return;
  s.contextos ??= [];
  const nome = contextoDe(s.namespace || 'default', s.user);
  if (!s.contextos.some((x) => x.nome === nome)) s.contextos.push({ nome, ns: s.namespace || 'default', usuario: s.user });
}

export function config(ctx) {
  const [sub, ...resto] = ctx.args;
  const s = ctx.env.session;
  registraContexto(ctx.env);
  const lista = s.contextos || [];
  const atual = s.user ? contextoDe(s.namespace || 'default', s.user) : '';
  const { pos, f } = parseArgs(resto, ['minify', 'raw', 'flatten', 'no-headers']);
  if (sub === 'current-context') {
    if (!atual) throw erro('error: current-context is not set');
    return ok(atual + '\n');
  }
  if (sub === 'get-contexts') {
    const mostra = pos.length ? lista.filter((x) => pos.includes(x.nome)) : lista;
    if (pos.length && !mostra.length) throw erro(`error: context ${pos[0]} not found`);
    if (f.one('output') === 'name') return ok(mostra.map((x) => x.nome).join('\n') + '\n');
    const linhas = mostra.map((x) => [x.nome === atual ? '*' : '', x.nome, nomeServidor, `${x.usuario}/${nomeServidor}`, x.ns]);
    return ok(table(f.has('no-headers') ? linhas : [['CURRENT', 'NAME', 'CLUSTER', 'AUTHINFO', 'NAMESPACE'], ...linhas]));
  }
  if (sub === 'use-context') {
    const alvo = lista.find((x) => x.nome === pos[0]);
    if (!alvo) throw erro(`error: no context exists with the name: "${pos[0] ?? ''}"`);
    s.user = alvo.usuario;
    s.namespace = alvo.ns;
    return ok(`Switched to context "${alvo.nome}".\n`);
  }
  if (sub === 'get-clusters') return ok(`NAME\n${nomeServidor}\n`);
  if (sub === 'get-users') return ok(`NAME\n${[...new Set(lista.map((x) => x.usuario))].map((u) => `${u}/${nomeServidor}`).join('\n')}\n`);
  if (sub === 'view') {
    const usar = f.has('minify') ? lista.filter((x) => x.nome === atual) : lista;
    const usuarios = [...new Set(usar.map((x) => x.usuario))];
    const texto = `apiVersion: v1\nclusters:\n- cluster:\n    server: ${SERVER}\n  name: ${nomeServidor}\ncontexts:\n${usar.map((x) => `- context:\n    cluster: ${nomeServidor}\n    namespace: ${x.ns}\n    user: ${x.usuario}/${nomeServidor}\n  name: ${x.nome}`).join('\n')}\ncurrent-context: ${atual}\nkind: Config\npreferences: {}\nusers:\n${usuarios.map((u) => `- name: ${u}/${nomeServidor}\n  user:\n    token: ${f.has('raw') ? `sha256~${rand(43)}` : 'REDACTED'}`).join('\n')}\n`;
    return ok(texto);
  }
  if (sub === 'set-context') {
    if (!f.has('current') && !pos[0]) throw erro('error: you must specify a non-empty context name or --current');
    if (f.has('namespace')) s.namespace = f.one('namespace');
    registraContexto(ctx.env);
    return ok(`Context "${f.has('current') ? contextoDe(s.namespace, s.user) : pos[0]}" modified.\n`);
  }
  return null;
}
export function completion(ctx) {
  const shell = ctx.args[0];
  if (!shell) throw erro('error: Shell not specified.\nSee \'oc completion -h\' for help and examples');
  if (!['bash', 'zsh', 'fish', 'powershell'].includes(shell)) throw erro(`error: Unsupported shell type "${shell}".`);
  return ok(`# bash completion for oc                                   -*- shell-script -*-\n\n__oc_debug()\n{\n    if [[ -n \${BASH_COMP_DEBUG_FILE-} ]]; then\n        echo "$*" >> "\${BASH_COMP_DEBUG_FILE}"\n    fi\n}\n\n# (script completo de autocomplete do oc 4.22, abreviado no simulador)\n\n__start_oc()\n{\n    local cur prev words cword split\n    __oc_init_completion -n "=" || return\n}\n\nif [[ $(type -t compopt) = "builtin" ]]; then\n    complete -o default -F __start_oc oc\nelse\n    complete -o default -o nospace -F __start_oc oc\nfi\n\n# ex: ts=4 sw=4 et filetype=sh\n`);
}

// --------------------------------------------------- adm must-gather etc.

const IMAGEM_MG = 'quay.io/openshift-release-dev/ocp-v4.0-art-dev@sha256:4f6b1c2a9d8e7f3a5b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a';
const dirImagem = IMAGEM_MG.replace(/[/:@.]/g, '-');

function exigeAdmin(ctx, verbo, recurso, grupo = '') {
  const c = ctx.env.clusterReal || ctx.env.cluster;
  if (!pode(c, ctx.env.usuario, verbo, recurso, grupo, '')) throw erro(`Error from server (Forbidden): ${recurso} is forbidden: User "${ctx.env.usuario}" cannot ${verbo} resource "${recurso}" in API group "${grupo}" at the cluster scope`);
}

const yamlDe = (o) => paraYaml(ordena(clone(o)));
const listaYaml = (itens) => paraYaml({ apiVersion: 'v1', items: itens.map((o) => ordena(clone(o))), kind: 'List', metadata: { resourceVersion: '' } });

// Grava o retrato de um namespace: pods (com logs), deployments, services, eventos.
function retratoNs(c, fs, base, ns) {
  const raiz = `${base}/namespaces/${ns}`;
  const n = c.get('Namespace', ns);
  if (n) fs.put(`${raiz}/${ns}.yaml`, yamlDe(n));
  const pods = c.list('Pod', ns);
  fs.put(`${raiz}/core/pods.yaml`, listaYaml(pods));
  fs.put(`${raiz}/core/services.yaml`, listaYaml(c.list('Service', ns)));
  fs.put(`${raiz}/core/configmaps.yaml`, listaYaml(c.list('ConfigMap', ns)));
  fs.put(`${raiz}/core/events.yaml`, listaYaml(c.list('Event', ns)));
  fs.put(`${raiz}/core/persistentvolumeclaims.yaml`, listaYaml(c.list('PersistentVolumeClaim', ns)));
  fs.put(`${raiz}/apps/deployments.yaml`, listaYaml(c.list('Deployment', ns)));
  fs.put(`${raiz}/apps/replicasets.yaml`, listaYaml(c.list('ReplicaSet', ns)));
  fs.put(`${raiz}/apps/statefulsets.yaml`, listaYaml(c.list('StatefulSet', ns)));
  fs.put(`${raiz}/route.openshift.io/routes.yaml`, listaYaml(c.list('Route', ns)));
  for (const p of pods) {
    fs.put(`${raiz}/pods/${p.metadata.name}/${p.metadata.name}.yaml`, yamlDe(p));
    for (const ct of p.spec.containers) {
      const linhas = c.side[p.metadata.uid]?.logs?.[ct.name]?.linhas || [];
      fs.put(`${raiz}/pods/${p.metadata.name}/${ct.name}/${ct.name}/logs/current.log`, linhas.map((l) => `${c.iso()} ${l}`).join('\n') + (linhas.length ? '\n' : ''));
    }
  }
}

const NS_DO_OPERADOR = { authentication: ['openshift-authentication'], console: ['openshift-console'], dns: ['openshift-dns'], ingress: ['openshift-ingress'], 'image-registry': ['openshift-image-registry'], 'openshift-apiserver': ['openshift-apiserver'], monitoring: ['openshift-monitoring'], 'operator-lifecycle-manager': ['openshift-marketplace'] };

export async function mustGather(ctx, args) {
  const { f } = parseArgs(args, ['all-images', 'host-network']);
  const c = ctx.env.cluster;
  const fs = ctx.env.fs;
  exigeAdmin(ctx, 'create', 'namespaces');
  const destino = f.one('dest-dir') || `must-gather.local.${String(hashNum(c.iso()) * 7919).slice(0, 19)}`;
  const base = fs.resolve(ctx.sh.cwd, destino);
  const imagem = f.one('image') || IMAGEM_MG;
  const pasta = `${base}/${String(imagem).replace(/[/:@.]/g, '-')}`;
  const nsTmp = `openshift-must-gather-${rand(5)}`;
  const pod = `must-gather-${rand(5)}`;
  const cv = c.get('ClusterVersion', 'version');
  const ruins = c.list('ClusterOperator').filter((co) => (co.status.conditions || []).some((x) => (x.type === 'Degraded' && x.status === 'True') || (x.type === 'Available' && x.status !== 'True')));
  const resumo = `When opening a support case, bugzilla, or issue please include the following summary data along with any other requested information:\nClusterID: ${cv.spec.clusterID}\nClientVersion: 4.22.22\nClusterVersion: Stable at "${VERSAO}"\nClusterOperators:\n${ruins.length ? ruins.map((co) => `\tclusteroperator/${co.metadata.name} is not available or degraded`).join('\n') : '\tAll healthy and stable'}\n\n\n`;
  let out = emite(ctx, `[must-gather      ] OUT ${c.iso()} Using must-gather plug-in image: ${imagem}\n${resumo}`);
  out += emite(ctx, `[must-gather      ] OUT ${c.iso()} namespace/${nsTmp} created\n[must-gather      ] OUT ${c.iso()} clusterrolebinding.rbac.authorization.k8s.io/must-gather-${rand(5)} created\n[must-gather      ] OUT ${c.iso()} pod for plug-in image ${imagem} created\n`);
  await ctx.env.sleep(5);
  for (const ns of ['openshift-cluster-version', 'openshift-config', 'openshift-etcd', 'openshift-ingress', 'openshift-authentication', 'openshift-monitoring']) out += emite(ctx, `[${pod}] POD ${c.iso()} Gathering data for ns/${ns}...\n`);
  await ctx.env.sleep(10);
  out += emite(ctx, `[${pod}] OUT ${c.iso()} waiting for gather to complete\n[${pod}] OUT ${c.iso()} downloading gather output\n`);
  // Conteúdo do pacote.
  fs.mkdir(base, true);
  fs.put(`${pasta}/timestamp`, `${c.iso()}\n`);
  fs.put(`${pasta}/version`, `${imagem}\n`);
  fs.put(`${pasta}/cluster-scoped-resources/config.openshift.io/clusterversions/version.yaml`, yamlDe(cv));
  for (const co of c.list('ClusterOperator')) fs.put(`${pasta}/cluster-scoped-resources/config.openshift.io/clusteroperators/${co.metadata.name}.yaml`, yamlDe(co));
  for (const n of c.list('Node')) fs.put(`${pasta}/cluster-scoped-resources/core/nodes/${n.metadata.name}.yaml`, yamlDe(n));
  fs.put(`${pasta}/cluster-scoped-resources/core/persistentvolumes.yaml`, listaYaml(c.list('PersistentVolume')));
  fs.put(`${pasta}/cluster-scoped-resources/storage.k8s.io/storageclasses.yaml`, listaYaml(c.list('StorageClass')));
  for (const ns of c.list('Namespace').map((x) => x.metadata.name).filter((x) => x.startsWith('openshift-'))) retratoNs(c, fs, pasta, ns);
  fs.put(`${pasta}/event-filter.html`, '<!DOCTYPE html>\n<html><head><title>Events</title></head><body><!-- filtro de eventos do must-gather --></body></html>\n');
  fs.put(`${base}/event-filter.html`, '<!DOCTYPE html>\n<html><head><title>Events</title></head><body></body></html>\n');
  fs.put(`${base}/timestamp`, `${c.iso()}\n`);
  fs.put(`${base}/must-gather.logs`, `[must-gather      ] OUT ${c.iso()} Using must-gather plug-in image: ${imagem}\n`);
  out += emite(ctx, `[${pod}] OUT ${c.iso()} gather output downloaded to ${destino}\n[must-gather      ] OUT ${c.iso()} namespace/${nsTmp} deleted\n\n\nReprinting Cluster State:\n${resumo}`);
  return ok(out);
}

export function inspect(ctx, args) {
  const { pos, f } = parseArgs(args);
  const c = ctx.env.cluster;
  const fs = ctx.env.fs;
  if (!pos.length) throw erro("error: at least one resource must be specified\nSee 'oc adm inspect -h' for help and examples");
  const destino = f.one('dest-dir') || `inspect.local.${String(hashNum(c.iso()) * 104729).slice(0, 19)}`;
  const base = fs.resolve(ctx.sh.cwd, destino);
  let out = '';
  fs.mkdir(base, true);
  for (const p of pos) {
    const [tipo, nome] = p.includes('/') ? p.split('/') : [p, null];
    const k = tipoOuErro(tipo);
    const ns = f.has('all-namespaces') ? null : nsDe(ctx, f);
    const itens = nome ? [c.must(k.kind, nome, k.namespaced ? ns : undefined)] : c.list(k.kind, k.namespaced ? ns : null);
    for (const o of itens) {
      if (k.kind === 'Namespace') {
        out += emite(ctx, `Gathering data for ns/${o.metadata.name}...\n`);
        retratoNs(c, fs, base, o.metadata.name);
        continue;
      }
      if (k.kind === 'ClusterOperator') {
        out += emite(ctx, `Gathering data for ns/openshift-${o.metadata.name === 'ingress' ? 'ingress-operator' : o.metadata.name}...\n`);
        fs.put(`${base}/cluster-scoped-resources/config.openshift.io/clusteroperators/${o.metadata.name}.yaml`, yamlDe(o));
        for (const nsRel of NS_DO_OPERADOR[o.metadata.name] || []) {
          if (!c.get('Namespace', nsRel)) continue;
          out += emite(ctx, `Gathering data for ns/${nsRel}...\n`);
          retratoNs(c, fs, base, nsRel);
        }
        continue;
      }
      const caminho = k.namespaced ? `${base}/namespaces/${o.metadata.namespace}/${k.group || 'core'}/${k.plural}/${o.metadata.name}.yaml` : `${base}/cluster-scoped-resources/${k.group || 'core'}/${k.plural}/${o.metadata.name}.yaml`;
      fs.put(caminho, yamlDe(o));
      if (k.namespaced) {
        out += emite(ctx, `Gathering data for ns/${o.metadata.namespace}...\n`);
        retratoNs(c, fs, base, o.metadata.namespace);
      }
    }
  }
  fs.put(`${base}/timestamp`, `${c.iso()}\n`);
  fs.put(`${base}/event-filter.html`, '<!DOCTYPE html>\n<html><head><title>Events</title></head><body></body></html>\n');
  return ok(out + emite(ctx, `Wrote inspect data to ${destino}.\n`));
}

export function nodeLogs(ctx, args) {
  const { pos, f } = parseArgs(args, ['raw', 'boot', 'unify', 'case-sensitive']);
  const c = ctx.env.cluster;
  exigeAdmin(ctx, 'get', 'nodes/log');
  const nos = pos.length ? pos.map((n) => c.must('Node', n)) : f.has('role') ? c.list('Node') : null;
  if (!nos) throw erro('error: at least one node name or a selector (-l) flag is required');
  const unidade = f.one('unit') || f.one('u');
  const cauda = f.has('tail') ? Number(f.one('tail')) : null;
  let linhas = [];
  const t = (s) => new Date((c.now - s) * 1000).toUTCString().slice(5, 25).replace(/ (\d{4}) /, ' ');
  for (const n of nos) {
    const host = n.metadata.name;
    if (!unidade && !f.has('path')) {
      linhas.push(...['audit/', 'containers/', 'crio/', 'journal/', 'openvswitch/', 'pods/'].map((x) => `${host} ${x}`));
      continue;
    }
    if (unidade === 'kubelet') {
      for (const p of c.list('Pod').slice(-12)) {
        const st = p.status?.containerStatuses?.[0];
        const msg = st?.state?.waiting?.reason === 'CrashLoopBackOff' ? `"Error syncing pod, skipping" err="failed to \\"StartContainer\\" for \\"${st.name}\\" with CrashLoopBackOff: \\"back-off 5m0s restarting failed container=${st.name} pod=${p.metadata.name}_${p.metadata.namespace}(${p.metadata.uid})\\"" pod="${p.metadata.namespace}/${p.metadata.name}"` : `"SyncLoop (PLEG): event for pod" pod="${p.metadata.namespace}/${p.metadata.name}" event={"ID":"${p.metadata.uid}","Type":"ContainerStarted"}`;
        linhas.push(`${host} kubenswrapper[2391]: I1118 ${t(hashNum(p.metadata.uid) % 600).slice(-8)}.${String(hashNum(p.metadata.name) % 999999).padStart(6, '0')}    2391 kubelet.go:2471] ${msg}`);
      }
    } else if (unidade === 'crio') {
      for (const p of c.list('Pod').slice(-8)) linhas.push(`${host} crio[2297]: time="${c.iso()}" level=info msg="Started container" PodSandboxID=${hashNum(p.metadata.uid).toString(16)} containerID=${hashNum(p.metadata.name).toString(16)} description=${p.metadata.namespace}/${p.metadata.name}/${p.spec.containers[0].name} id=${rand(8)}`);
    } else linhas.push(`${host} -- No entries --`);
  }
  if (f.has('grep') || f.has('g')) {
    const g = String(f.one('grep') || f.one('g'));
    linhas = linhas.filter((l) => (f.has('case-sensitive') ? l.includes(g) : l.toLowerCase().includes(g.toLowerCase())));
  }
  if (cauda !== null) linhas = linhas.slice(-cauda);
  return ok(linhas.join('\n') + (linhas.length ? '\n' : ''));
}

// Para `oc rollout status statefulset/x`.
export async function statusSts(ctx, nome, ns) {
  const c = ctx.env.cluster;
  let out = '';
  let ultima = '';
  for (let i = 0; i <= 60; i++) {
    const s = c.must('StatefulSet', nome, ns);
    const st = s.status || {};
    const n = s.spec.replicas;
    if ((st.readyReplicas || 0) >= n && (st.updatedReplicas || 0) >= n) return ok(out + `partitioned roll out complete: ${n} new pods have been updated...\n`);
    const msg = (st.readyReplicas || 0) < n ? `Waiting for ${n - (st.readyReplicas || 0)} pods to be ready...\n` : `Waiting for partitioned roll out to finish: ${st.updatedReplicas || 0} out of ${n} new pods have been updated...\n`;
    if (msg !== ultima) out += emite(ctx, msg);
    ultima = msg;
    await ctx.env.sleep(1);
  }
  return { out, err: 'error: timed out waiting for the condition\n', code: 1 };
}

export { podPronto };
