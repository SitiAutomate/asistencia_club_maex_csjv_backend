import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../sequelize.js';

class InformeEmailJob extends Model {}

InformeEmailJob.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    evaluacion_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    payload: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    next_run_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'InformeEmailJob',
    tableName: 'informe_email_jobs',
    timestamps: false,
  },
);

export default InformeEmailJob;
