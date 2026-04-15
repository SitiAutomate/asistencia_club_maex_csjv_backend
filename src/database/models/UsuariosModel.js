import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../sequelize.js';

class Usuarios extends Model {}

Usuarios.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    usuarioid: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    rol: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    confirmado: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    token: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    nombre: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Usuarios',
    tableName: 'usuarios',
    timestamps: false,
  },
);

export default Usuarios;
