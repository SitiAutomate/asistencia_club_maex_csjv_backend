import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { env } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const specPath = path.resolve(__dirname, '../../docs/openapi.yaml');

let cachedSpec = null;

export function getOpenApiSpec() {
  if (env.nodeEnv === 'development') {
    const raw = fs.readFileSync(specPath, 'utf8');
    return YAML.parse(raw);
  }
  if (!cachedSpec) {
    const raw = fs.readFileSync(specPath, 'utf8');
    cachedSpec = YAML.parse(raw);
  }
  return cachedSpec;
}

export const swaggerUiOptions = {
  customSiteTitle: 'API — Asistencia Club MAEX',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
  },
};
