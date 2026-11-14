import { deployment } from '../../engine/world.js';
import { resolveEnv } from '../../sim/controllers.js';
import { b64 } from '../../sim/util.js';

const NS = 'billing';
const PROPS = 'invoice.currency=BRL\ninvoice.due-days=30\ninvoice.footer=Nimbus Tecnologia\n';

const ct = (w) => w.get('Deployment', 'billing-api', NS).spec.template.spec.containers[0];
const vol = (w) => w.get('Deployment', 'billing-api', NS).spec.template.spec.volumes || [];

// Variáveis efetivas de um pod pronto do deployment.
function ambiente(w) {
  const pod = w.pods(NS, { app: 'billing-api' }).find(w.podPronto);
  return pod ? resolveEnv(w.cluster, pod, pod.spec.containers[0]).env : {};
}

// A variável vem de uma referência (e não de um valor fixo no deployment)?
function referencia(w, tipo, nome) {
  const c = ct(w);
  const chave = tipo === 'ConfigMap' ? 'configMap' : 'secret';
  return (c.envFrom || []).some((f) => f[`${chave}Ref`]?.name === nome) || (c.env || []).some((e) => e.valueFrom?.[`${chave}KeyRef`]?.name === nome);
}

export default {
  id: 'c1-configuracao',
  minutes: 20,
  xp: 180,
  difficulty: 2,
  objectives: ['Criar e usar config maps', 'Criar e usar secrets', 'Atualizar implantações de aplicações'],
  title: { pt: 'Configuração fora da imagem', en: 'Configuration out of the image' },
  story: {
    pt: 'A API de faturamento foi reimplantada sem configuração e está em CrashLoopBackOff. O time quer aproveitar para fazer direito: parâmetros em config map, credenciais em secret, nada fixo no deployment.',
    en: 'The billing API was redeployed without configuration and is in CrashLoopBackOff. The team wants to take the chance to do it right: parameters in a config map, credentials in a secret, nothing hardcoded in the deployment.',
  },
  tasks: {
    pt: [
      'Trabalhe no projeto `billing`, no deployment `billing-api`.',
      'Crie o config map `billing-config` com `DB_HOST=billing-db` e `LOG_LEVEL=info`.',
      'Crie o secret `billing-db` com `user=billing` e `password=n1mbus-Fatura`.',
      'O contêiner deve receber as chaves do config map como variáveis de ambiente, e as do secret como `DB_USER` e `DB_PASSWORD`. Os valores devem vir por referência, não copiados para o deployment.',
      'Crie o config map `billing-files` a partir do arquivo `~/labs/billing/app.properties` e monte-o no contêiner em `/etc/billing`.',
      'O deployment deve ficar pronto.',
    ],
    en: [
      'Work in the `billing` project, on the `billing-api` deployment.',
      'Create the `billing-config` config map with `DB_HOST=billing-db` and `LOG_LEVEL=info`.',
      'Create the `billing-db` secret with `user=billing` and `password=n1mbus-Fatura`.',
      'The container must receive the config map keys as environment variables, and the secret keys as `DB_USER` and `DB_PASSWORD`. The values must come by reference, not copied into the deployment.',
      'Create the `billing-files` config map from the `~/labs/billing/app.properties` file and mount it in the container at `/etc/billing`.',
      'The deployment must become ready.',
    ],
  },
  hints: [
    { pt: '`oc create configmap` e `oc create secret generic` aceitam `--from-literal` e `--from-file`.', en: '`oc create configmap` and `oc create secret generic` accept `--from-literal` and `--from-file`.' },
    { pt: '`oc set env deployment/NOME --from=configmap/X` injeta todas as chaves; com `--prefix=DB_` as chaves `user` e `password` viram `DB_USER` e `DB_PASSWORD`.', en: '`oc set env deployment/NAME --from=configmap/X` injects every key; with `--prefix=DB_` the `user` and `password` keys become `DB_USER` and `DB_PASSWORD`.' },
    { pt: '`oc set volume deployment/NOME --add --type configmap --configmap-name X --mount-path /caminho` monta o config map como arquivos.', en: '`oc set volume deployment/NAME --add --type configmap --configmap-name X --mount-path /path` mounts the config map as files.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('billing-api', NS, 'nimbus/billing-api:1.1'));
    w.fs.put('/home/student/labs/billing/app.properties', PROPS);
  },
  checks: [
    {
      text: { pt: 'O config map billing-config tem DB_HOST e LOG_LEVEL', en: 'The billing-config config map has DB_HOST and LOG_LEVEL' },
      test: (w) => {
        const d = w.get('ConfigMap', 'billing-config', NS).data;
        return d.DB_HOST === 'billing-db' && d.LOG_LEVEL === 'info';
      },
    },
    {
      text: { pt: 'O secret billing-db tem user e password', en: 'The billing-db secret has user and password' },
      test: (w) => {
        const d = w.get('Secret', 'billing-db', NS).data;
        return b64.dec(d.user) === 'billing' && b64.dec(d.password) === 'n1mbus-Fatura';
      },
    },
    {
      text: { pt: 'O contêiner recebe DB_HOST e LOG_LEVEL por referência ao config map', en: 'The container receives DB_HOST and LOG_LEVEL by reference to the config map' },
      test: (w) => referencia(w, 'ConfigMap', 'billing-config') && ambiente(w).DB_HOST === 'billing-db' && ambiente(w).LOG_LEVEL === 'info',
    },
    {
      text: { pt: 'O contêiner recebe DB_USER e DB_PASSWORD por referência ao secret', en: 'The container receives DB_USER and DB_PASSWORD by reference to the secret' },
      test: (w) => referencia(w, 'Secret', 'billing-db') && ambiente(w).DB_USER === 'billing' && ambiente(w).DB_PASSWORD === 'n1mbus-Fatura',
    },
    {
      text: { pt: 'O config map billing-files está montado em /etc/billing', en: 'The billing-files config map is mounted at /etc/billing' },
      test: (w) => {
        const v = vol(w).find((x) => x.configMap?.name === 'billing-files');
        const montado = (ct(w).volumeMounts || []).some((m) => m.name === v?.name && m.mountPath.replace(/\/$/, '') === '/etc/billing');
        return montado && w.get('ConfigMap', 'billing-files', NS).data['app.properties'] === PROPS;
      },
    },
    {
      text: { pt: 'O deployment billing-api está pronto', en: 'The billing-api deployment is ready' },
      test: (w) => w.ready('billing-api', NS),
    },
  ],
  solution: [
    { cmd: 'oc project billing', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc logs deployment/billing-api', pt: 'O log confirma: falta a variável DB_HOST.', en: 'The log confirms it: the DB_HOST variable is missing.' },
    { cmd: 'oc create configmap billing-config --from-literal DB_HOST=billing-db --from-literal LOG_LEVEL=info', pt: 'Parâmetros não sensíveis vão para um config map.', en: 'Non-sensitive parameters go into a config map.' },
    { cmd: 'oc create secret generic billing-db --from-literal user=billing --from-literal password=n1mbus-Fatura', pt: 'Credenciais vão para um secret.', en: 'Credentials go into a secret.' },
    { cmd: 'oc set env deployment/billing-api --from configmap/billing-config', pt: 'Cada chave do config map vira uma variável que referencia o config map.', en: 'Each config map key becomes a variable that references the config map.' },
    { cmd: 'oc set env deployment/billing-api --from secret/billing-db --prefix DB_', pt: 'O prefixo transforma `user` e `password` em `DB_USER` e `DB_PASSWORD`.', en: 'The prefix turns `user` and `password` into `DB_USER` and `DB_PASSWORD`.' },
    { cmd: 'oc create configmap billing-files --from-file ~/labs/billing/app.properties', pt: 'A chave do config map é o nome do arquivo.', en: 'The config map key is the file name.' },
    { cmd: 'oc set volume deployment/billing-api --add --type configmap --configmap-name billing-files --mount-path /etc/billing', pt: 'Monta o config map como arquivos dentro do contêiner.', en: 'Mounts the config map as files inside the container.' },
    { cmd: 'oc rollout status deployment/billing-api', pt: 'Aguarda o novo pod.', en: 'Waits for the new pod.' },
    { cmd: 'oc exec deployment/billing-api -- cat /etc/billing/app.properties', pt: 'Confere o arquivo de dentro do contêiner.', en: 'Checks the file from inside the container.' },
    { cmd: 'oc exec deployment/billing-api -- env | grep DB_', pt: 'Confere as variáveis de dentro do contêiner.', en: 'Checks the variables from inside the container.' },
  ],
};
