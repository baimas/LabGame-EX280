// `oc debug node/NOME -- chroot /host COMANDO`: comandos no sistema do nó.
import { findImage, parseRef } from './images.js';
import { fakeDigest } from './util.js';

// Interface do nó entregue a um pod por uma rede host-device (sai do nó).
export function interfacesEmUso(c) {
  const usadas = new Set();
  for (const p of c.list('Pod')) for (const r of p.status?.redesSecundarias || []) if (r.device) usadas.add(r.device);
  return usadas;
}

function ipAddr(c, no, filtro) {
  const ip = no.status.addresses[0].address;
  const ifs = [
    { n: 1, nome: 'lo', txt: '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n    inet 127.0.0.1/8 scope host lo\n       valid_lft forever preferred_lft forever\n' },
    { n: 2, nome: 'ens3', txt: `2: ens3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel master ovs-system state UP group default qlen 1000\n    link/ether 52:54:00:00:fa:0a brd ff:ff:ff:ff:ff:ff\n    altname enp0s3\n` },
    { n: 3, nome: 'ens4', txt: '3: ens4: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 8942 qdisc fq_codel state UP group default qlen 1000\n    link/ether 52:54:00:01:96:0a brd ff:ff:ff:ff:ff:ff\n    altname enp0s4\n' },
    { n: 4, nome: 'br-ex', txt: `4: br-ex: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UNKNOWN group default qlen 1000\n    link/ether 52:54:00:00:fa:0a brd ff:ff:ff:ff:ff:ff\n    inet ${ip}/24 brd 192.168.50.255 scope global noprefixroute br-ex\n       valid_lft forever preferred_lft forever\n` },
  ];
  const emPod = interfacesEmUso(c);
  const visiveis = ifs.filter((i) => !emPod.has(i.nome));
  if (filtro) {
    const i = visiveis.find((x) => x.nome === filtro);
    return i ? { out: i.txt } : { err: `Device "${filtro}" does not exist.\n`, code: 1 };
  }
  return { out: visiveis.map((i) => i.txt).join('') };
}

function imagensDoNo(c) {
  const vistas = new Map();
  for (const p of c.list('Pod')) {
    for (const ct of p.spec.containers || []) {
      const { repo, tag } = parseRef(ct.image);
      const chave = `${repo}:${tag || 'latest'}`;
      if (!vistas.has(chave)) vistas.set(chave, { repo, tag: tag || 'latest', id: fakeDigest(chave).slice(7, 20), tamanho: findImage(ct.image).image?.size || '150MB', usada: false });
      if (!['Succeeded', 'Failed'].includes(p.status?.phase)) vistas.get(chave).usada = true;
    }
  }
  for (const i of c.side.imagensRemovidas || []) vistas.delete(i);
  return vistas;
}

function crictl(c, args) {
  const [sub, ...resto] = args;
  const imgs = imagensDoNo(c);
  if (sub === 'images' || sub === 'img') {
    const linhas = [['IMAGE', 'TAG', 'IMAGE ID', 'SIZE'], ...[...imgs.values()].sort((a, b) => a.repo.localeCompare(b.repo)).map((i) => [i.repo, i.tag, i.id, i.tamanho])];
    const larg = linhas[0].map((_, k) => Math.max(...linhas.map((l) => l[k].length)));
    return { out: linhas.map((l) => l.map((x, k) => (k < l.length - 1 ? x.padEnd(larg[k] + 3) : x)).join('')).join('\n') + '\n' };
  }
  if (sub === 'rmi' && resto.includes('--prune')) {
    const removidas = [...imgs.entries()].filter(([, i]) => !i.usada);
    c.side.imagensRemovidas = [...(c.side.imagensRemovidas || []), ...removidas.map(([k]) => k)];
    return { out: removidas.map(([k]) => `Deleted: ${k}\n`).join('') };
  }
  if (sub === 'ps') {
    const linhas = c.list('Pod').filter((p) => p.status?.phase === 'Running').flatMap((p) => p.spec.containers.map((ct) => `${fakeDigest(p.metadata.uid + ct.name).slice(7, 20)}   ${ct.image.split('/').pop().padEnd(30)} Running   ${ct.name.padEnd(20)} ${p.metadata.name}`));
    return { out: `CONTAINER       IMAGE                          STATE     NAME                 POD\n${linhas.join('\n')}\n` };
  }
  return { err: `crictl: '${sub ?? ''}' is not a simulated crictl command (images, ps, rmi --prune)\n`, code: 1 };
}

// Executa uma linha de comando no nó (já dentro de `chroot /host`).
export function noHost(c, no, linha) {
  const partes = linha.split(/\s*;\s*|\s*&&\s*/).filter(Boolean);
  let out = '';
  let err = '';
  let code = 0;
  for (const p of partes) {
    const [cmd, ...args] = p.trim().split(/\s+/);
    let r;
    if (cmd === 'crictl') r = crictl(c, args);
    else if (cmd === 'ip' && /^a(ddr(ess)?)?$/.test(args[0] || '')) r = ipAddr(c, no, args[1] === 'show' ? args[2] : undefined);
    else if (cmd === 'hostname') r = { out: `${no.metadata.name}\n` };
    else if (cmd === 'cat' && args[0] === '/etc/os-release') r = { out: `NAME="${no.status.nodeInfo.osImage}"\nID="rhcos"\nID_LIKE="rhel fedora"\n` };
    else if (cmd === 'systemctl' && args[0] === 'is-active') r = { out: 'active\n' };
    else r = { err: `sh: ${cmd}: command not found in the simulated node (crictl, ip addr, hostname, cat /etc/os-release, systemctl is-active)\n`, code: 127 };
    out += r.out || '';
    err += r.err || '';
    code = r.code || 0;
  }
  return { out, err, code };
}
