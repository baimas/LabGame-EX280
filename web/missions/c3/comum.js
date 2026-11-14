// Preparação compartilhada pelas missões de identidade.
import { b64 } from '../../sim/util.js';
import { hashSenha, autentica } from '../../sim/rbac.js';

export const SENHAS = { ana: 'Ana@2026', bruno: 'Bruno@2026', carla: 'Carla@2026', diego: 'Diego@2026' };

// Cria o provedor HTPasswd `nimbus-users` com os usuários indicados, espera o
// OAuth aplicar a configuração e faz o primeiro login de quem estiver em `logados`.
export function provedorNimbus(w, usuarios, logados = []) {
  const c = w.cluster;
  const texto = usuarios.map((u) => `${u}:${hashSenha(SENHAS[u], 'bcrypt')}\n`).join('');
  c.create({ kind: 'Secret', metadata: { name: 'nimbus-htpasswd', namespace: 'openshift-config' }, type: 'Opaque', data: { htpasswd: b64.enc(texto) } });
  const oauth = JSON.parse(JSON.stringify(c.get('OAuth', 'cluster')));
  oauth.spec.identityProviders.push({ name: 'nimbus-users', mappingMethod: 'claim', type: 'HTPasswd', htpasswd: { fileData: { name: 'nimbus-htpasswd' } } });
  c.update(oauth);
  c.tick(60);
  for (const u of logados) autentica(c, u, SENHAS[u]);
  w.fs.mkdir('/home/student/auth', true);
}
