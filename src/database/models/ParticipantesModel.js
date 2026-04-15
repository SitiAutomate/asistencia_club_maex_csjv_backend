import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../sequelize.js';
import Padres from './PadresModel.js';
import Responsable from './ResponsableModel.js';

class Participantes extends Model {}

Participantes.init(
  {
    idParticipante: {
      type: DataTypes.STRING,
      field: 'IDParticipante',
    },
    nombreCompleto: {
      type: DataTypes.STRING,
      field: 'Nombre_Completo',
    },
    responsable: {
      type: DataTypes.STRING,
      field: 'IDResponsable',
    },
    fechaNacimiento: {
      type: DataTypes.DATE,
      field: 'Fecha_Nacimiento',
    },
    grupo: {
      type: DataTypes.STRING,
      field: 'Grupo',
    },
  },
  {
    sequelize,
    modelName: 'Participantes',
    tableName: 'participantes',
    timestamps: false,
  },
);

Participantes.removeAttribute('id');

Participantes.hasOne(Padres, {
  foreignKey: 'docAlumno',
  sourceKey: 'idParticipante',
  as: 'padreInfo',
});

Participantes.hasOne(Responsable, {
  foreignKey: 'IDResponsable',
  sourceKey: 'responsable',
  as: 'responsableInfo',
});

export default Participantes;