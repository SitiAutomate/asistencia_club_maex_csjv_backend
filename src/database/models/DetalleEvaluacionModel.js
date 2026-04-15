import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../sequelize.js';
import Rubricas from './RubricasModel.js';

class DetalleEvaluacion extends Model {}

DetalleEvaluacion.init(
    {
        id_evaluacion: {
            type: DataTypes.INTEGER,
            primaryKey: true,
        },
        id_rubrica: {
            type: DataTypes.INTEGER,
            primaryKey: true,
        },
        valor: {
            type: DataTypes.STRING,
        },
        responsable: {
            type: DataTypes.STRING,
        },
        fecha: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        hora: {
            type: DataTypes.TIME,
            defaultValue: DataTypes.NOW,
        }
    },
    {
        sequelize,
        modelName: 'DetalleEvaluacion',
        tableName: 'detalle_evaluacion',
        timestamps: false
    }
);

DetalleEvaluacion.belongsTo(Rubricas, {
  foreignKey: 'id_rubrica',
  targetKey: 'id',
  as: 'rubrica',
});

export default DetalleEvaluacion;