import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendError, sendSuccess } from '../utils/responseHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '../..');
const BACKEND_DOCS = path.join(BACKEND_ROOT, 'docs');
const FRONTEND_DOCS = path.resolve(BACKEND_ROOT, '../frontend/docs');
const FRONTEND_README = path.resolve(BACKEND_ROOT, '../frontend/README.md');
const BACKEND_README = path.join(BACKEND_ROOT, 'README.md');

/** id → archivo relativo a la carpeta indicada en rootKey */
const CATALOG = [
  {
    id: 'guia-identificadores',
    title: 'Guía de IDs y campos',
    group: 'Referencia API',
    root: 'backend',
    file: 'GUIA_IDENTIFICADORES.md',
  },
  {
    id: 'glosario-schemas',
    title: 'Glosario de schemas',
    group: 'Referencia API',
    root: 'backend',
    file: 'GLOSARIO_SCHEMAS.md',
  },
  {
    id: 'api-indice',
    title: 'Índice de endpoints',
    group: 'Backend',
    root: 'backend',
    file: 'API.md',
  },
  {
    id: 'database',
    title: 'Base de datos',
    group: 'Backend',
    root: 'backend',
    file: 'DATABASE.md',
  },
  {
    id: 'environment',
    title: 'Variables de entorno',
    group: 'Backend',
    root: 'backend',
    file: 'ENVIRONMENT.md',
  },
  {
    id: 'integraciones',
    title: 'Integraciones',
    group: 'Backend',
    file: 'INTEGRACIONES.md',
    root: 'backend',
  },
  {
    id: 'backend-readme',
    title: 'README Backend',
    group: 'Backend',
    root: 'backend',
    file: 'README.md',
    altPath: BACKEND_README,
  },
  {
    id: 'guia-usuario',
    title: 'Guía de usuario',
    group: 'Frontend',
    root: 'frontend',
    file: 'GUIA_USUARIO.md',
  },
  {
    id: 'desarrollo-frontend',
    title: 'Desarrollo frontend',
    group: 'Frontend',
    root: 'frontend',
    file: 'DESARROLLO.md',
  },
  {
    id: 'frontend-readme',
    title: 'README Frontend',
    group: 'Frontend',
    root: 'frontend',
    file: '../README.md',
    altPath: FRONTEND_README,
  },
];

function resolveDocPath(entry) {
  if (entry.altPath) return entry.altPath;
  const base = entry.root === 'frontend' ? FRONTEND_DOCS : BACKEND_DOCS;
  return path.join(base, entry.file);
}

export const listDocsCatalog = (req, res) => {
  const items = CATALOG.map(({ id, title, group }) => ({ id, title, group }));
  const groups = [...new Set(items.map((i) => i.group))];
  return sendSuccess(res, 200, { groups, items }, 'Catálogo de documentación');
};

export const getDocContent = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const entry = CATALOG.find((c) => c.id === id);
    if (!entry) {
      return sendError(res, 404, 'Documento no encontrado');
    }
    const filePath = resolveDocPath(entry);
    const markdown = await fs.readFile(filePath, 'utf8');
    return sendSuccess(
      res,
      200,
      { id, title: entry.title, group: entry.group, markdown },
      'OK',
    );
  } catch (e) {
    if (e.code === 'ENOENT') {
      return sendError(res, 404, 'Archivo de documentación no disponible en este servidor');
    }
    return sendError(res, 500, 'Error al leer documentación', e.message);
  }
};
