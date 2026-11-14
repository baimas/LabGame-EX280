// Tipos de patch aceitos pelo `oc patch` e pelo Kustomize.
import { ApiError } from './cluster.js';
import { clone } from './util.js';

const objeto = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Strategic merge: listas de itens com `name` são fundidas pelo nome.
export function fusaoEstrategica(alvo, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete alvo[k];
    else if (Array.isArray(v) && Array.isArray(alvo[k]) && v.every((x) => objeto(x) && 'name' in x)) {
      for (const item of v) {
        const existente = alvo[k].find((x) => x.name === item.name);
        if (existente) fusaoEstrategica(existente, item);
        else alvo[k].push(clone(item));
      }
    } else if (objeto(v) && objeto(alvo[k])) fusaoEstrategica(alvo[k], v);
    else alvo[k] = clone(v);
  }
}

// JSON merge patch (RFC 7386): listas são substituídas por inteiro.
export function fusaoSimples(alvo, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete alvo[k];
    else if (objeto(v) && objeto(alvo[k])) fusaoSimples(alvo[k], v);
    else alvo[k] = clone(v);
  }
}

// JSON patch (RFC 6902): add, replace e remove.
export function jsonPatch(alvo, ops) {
  if (!Array.isArray(ops)) throw new ApiError('error: unable to parse "patch": json patch must be an array of operations');
  const recusa = (op, detalhe) => new ApiError(`The request is invalid: the server rejected our request due to an error in our request: jsonpatch ${op.op} operation does not apply: ${detalhe}`);
  for (const op of ops) {
    const partes = String(op.path || '').split('/').slice(1).map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
    const ultimo = partes.pop();
    let no = alvo;
    for (const p of partes) {
      no = no?.[p];
      if (no === undefined || no === null) throw recusa(op, `doc is missing path: "${op.path}"`);
    }
    if (op.op === 'add' || op.op === 'replace') {
      if (op.op === 'replace' && !(ultimo in no)) throw recusa(op, `doc is missing key: ${op.path}`);
      if (Array.isArray(no) && op.op === 'add') no.splice(ultimo === '-' ? no.length : Number(ultimo), 0, clone(op.value));
      else no[ultimo] = clone(op.value);
    } else if (op.op === 'remove') {
      if (!(ultimo in no)) throw recusa(op, `doc is missing path: "${op.path}"`);
      if (Array.isArray(no)) no.splice(Number(ultimo), 1);
      else delete no[ultimo];
    } else throw new ApiError(`error: unsupported json patch operation "${op.op}"`);
  }
}
