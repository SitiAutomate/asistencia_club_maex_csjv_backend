import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../sequelize.js';
import Cursos from './CursosModel.js';
import Participantes from './ParticipantesModel.js';

class Inscripciones extends Model {}

Inscripciones.init(
  {
    IDInscripcion: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'IDInscripcion',
    },
    Tipo: {
      type: DataTypes.INTEGER,
    },
    validador_participante: {
      type: DataTypes.STRING,
    },
    validador_responsable: {
      type: DataTypes.STRING,
    },
    IDCurso: {
      type: DataTypes.STRING,
    },
    Transporte: {
      type: DataTypes.STRING,
    },
    Sede: {
      type: DataTypes.STRING,
    },
    Estado: {
      type: DataTypes.STRING,
    },
    Mes: {
      type: DataTypes.STRING,
    },
    año: {
      type: DataTypes.INTEGER,
    },
    Fecha_Inscripcion: {
      type: DataTypes.DATEONLY,
      field: 'Fecha_Inscripción',
    },
    OBSERVACION: {
      type: DataTypes.TEXT,
    },
    Observacion_Facturacion: {
      type: DataTypes.TEXT,
    },
    CausalDeRetiro: {
      type: DataTypes.STRING,
      field: 'CAUSAL DE RETIRO',
    },
    FechaIngresoNuevoTransporte: {
      type: DataTypes.DATEONLY,
      field: 'FECHA INGRESO NUEVO TRANSPORTE',
    },
    FechaRetiro: {
      type: DataTypes.DATEONLY,
      field: 'FECHA RETIRO EXTRACLASE',
    },
    FechaRetiroTransporte: {
      type: DataTypes.DATEONLY,
      field: 'FECHA RETIRO TRANSPORTE',
    },
    nombreCurso: {
      type: DataTypes.STRING,
    },
  },
  {
    sequelize,
    modelName: 'Inscripciones',
    tableName: 'inscripciones_1',
    timestamps: false,
  },
);

Inscripciones.belongsTo(Cursos, {
  foreignKey: 'IDCurso',
  targetKey: 'ID_Curso',
  as: 'curso',
});
Inscripciones.belongsTo(Participantes, {
  foreignKey: 'validador_participante',
  targetKey: 'idParticipante',
  as: 'participante',
});

/** Columnas usadas por Sequelize. LVL UP (Sesion, asignatura, grupo_lvlup_id) va por SQL directo. */
export const INSCRIPCIONES_ATTRS_BASE = [
  'Tipo',
  'validador_participante',
  'validador_responsable',
  'IDCurso',
  'Transporte',
  'Sede',
  'Estado',
  'Mes',
  'año',
];

export const INSCRIPCIONES_ATTRS_GESTION = [
  ...INSCRIPCIONES_ATTRS_BASE,
  'IDInscripcion',
  'Fecha_Inscripcion',
  'OBSERVACION',
  'Observacion_Facturacion',
  'CausalDeRetiro',
  'FechaIngresoNuevoTransporte',
  'FechaRetiro',
  'FechaRetiroTransporte',
  'nombreCurso',
];

export default Inscripciones;
