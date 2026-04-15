import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../sequelize.js';

class Rubricas extends Model {}

Rubricas.init(
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        nombre: {
            type: DataTypes.STRING,
        },
        tipo:{
            type: DataTypes.STRING,
        },
        descripcion:{
            type: DataTypes.STRING,
        },
        fecha_creacion:{
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        responsable:{
            type: DataTypes.STRING,
        },
        estado:{
            type: DataTypes.STRING,
            defaultValue: 'ACTIVO',
        },
        categoria:{
            type: DataTypes.STRING,
        },
        nombreCategoria:{
            type: DataTypes.STRING,
        },
        alto:{
            type: DataTypes.STRING,
        },
        medio:{
            type: DataTypes.STRING,
        },
        bajo:{
            type: DataTypes.STRING,
        },
        actividad:{
            type: DataTypes.STRING,
        },
        fecha_modificacion:{
            type: DataTypes.DATE,
        },
        comun:{
            type: DataTypes.BOOLEAN,
        }
    },
    {
        sequelize,
        modelName: 'Rubricas',
        tableName: 'rubricas',
        timestamps: false
    }
);

export default Rubricas;