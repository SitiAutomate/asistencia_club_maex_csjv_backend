import { DataTypes, Model } from "sequelize";
import { sequelize } from "../sequelize.js";


class Cursos extends Model {}

Cursos.init(
    {
        ID_Curso:{
            type: DataTypes.STRING,
        },
        Nombre_del_curso:{
            type: DataTypes.STRING,
        },
        Estado_del_curso:{
            type: DataTypes.STRING,
        },
        Actividad:{
            type: DataTypes.INTEGER,
        },
        Docente:{
            type: DataTypes.STRING,
        },
        Tipo:{
            type: DataTypes.STRING,
        },
        Lunes:{
            type: DataTypes.STRING,
        },
        Martes:{
            type: DataTypes.STRING,
        },
        Miércoles:{
            type: DataTypes.STRING,
        },
        Jueves:{
            type: DataTypes.STRING,
        },
        Viernes:{
            type: DataTypes.STRING,
        },
        SÁBADO:{
            type: DataTypes.STRING,
        },
        Nombre_Corto_Curso:{
            type: DataTypes.STRING,
        },
    },
    {
        sequelize,
        modelName: 'Cursos',
        tableName: 'cursos_2025',
        timestamps: false
    },

);

Cursos.removeAttribute('id');


export default Cursos;