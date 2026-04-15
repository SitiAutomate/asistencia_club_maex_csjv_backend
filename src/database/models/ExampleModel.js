import { DataTypes, Model } from 'sequelize';

export class ExampleModel extends Model {}

export const initExampleModel = (sequelize) => {
  ExampleModel.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: 'ExampleModel',
      tableName: 'example_models',
      timestamps: true,
      underscored: true,
    },
  );

  return ExampleModel;
};
