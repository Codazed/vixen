const fs = require('fs-extra');

const Database = require('better-sqlite3');
const inquirer = require('inquirer');

fs.ensureDirSync('./cache');
fs.ensureDirSync('./data');

const db = new Database('./data/data.db');

db.prepare('CREATE TABLE IF NOT EXISTS guilds (uid text, name text)').run();
db.prepare('CREATE TABLE IF NOT EXISTS vixen (id text, value text)').run();

start();

async function start() {
    const token = db.prepare('SELECT * FROM vixen WHERE ID=?').get('disc_token');
    if (!token) {
        await setup();
    }
    const Vixen = require('./src/vixen');
    new Vixen(db);
}

async function setup() {
    console.log('Performing first-time setup...');
    const questions = [
        {
            type: 'password',
            name: 'bot.token',
            message: 'What is my Discord bot token?',
            mask: '*'
        },
        {
            type: 'input',
            name: 'bot.prefix',
            message: 'What should my command prefix be?',
            default: '/'
        },
        {
            type: 'input',
            name: 'bot.owner',
            message: 'What is the Discord ID of the bot owner?'
        }
    ];

    const answers = await inquirer.prompt(questions);
    const insert = db.prepare('INSERT INTO vixen (id, value) VALUES (?, ?)');
    insert.run('disc_token', answers.bot.token);
    insert.run('prefix', answers.bot.prefix);
    insert.run('owner', answers.bot.owner);
    console.log('First-time setup completed! Vixen is now ready to be used!');
}