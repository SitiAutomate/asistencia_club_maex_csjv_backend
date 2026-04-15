import { DataTypes, Model } from "sequelize";
import { sequelize } from "../sequelize.js";

class Responsable extends Model {}

Responsable.init(
    {
        IDResponsable: {
            type: DataTypes.STRING,
        },
        Nombre_Completo: {
            type: DataTypes.STRING,
        },
        Celular_Responsable: {
            type: DataTypes.STRING,
        },
        Correo_Responsable: {
            type: DataTypes.STRING,
        },
    },
    {
        sequelize,
        modelName: 'Responsable',
        tableName: 'responsables',
        timestamps: false
    }
);

Responsable.removeAttribute('id');

export default Responsable;