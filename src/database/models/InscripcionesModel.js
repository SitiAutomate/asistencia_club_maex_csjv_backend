import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../sequelize.js';
import Cursos from './CursosModel.js';
import Participantes from './ParticipantesModel.js';

class Inscripciones extends Model {}

Inscripciones.init(
  {
    Tipo: {
      type: DataTypes.INTEGER
    },
    validador_participante: {
      type: DataTypes.STRING,
    },
    validador_responsable: {
      type: DataTypes.STRING,
    },
    IDCurso: {
      type: DataTypes.STRING,
    },
    Transporte: {
      type: DataTypes.STRING,
    },
    Sede: {
      type: DataTypes.STRING,
    },
    Estado: {
      type: DataTypes.STRING,
    },
    Mes: {
      type: DataTypes.STRING,
    },
    año: {
      type: DataTypes.INTEGER,
    },
  },
  {
    sequelize,
    modelName: 'Inscripciones',
    tableName: 'inscripciones_1',
    timestamps: false

  },
);

Inscripciones.removeAttribute('id');
Inscripciones.belongsTo(Cursos, { 
  foreignKey: 'IDCurso',
  targetKey: 'ID_Curso',
  as: 'curso'
});
Inscripciones.belongsTo(Participantes, {
  foreignKey: 'validador_participante',
  targetKey: 'idParticipante',
  as: 'participante',
});


export default Inscripciones;