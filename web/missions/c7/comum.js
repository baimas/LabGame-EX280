// Utilidades das missões de operators.
export const csvDe = (w, pkg, ns) => w.list('ClusterServiceVersion', ns).filter((c) => c.metadata.name.startsWith(`${pkg}.v`));
export const subDe = (w, pkg, ns) => w.list('Subscription', ns).find((s) => s.spec?.name === pkg);
export const instalado = (w, csv, ns) => w.get('ClusterServiceVersion', csv, ns)?.status?.phase === 'Succeeded';
