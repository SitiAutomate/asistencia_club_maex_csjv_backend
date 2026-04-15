import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../sequelize.js';
import DetalleEvaluacion from './DetalleEvaluacionModel.js';

class Evaluaciones extends Model {}

Evaluaciones.init(
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        participante: {
            type: DataTypes.STRING,
        },
        identificacion: {
            type: DataTypes.STRING,
        },
        foto: {
            type: DataTypes.STRING,
        },
        informe: {
            type: DataTypes.STRING,
        },
        categoria: {
            type: DataTypes.STRING,
        },
        fecha_creacion: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        nombreCategoria: {
            type: DataTypes.STRING,
        },
        comentario:{
            type: DataTypes.STRING,
        },
        fechaEnvio: {
            type: DataTypes.DATE,
        },
        enviado: {
            type: DataTypes.BOOLEAN,
        },
        fecha_modificacion: {
            type: DataTypes.DATE,
        },
        curso_recomendado: {
            type: DataTypes.STRING,
        }

    },
    {
        sequelize,
        modelName: 'Evaluaciones',
        tableName: 'evaluaciones',
        timestamps: false
    }
);

Evaluaciones.hasMany(DetalleEvaluacion, {
  foreignKey: 'id_evaluacion',
  as: 'detalles',
});

export default Evaluaciones;