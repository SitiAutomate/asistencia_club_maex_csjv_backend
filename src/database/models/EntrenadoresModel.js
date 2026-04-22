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
