import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../sequelize.js';

class Entrenadores extends Model {}

Entrenadores.init(
  {
    ID: {
      type: DataTypes.STRING,
    },
    Nombre_Docente: {
      type: DataTypes.STRING,
    },
    Correo: {
      type: DataTypes.STRING,
    },
    Cedula: {
      type: DataTypes.INTEGER,
      field: 'Cédula',
      allowNull: false,
    },
    /** historial | asistencia_historial */
    acceso_asistencia: {
      type: DataTypes.STRING,
      field: 'acceso_asistencia',
      allowNull: false,
      defaultValue: 'asistencia_historial',
    },
  },
  {
    sequelize,
    modelName: 'Entrenadores',
    tableName: 'entrenadores',
    timestamps: false,
  },
);

Entrenadores.removeAttribute('id');

export default Entrenadores;
