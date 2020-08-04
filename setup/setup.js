const inquirer = require('inquirer');
const MongoDB = require('mongodb');

const client = new MongoDB.MongoClient('mongodb://vixen_db_temp', {useUnifiedTopology: true});

async function connect() {
    await client.connect();
    console.log('DB connected!');
}

async function disconnect() {
    await client.close();
}

async function run() {
    await connect();

    let db = client.db('vixen');
    if ((await db.listCollections({}).toArray()).length > 0) {
        const clearOption = await inquirer.prompt([{
            type: 'list',
            name: 'choice',
            message: 'The Vixen database already contains data. What would you like to do?',
            choices: [
                {
                    name: 'Nothing',
                    value: 0
                },
                {
                    name: 'Clear bot variables only',
                    value: 1
                },
                {
                    name: 'Clear entire database',
                    value: 2
                }
            ],
            default: 0
        }]);

        switch(clearOption.choice) {
            case 1:
                await db.collection('botvars').drop();
                console.log('Bot variables cleared.');
                break;
            case 2:
                await db.dropDatabase();
                console.log('Database cleared.');
                db = client.db('vixen');
                break;
            case 0:
            default:
                console.log('Exiting.');
                process.exit(0);
        }
    }
    const collection = db.collection('botvars');
    const questions = [
        {
            type: 'password',
            name: 'bottoken',
            message: 'What is Vixen\'s bot token?',
            mask: '*'
        },
        {
            type: 'input',
            name: 'clientid',
            message: 'What is Vixen\'s client ID?'
        },
        {
            type: 'password',
            name: 'clientsecret',
            message: 'What is Vixen\'s client secret?',
            mask: '*'
        },
        {
            type: 'input',
            name: 'botowner',
            message: 'What is the Discord user ID of Vixen\'s owner?'
        }
    ]

    const answers = await inquirer.prompt(questions);

    await collection.insertMany([
        {name: 'token', value: answers.bottoken},
        {name: 'clientid', value: answers.clientid},
        {name: 'clientsecret', value: answers.clientsecret},
        {name: 'owner', value: answers.botowner}
    ]);

    await disconnect();

    console.log('First-time setup completed! Vixen is now ready to be used!');
    console.log('It is recommended to run docker-compose down then docker-compose up -d to restart all containers.');
}

run();

function later(delay) {
    return new Promise(resolve => {
        setTimeout(resolve, delay);
    });
}