import { DataTypes, Model } from "sequelize";
import { sequelize } from "../sequelize.js";

class Asistencia extends Model {}

Asistencia.init(
    {
        fecha: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        hora:{
            type: DataTypes.TIME,
            defaultValue: DataTypes.NOW,
        },
        documento:{
            type: DataTypes.STRING,
        },
        nombre:{
            type: DataTypes.STRING,
        },
        idcurso:{
            type: DataTypes.STRING,
        },
        curso:{
            type: DataTypes.STRING,
        },
        responsable:{
            type: DataTypes.STRING,
        },
        reporte:{
            type: DataTypes.STRING,
        },
        comentarios:{
            type: DataTypes.STRING,
        },
        ruta:{
            type: DataTypes.STRING,
        }
    },
    {
        sequelize,
        modelName: 'Asistencia',
        tableName: 'asistencia',
        timestamps: false
    }
);

Asistencia.removeAttribute('id');

export default Asistencia;