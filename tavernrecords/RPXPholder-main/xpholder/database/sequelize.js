const { Sequelize, DataTypes } = require('sequelize')
const { toDefaultValue } = require('sequelize/lib/utils')

class SequelizeDatabaseService {
    constructor(databaseName) {
        this.databaseName = new Sequelize({
            dialect: 'sqlite',
            storage: 'databaseName',
            logging: false,
            define: {
                timestamps: false,
                freezeTableName: true
            }
        })

        this.models = {}
        this.initializeModels()
    }

    initializeModels() {

        // Characters
        this.models.Character = this.sequelize.define('characters', {
            character_id: {
                type: DataTypes.STRING,
                primaryKey: true,
                allowNull: false
            },
            character_index: {
                type: DataTypes.INTEGER,
                allowNull: false
            },
            name: {
                type: DataTypes.STRING(100),
                allowNull: false
            },
            sheet_url: {
                type: DataTypes.STRING(200),
                defaultValue: ''
            },
            picture_url: {
                type: DataTypes.STRING(200),
            },
            player_id: {
                type: DataTypes.STRING(100),
                allowNull: false
            },
            xp: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            race: {
                type: DataTypes.STRING(100)
            },
            class: {
                type: DataTypes.STRING(100)
            },
            background: {
                type: DataTypes.STRING(100)
            },
            alignment: {
                type: DataTypes.STRING(50)
            },
            ping_on_award: {
                type: DataTypes.INTEGER,
                defaultValue: 1
            }
        })

        // Config
        this.models.Config = this.sequelize.define('config', {
            name: {
                name: {
                    type: DataTypes.STRING(100),
                    primaryKey: true,
                    allowNull: false
                },
                value: {
                    type: DataTypes.STRING(2000),
                    allowNull: false
                }
            }
        })

        // Channels
        this.models.Channels = this.sequelize.define('channels', {
            channel_id: {
                type: DataTypes.STRING(100),
                primaryKey: true,
                allowNull: false
            },
            xp_per_post: {
                type: DataTypes.INTEGER,
                allowNull: false
            }
        })
    }

    async openDatabase() {
        try {
            await this.sequelize.authenticate()
            console.log(`Connected to SQLite database: ${this.databaseName}`)
            return this
        } catch (e) {
            console.error(`Unable to connect to database: `, e)
            return false
        }
    }

    async closeDatabase() {
        try {
            await this.sequelize.close()
            return this
        } catch (e) {
            console.error('Error closing database: ', e)
        }
    }

    // ORM Methods
    async createCharacter(characterData) {
        try {
            return await this.models.Character.create(characterData)
        } catch (e) {
            console.error('Error creating character: ', e)
        }
    } 
    
    async getCharacter(characterId) {
        
    }
}