import { deployment } from '../../engine/world.js';
import { resolveEnv } from '../../sim/controllers.js';

const NS = 'notes-app';
const BANNER = 'Bem-vindo ao Nimbus Notes!\n';

const pod = (w) => w.pods(NS, { app: 'notes' }).find((p) => w.podPronto(p));

export default {
  id: 'e4-config',
  minutes: 20,
  xp: 200,
  difficulty: 2,
  objectives: ['Externalizar a configuração das aplicações'],
  title: { pt: 'Configuração fora da imagem', en: 'Configuration outside the image' },
  startNamespace: NS,
  story: {
    pt: 'O Nimbus Notes tem o título, o banner e a senha do banco dentro da imagem. Cada ambiente precisa de uma versão diferente da imagem só por causa disso. A ideia é tirar tudo para o cluster.',
    en: 'Nimbus Notes has its title, banner, and database password baked into the image. Each environment needs a different image version just because of that. The idea is to move it all into the cluster.',
  },
  tasks: {
    pt: [
      'No projeto `notes-app`, crie o config map `notes-config` com a chave `NOTES_TITLE=Nimbus Notes` e com o arquivo `~/notes/banner.txt` (chave `banner.txt`).',
      'Crie o secret `notes-db` com a chave `DB_PASSWORD=n0tes-S3cret`.',
      'O deployment `notes` deve receber `NOTES_TITLE` do config map e `DB_PASSWORD` do secret como variáveis de ambiente.',
      'O config map deve ser montado como volume em `/opt/app-root/src/config`, de modo que exista `/opt/app-root/src/config/banner.txt` no pod.',
    ],
    en: [
      'In the `notes-app` project, create the `notes-config` config map with the key `NOTES_TITLE=Nimbus Notes` and with the `~/notes/banner.txt` file (key `banner.txt`).',
      'Create the `notes-db` secret with the key `DB_PASSWORD=n0tes-S3cret`.',
      'The `notes` deployment must get `NOTES_TITLE` from the config map and `DB_PASSWORD` from the secret as environment variables.',
      'The config map must be mounted as a volume at `/opt/app-root/src/config`, so that `/opt/app-root/src/config/banner.txt` exists in the pod.',
    ],
  },
  hints: [
    { pt: '`oc create configmap NOME --from-literal CHAVE=valor --from-file ARQUIVO` e `oc create secret generic NOME --from-literal CHAVE=valor`.', en: '`oc create configmap NAME --from-literal KEY=value --from-file FILE` and `oc create secret generic NAME --from-literal KEY=value`.' },
    { pt: '`oc set env deployment/notes --from configmap/notes-config` cria uma variável por chave; o mesmo vale para `--from secret/notes-db`.', en: '`oc set env deployment/notes --from configmap/notes-config` creates one variable per key; the same works with `--from secret/notes-db`.' },
    { pt: '`oc set volumes deployment/notes --add --type configmap --configmap-name notes-config --mount-path /opt/app-root/src/config`.', en: '`oc set volumes deployment/notes --add --type configmap --configmap-name notes-config --mount-path /opt/app-root/src/config`.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('notes', NS, 'nimbus/notes:1.0', { container: 'notes' }));
    w.fs.put('/home/student/notes/banner.txt', BANNER);
  },
  checks: [
    {
      text: { pt: 'notes-config e notes-db têm as chaves pedidas', en: 'notes-config and notes-db have the requested keys' },
      test: (w) => {
        const cm = w.get('ConfigMap', 'notes-config', NS)?.data || {};
        const s = w.get('Secret', 'notes-db', NS)?.data || {};
        return cm.NOTES_TITLE === 'Nimbus Notes' && cm['banner.txt'] === BANNER && s.DB_PASSWORD && atob(s.DB_PASSWORD) === 'n0tes-S3cret';
      },
    },
    {
      text: { pt: 'O pod recebe NOTES_TITLE do config map e DB_PASSWORD do secret', en: 'The pod gets NOTES_TITLE from the config map and DB_PASSWORD from the secret' },
      test: (w) => {
        const p = pod(w);
        if (!p) return false;
        const ct = p.spec.containers[0];
        const refs = JSON.stringify([ct.env || [], ct.envFrom || []]);
        const env = resolveEnv(w.cluster, p, ct).env;
        return env.NOTES_TITLE === 'Nimbus Notes' && env.DB_PASSWORD === 'n0tes-S3cret' && refs.includes('notes-config') && refs.includes('notes-db');
      },
    },
    {
      text: { pt: 'O config map está montado em /opt/app-root/src/config', en: 'The config map is mounted at /opt/app-root/src/config' },
      test: (w) => {
        const p = pod(w);
        const m = p?.spec.containers[0].volumeMounts?.find((x) => x.mountPath.replace(/\/$/, '') === '/opt/app-root/src/config');
        const v = p?.spec.volumes?.find((x) => x.name === m?.name);
        return v?.configMap?.name === 'notes-config' && w.ready('notes', NS);
      },
    },
  ],
  solution: [
    { cmd: 'oc project notes-app', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: "oc create configmap notes-config --from-literal NOTES_TITLE='Nimbus Notes' --from-file ~/notes/banner.txt", pt: 'Config map com a chave e o arquivo.', en: 'Config map with the key and the file.' },
    { cmd: 'oc create secret generic notes-db --from-literal DB_PASSWORD=n0tes-S3cret', pt: 'Secret com a senha.', en: 'Secret with the password.' },
    { cmd: 'oc set env deployment/notes --from configmap/notes-config', pt: 'Cada chave vira variável (NOTES_TITLE e BANNER_TXT).', en: 'Each key becomes a variable (NOTES_TITLE and BANNER_TXT).' },
    { cmd: 'oc set env deployment/notes --from secret/notes-db', pt: 'DB_PASSWORD vem do secret.', en: 'DB_PASSWORD comes from the secret.' },
    { cmd: 'oc set volumes deployment/notes --add --name config --type configmap --configmap-name notes-config --mount-path /opt/app-root/src/config', pt: 'Monta o config map.', en: 'Mounts the config map.' },
    { cmd: 'oc rollout status deployment/notes', pt: 'Novo pod com tudo.', en: 'New pod with everything.' },
    { cmd: 'oc exec deploy/notes -- cat /opt/app-root/src/config/banner.txt', pt: 'O banner veio do config map.', en: 'The banner came from the config map.' },
  ],
};
