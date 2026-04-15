import { DataTypes, Model } from "sequelize";
import { sequelize } from "../sequelize.js";
class Padres extends Model {}

Padres.init(
    {
        docAlumno: {
            type: DataTypes.STRING,
            field: 'Doc. Alumno',
        },
        nombrePadre: {
            type: DataTypes.STRING,
            field: 'Nombre del padre',
        },
        emailPadre: {
            type: DataTypes.STRING,
            field: 'E-mail padre',
        },
        celularPadre: {
            type: DataTypes.STRING,
            field: 'Celular padre',
        },
        nombreMadre: {
            type: DataTypes.STRING,
            field: 'Nombre de la madre',
        },
        emailMadre: {
            type: DataTypes.STRING,
            field: 'E-mail madre',
        },
        celularMadre: {
            type: DataTypes.STRING,
            field: 'Celular madre',
        }
    },
    {
        sequelize,
        modelName: 'Padres',
        tableName: 'padres',
        timestamps: false
    }
);

Padres.removeAttribute('id');

export default Padres;
