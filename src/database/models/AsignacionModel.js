import { DataTypes, Model } from "sequelize";
import { sequelize } from "../sequelize.js";

class Asignaciones extends Model {}

Asignaciones.init(
    {
        docente: {
            type: DataTypes.STRING,
        },
        estado: {
            type: DataTypes.STRING,
        },
        actividad:{
            type: DataTypes.INTEGER,
        },
        apoyo:{
            type: DataTypes.STRING,
        },
        lider:{
            type: DataTypes.STRING,
        }
    },
    {
        sequelize,
        modelName: 'Asignaciones',
        tableName: 'asignacion_entrenadores',
        timestamps: false
    }
);

Asignaciones.removeAttribute('id');

export default Asignaciones;