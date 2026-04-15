import { sequelize } from '../sequelize.js';
import { initExampleModel } from './ExampleModel.js';
import './AsignacionModel.js';
import './CursosModel.js';
import './InscripcionesModel.js';
import './PadresModel.js';
import './ParticipantesModel.js';
import './UsuariosModel.js';

initExampleModel(sequelize);

export { sequelize };
